import { readFile } from "fs/promises";
import { join } from "path";
import type { Session } from "../../adapters/agent/index.js";

interface StoredSession extends Omit<Session, "startedAt"> {
  startedAt: string;
}

interface TaskLogRow {
  task_id: string;
  title?: string;
  status: string;
  completed_at?: string;
  actual_seconds?: number;
  [key: string]: unknown;
}

const RECENT_FAILURES_LIMIT = 10;

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
  } else {
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

  // Read and display recent failures / timeouts from task-log.jsonl
  const taskLogPath = join(repoPath, ".oflow", "task-log.jsonl");
  let taskLogContent: string;
  try {
    taskLogContent = await readFile(taskLogPath, "utf-8");
  } catch {
    return;
  }

  const allRows: TaskLogRow[] = taskLogContent
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      try {
        return JSON.parse(line) as TaskLogRow;
      } catch {
        return null;
      }
    })
    .filter((row): row is TaskLogRow => row !== null);

  const failureRows = allRows
    .filter((row) => row.status === "failed" || row.status === "timed-out")
    .slice(-RECENT_FAILURES_LIMIT);

  if (failureRows.length === 0) {
    return;
  }

  console.log("");
  console.log("Recent failures / timeouts:");
  console.log("─".repeat(70));
  for (const row of failureRows) {
    const title = row.title ?? "(no title)";
    const duration = row.actual_seconds != null ? `${row.actual_seconds}s` : "?s";
    const at = row.completed_at ?? "unknown time";
    console.log(`Task: ${row.task_id}  [${row.status}]  ${title}`);
    console.log(`  Duration: ${duration}  At: ${at}`);
  }
  console.log("─".repeat(70));
}
