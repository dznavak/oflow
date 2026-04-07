import { spawn } from "child_process";
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

    // Track exit code so getStatus can report failed vs completed accurately
    child.on("close", (code) => {
      const exitCode = code ?? 1;
      this.exitCodes.set(session.id, exitCode);
      tail.kill();
      logFd.close();

      const resolver = this.completionResolvers.get(session.id);
      if (resolver) {
        this.completionResolvers.delete(session.id);
        resolver({
          status: exitCode === 0 ? "completed" : "failed",
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
      return this.exitCodes.get(sessionId) === 0 ? "completed" : "failed";
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
        status: exitCode === 0 ? "completed" : "failed",
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

}
