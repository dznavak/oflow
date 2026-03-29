export type SessionStatus = "running" | "completed" | "failed";

export interface Session {
  id: string;
  taskId: string;
  pid: number;
  logFile: string;
  startedAt: Date;
}

export interface SessionResult {
  status: "completed" | "failed";
  exitCode: number;
  duration: number;
}

export interface SpawnOptions {
  skill: string;
  taskContextFile: string;
  repoPath: string;
  taskId: string;
  logFile: string;
}

export interface AgentAdapter {
  spawn(options: SpawnOptions): Promise<Session>;
  getStatus(sessionId: string): Promise<SessionStatus>;
  waitForCompletion(sessionId: string): Promise<SessionResult>;
  getLogs(sessionId: string): Promise<string>;
}
