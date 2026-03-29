import { readFile } from "fs/promises";
import { join } from "path";
import type { Session } from "../../adapters/agent/index.js";

interface StoredSession extends Omit<Session, "startedAt"> {
  startedAt: string;
}

export async function showStatus(repoPath: string): Promise<void> {
  const sessionsFile = join(repoPath, ".oflow", "sessions.json");

  let sessions: StoredSession[] = [];
  try {
    const content = await readFile(sessionsFile, "utf-8");
    sessions = JSON.parse(content) as StoredSession[];
  } catch {
    console.log("No active sessions found.");
    return;
  }

  if (sessions.length === 0) {
    console.log("No active sessions.");
    return;
  }

  console.log("Active sessions:");
  console.log("─".repeat(70));
  for (const session of sessions) {
    console.log(
      `Task: ${session.taskId}  PID: ${session.pid}  Started: ${session.startedAt}`
    );
    console.log(`  Log: ${session.logFile}`);
  }
  console.log("─".repeat(70));
}
