import { spawn } from "child_process";
import { readFile, writeFile, open } from "fs/promises";
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

  async spawn(options: SpawnOptions): Promise<Session> {
    const { skill, taskContextFile, repoPath, taskId, logFile } = options;

    const skillContent = await readFile(skill, "utf-8");
    const taskContext = await readFile(taskContextFile, "utf-8");

    const prompt = `${skillContent}\n\nTask context:\n${taskContext}`;

    const logFd = await open(logFile, "a");
    const logStream = logFd.createWriteStream();

    const claudeCmd = process.env.OFLOW_CLAUDE_CMD ?? "claude";
    const child = spawn(claudeCmd, ["-p", "--dangerously-skip-permissions"], {
      cwd: repoPath,
      env: {
        ...process.env,
        OFLOW_CURRENT_TASK_ID: taskId,
      },
      stdio: ["pipe", "pipe", "pipe"],
      detached: false,
    });

    // Write prompt via stdin so YAML frontmatter is not parsed as CLI flags
    child.stdin.write(prompt);
    child.stdin.end();

    // Prefix each output line with [task-X] and stream to both log file and stdout
    const prefix = `[task-${taskId}] `;
    const makePrefixer = () =>
      new Transform({
        transform(chunk, _enc, cb) {
          const lines = chunk.toString().split("\n");
          const prefixed = lines
            .map((l: string) => (l ? prefix + l : l))
            .join("\n");
          this.push(prefixed);
          cb();
        },
      });

    const stdoutPrefixer = makePrefixer();
    const stderrPrefixer = makePrefixer();

    if (child.stdout) {
      child.stdout.pipe(stdoutPrefixer);
      stdoutPrefixer.pipe(logStream, { end: false });
      stdoutPrefixer.pipe(process.stdout, { end: false });
    }
    if (child.stderr) {
      child.stderr.pipe(stderrPrefixer);
      stderrPrefixer.pipe(logStream, { end: false });
      stderrPrefixer.pipe(process.stderr, { end: false });
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
      this.exitCodes.set(session.id, code ?? 1);
      logStream.end();
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
    const startTime = Date.now();
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { status: "failed", exitCode: -1, duration: 0 };
    }

    return new Promise((resolve) => {
      const checkInterval = setInterval(async () => {
        const status = await this.getStatus(sessionId);
        if (status !== "running") {
          clearInterval(checkInterval);
          const exitCode = this.exitCodes.get(sessionId) ?? (status === "completed" ? 0 : 1);
          resolve({
            status: status === "completed" ? "completed" : "failed",
            exitCode,
            duration: Date.now() - startTime,
          });
        }
      }, 1000);
    });
  }

  async getLogs(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    return readFile(session.logFile, "utf-8");
  }

  async writeSessionsFile(path: string): Promise<void> {
    const sessions = Array.from(this.sessions.values()).map((s) => ({
      ...s,
      startedAt: s.startedAt.toISOString(),
    }));
    await writeFile(path, JSON.stringify(sessions, null, 2), "utf-8");
  }
}
