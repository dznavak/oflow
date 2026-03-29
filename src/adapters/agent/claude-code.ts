import { spawn } from "child_process";
import { readFile, writeFile, open } from "fs/promises";
import { randomUUID } from "crypto";
import type {
  AgentAdapter,
  Session,
  SessionResult,
  SessionStatus,
  SpawnOptions,
} from "./index.js";

export class ClaudeCodeAdapter implements AgentAdapter {
  private sessions: Map<string, Session> = new Map();

  async spawn(options: SpawnOptions): Promise<Session> {
    const { skill, taskContextFile, repoPath, taskId, logFile } = options;

    const skillContent = await readFile(skill, "utf-8");
    const taskContext = await readFile(taskContextFile, "utf-8");

    const prompt = `${skillContent}\n\nTask context: ${taskContext}`;

    const logFd = await open(logFile, "a");
    const logStream = logFd.createWriteStream();

    const claudeCmd = process.env.OFLOW_CLAUDE_CMD ?? "claude";
    const child = spawn(claudeCmd, ["--print", prompt], {
      cwd: repoPath,
      env: {
        ...process.env,
        OFLOW_CURRENT_TASK_ID: taskId,
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: false,
    });

    if (child.stdout) child.stdout.pipe(logStream);
    if (child.stderr) child.stderr.pipe(logStream);

    child.unref();

    const session: Session = {
      id: randomUUID(),
      taskId,
      pid: child.pid ?? 0,
      logFile,
      startedAt: new Date(),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  async getStatus(sessionId: string): Promise<SessionStatus> {
    const session = this.sessions.get(sessionId);
    if (!session) return "failed";

    try {
      process.kill(session.pid, 0);
      return "running";
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "ESRCH") {
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
          resolve({
            status: status === "completed" ? "completed" : "failed",
            exitCode: status === "completed" ? 0 : 1,
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
