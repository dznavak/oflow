import type { Session } from "../adapters/agent/index.js";

export class Scheduler {
  private sessions: Map<string, Session> = new Map();

  constructor(private maxConcurrent: number) {}

  hasSlot(): boolean {
    return this.sessions.size < this.maxConcurrent;
  }

  addSession(taskId: string, session: Session): void {
    this.sessions.set(taskId, session);
  }

  removeSession(taskId: string): void {
    this.sessions.delete(taskId);
  }

  activeSessions(): Map<string, Session> {
    return new Map(this.sessions);
  }
}
