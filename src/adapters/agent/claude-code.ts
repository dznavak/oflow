import { spawn, type ChildProcess } from "child_process";
import { readFile, open } from "fs/promises";
import { randomUUID } from "crypto";
import { Transform } from "stream";
import type {
  AgentAdapter,
  Session,
  SessionResult,
  SessionStatus,
  SpawnOptions,
} from "./index.js";

export class ClaudeCodeAdapter implements AgentAdapter {
  private sessions: Map<string, Session> = new Map();
  private exitCodes: Map<string, number> = new Map();
  private completionResolvers: Map<string, (result: SessionResult) => void> = new Map();
  private children: Map<string, ChildProcess> = new Map();

  async spawn(options: SpawnOptions): Promise<Session> {
    const { skill, taskContextFile, repoPath, taskId, logFile } = options;

    const skillContent = await readFile(skill, "utf-8");
    const taskContext = await readFile(taskContextFile, "utf-8");

    const prompt = `${skillContent}\n\nTask context:\n${taskContext}`;

    // Open log file for direct fd writes — bypasses the Node.js event loop so
    // output is captured even if the daemon process is paused (e.g. ^Z).
    const logFd = await open(logFile, "a");

    const claudeCmd = process.env.OFLOW_CLAUDE_CMD ?? "claude";
    const child = spawn(claudeCmd, ["-p", "--dangerously-skip-permissions"], {
      cwd: repoPath,
      env: {
        ...process.env,
        OFLOW_CURRENT_TASK_ID: taskId,
      },
      // Write stdout/stderr directly to the log file fd, bypassing Node.js
      // streams.  This ensures every byte reaches disk regardless of whether
      // the daemon's event loop is running.
      stdio: ["pipe", logFd.fd, logFd.fd],
      detached: false,
    });

    // Write prompt via stdin so YAML frontmatter is not parsed as CLI flags
    // stdin is always non-null because we spawned with stdio: ["pipe", ...]
    child.stdin!.write(prompt);
    child.stdin!.end();

    // Tail the log file to stream output to the terminal (best-effort).
    // Using a separate tail process decouples terminal display from the log
    // write, so backpressure on process.stdout never blocks the log.
    const prefix = `[task-${taskId}] `;
    const tail = spawn("tail", ["-f", "-n", "0", logFile], {
      stdio: ["ignore", "pipe", "ignore"],
    });

    const prefixer = new Transform({
      transform(chunk, _enc, cb) {
        const lines = chunk.toString().split("\n");
        const prefixed = lines
          .map((l: string) => (l ? prefix + l : l))
          .join("\n");
        this.push(prefixed);
        cb();
      },
    });

    if (tail.stdout) {
      tail.stdout.pipe(prefixer).pipe(process.stdout, { end: false });
    }

    const session: Session = {
      id: randomUUID(),
      taskId,
      pid: child.pid ?? 0,
      logFile,
      startedAt: new Date(),
    };

    // Store child reference so kill() can SIGTERM it later
    this.children.set(session.id, child);

    // Track exit code so getStatus can report failed vs completed accurately
    child.on("close", (code) => {
      this.children.delete(session.id);
      // If kill() already set exitCode to -1 (timed-out sentinel) and deleted
      // the resolver, this handler is a no-op — do not overwrite the sentinel
      // and do not attempt to call a resolver that no longer exists.
      if (this.exitCodes.get(session.id) === -1) {
        tail.kill();
        logFd.close();
        return;
      }
      const exitCode = code ?? 1;
      this.exitCodes.set(session.id, exitCode);
      tail.kill();
      logFd.close();

      const resolver = this.completionResolvers.get(session.id);
      if (resolver) {
        this.completionResolvers.delete(session.id);
        resolver({
          status: exitCode === -1 ? "timed-out" : exitCode === 0 ? "completed" : "failed",
          exitCode,
          duration: Date.now() - session.startedAt.getTime(),
        });
      }
    });

    this.sessions.set(session.id, session);
    return session;
  }

  async getStatus(sessionId: string): Promise<SessionStatus> {
    const session = this.sessions.get(sessionId);
    if (!session) return "failed";

    if (this.exitCodes.has(sessionId)) {
      const exitCode = this.exitCodes.get(sessionId)!;
      if (exitCode === -1) return "timed-out";
      return exitCode === 0 ? "completed" : "failed";
    }

    try {
      process.kill(session.pid, 0);
      return "running";
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ESRCH") {
        // Process gone but no exit code recorded yet — treat as completed
        return "completed";
      }
      return "failed";
    }
  }

  async waitForCompletion(sessionId: string): Promise<SessionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { status: "failed", exitCode: -1, duration: 0 };
    }

    if (this.exitCodes.has(sessionId)) {
      const exitCode = this.exitCodes.get(sessionId)!;
      return {
        status: exitCode === -1 ? "timed-out" : exitCode === 0 ? "completed" : "failed",
        exitCode,
        duration: Date.now() - session.startedAt.getTime(),
      };
    }

    return new Promise((resolve) => {
      this.completionResolvers.set(sessionId, resolve);
    });
  }

  async getLogs(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    return readFile(session.logFile, "utf-8");
  }

  async kill(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Set the timed-out sentinel BEFORE sending SIGTERM so that getStatus()
    // returns "timed-out" on the very next poll tick, even if the process has
    // not yet exited.
    this.exitCodes.set(sessionId, -1);

    // Resolve the waiting promise (if any) immediately with a timed-out result
    // so the daemon's waitForCompletion() call unblocks without waiting for the
    // close event.  We delete the resolver first so the close handler sees it
    // is gone and skips its own resolver call (preventing any double-resolve).
    const resolver = this.completionResolvers.get(sessionId);
    if (resolver) {
      this.completionResolvers.delete(sessionId);
      resolver({
        status: "timed-out",
        exitCode: -1,
        duration: Date.now() - session.startedAt.getTime(),
      });
    }

    // Send SIGTERM only — MVP choice. SIGKILL after a grace period could be
    // added later if the child process is known to ignore SIGTERM, but that
    // added complexity is out of scope for now.
    const child = this.children.get(sessionId);
    if (child) {
      child.kill("SIGTERM");
    }
  }
}
