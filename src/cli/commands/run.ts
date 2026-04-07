import { readFile, writeFile, access, appendFile } from "fs/promises";
import { join } from "path";
import { loadConfig } from "../../config/loader.js";
import { GitHubBoardAdapter } from "../../adapters/board/github.js";
import { GitLabBoardAdapter } from "../../adapters/board/gitlab.js";
import { ClaudeCodeAdapter } from "../../adapters/agent/claude-code.js";
import { OpencodeAdapter } from "../../adapters/agent/opencode.js";
import { StateManager } from "../../state/manager.js";
import { Scheduler } from "../../daemon/scheduler.js";
import { poll } from "../../daemon/poller.js";
import type { AgentAdapter } from "../../adapters/agent/index.js";
import type { ChildProcess } from "child_process";

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function makeEventsCallback(taskId: string): (line: string) => void {
  return (line: string) => {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = event.type;
    if (type === "step") {
      console.log(`[task-${taskId}] [step] ${event.step}`);
    } else if (type === "artifact") {
      console.log(`[task-${taskId}] [artifact] ${event.name} — .oflow/runs/${taskId}/${event.path}`);
    } else if (type === "status" && event.tokens !== undefined) {
      console.log(`[task-${taskId}] [status] tokens: ${event.tokens}`);
    }
  };
}

interface EstimateEvent {
  type: "estimate";
  score: number;
  estimated_seconds: number;
}

async function readLastEstimateEvent(eventsFile: string): Promise<EstimateEvent | null> {
  let content: string;
  try {
    content = await readFile(eventsFile, "utf-8");
  } catch {
    return null;
  }
  const lines = content.split("\n").filter(Boolean);
  let last: EstimateEvent | null = null;
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event.type === "estimate" && typeof event.score === "number" && typeof event.estimated_seconds === "number") {
        last = event as unknown as EstimateEvent;
      }
    } catch {
      // skip malformed lines
    }
  }
  return last;
}

async function extractTokensFromLog(logFile: string): Promise<number | null> {
  let content: string;
  try {
    content = await readFile(logFile, "utf-8");
  } catch {
    return null;
  }
  const match = content.match(/Tokens used:\s*(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

async function writeSessionsJson(repoPath: string, scheduler: Scheduler): Promise<void> {
  const sessions = Array.from(scheduler.activeSessions().values()).map((s) => ({
    id: s.id,
    taskId: s.taskId,
    pid: s.pid,
    logFile: s.logFile,
    startedAt: s.startedAt.toISOString(),
  }));
  const sessionsFile = join(repoPath, ".oflow", "sessions.json");
  await writeFile(sessionsFile, JSON.stringify(sessions), "utf-8");
}

export async function runDaemon(repoPath: string, label?: string): Promise<void> {
  const config = loadConfig();
  const board = config.board === "gitlab"
    ? new GitLabBoardAdapter(config)
    : new GitHubBoardAdapter(config);
  const stateManager = new StateManager(repoPath);
  const scheduler = new Scheduler(config.maxConcurrentTasks);
  const tailProcesses = new Map<string, ChildProcess>();

  let agent: AgentAdapter;
  if (config.agent === "opencode") {
    agent = new OpencodeAdapter();
  } else {
    agent = new ClaudeCodeAdapter();
  }

  let running = true;

  const shutdown = async () => {
    log("Shutting down: waiting for active sessions to complete...");
    running = false;
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Initialize task-log.jsonl if it doesn't exist
  const taskLogPath = join(repoPath, ".oflow", "task-log.jsonl");
  try {
    await access(taskLogPath);
  } catch {
    await writeFile(taskLogPath, "", "utf-8");
  }

  log(`oflow daemon started`);
  log(`  board:  ${config.board} / ${config.githubRepo}`);
  log(`  agent:  ${config.agent} (${config.agentModel})`);
  log(`  label:  ${label ?? config.taskLabel}`);
  log(`  slots:  ${config.maxConcurrentTasks}`);
  log(`  poll:   every ${config.pollIntervalSeconds}s`);

  while (running) {
    try {
      const idsBefore = new Set(scheduler.activeSessions().keys());
      await poll(board, scheduler, agent, stateManager, repoPath, label);
      const activesAfter = scheduler.activeSessions().size;

      // Log newly spawned sessions and start tailing their events
      let newTasksStarted = 0;
      for (const [taskId, session] of scheduler.activeSessions()) {
        if (!idsBefore.has(taskId)) {
          log(`Task ${taskId} started — pid ${session.pid}`);
          log(`  log: ${session.logFile}`);
          log(`--- agent output ---`);
          const tailProc = stateManager.tailEvents(taskId, makeEventsCallback(taskId));
          tailProcesses.set(taskId, tailProc);
          newTasksStarted++;
        }
      }
      if (newTasksStarted === 0 && activesAfter === 0) {
        log(`No tasks available. Polling again in ${config.pollIntervalSeconds}s`);
      }

      // Persist active sessions to disk so the status command can read them
      try {
        await writeSessionsJson(repoPath, scheduler);
      } catch (sessErr) {
        log(`Warning: failed to write sessions.json: ${sessErr instanceof Error ? sessErr.message : String(sessErr)}`);
      }

      // Check completed sessions and emit active heartbeats
      for (const [taskId, session] of scheduler.activeSessions()) {
        const status = await agent.getStatus(session.id);
        if (status !== "running") {
          const duration = Math.round((Date.now() - session.startedAt.getTime()) / 1000);
          // Kill the tail process for this task
          const tailProc = tailProcesses.get(taskId);
          if (tailProc) {
            tailProc.kill();
            tailProcesses.delete(taskId);
          }
          // Scan run.log for token summary
          const tokens = await extractTokensFromLog(session.logFile);
          if (tokens !== null) {
            console.log(`[task-${taskId}] [done] tokens: ${tokens}`);
          }
          // Write task-log.jsonl row
          try {
            const eventsFile = stateManager.eventsPath(taskId);
            const estimateEvent = await readLastEstimateEvent(eventsFile);
            const taskContext = await stateManager.readTaskContext(taskId);
            const taskLogRow = {
              task_id: taskId,
              title: taskContext.title,
              complexity_score: estimateEvent ? estimateEvent.score : null,
              estimated_seconds: estimateEvent ? estimateEvent.estimated_seconds : null,
              actual_seconds: duration,
              completed_at: new Date().toISOString(),
              status,
            };
            await appendFile(taskLogPath, JSON.stringify(taskLogRow) + "\n", "utf-8");
          } catch (taskLogErr) {
            log(`Warning: failed to write task-log.jsonl: ${taskLogErr instanceof Error ? taskLogErr.message : String(taskLogErr)}`);
          }
          log(`--- agent output end ---`);
          log(`Task ${taskId} ${status} in ${duration}s`);
          if (status === "failed") {
            log(`  logs: ${session.logFile}`);
          }
          try {
            await board.updateTask(taskId, {
              status: status === "completed" ? "done" : "failed",
              comment: `oflow: task ${status} in ${duration}s`,
            });
          } finally {
            scheduler.removeSession(taskId);
            try {
              await writeSessionsJson(repoPath, scheduler);
            } catch (sessErr) {
              log(`Warning: failed to write sessions.json: ${sessErr instanceof Error ? sessErr.message : String(sessErr)}`);
            }
          }
        } else {
          // Emit active heartbeat for running sessions
          const elapsed = Math.round((Date.now() - session.startedAt.getTime()) / 1000);
          console.log(`[task-${taskId}] [active] ${elapsed}s elapsed`);
        }
      }
    } catch (err) {
      log(`Poll error: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (running) {
      await new Promise((r) => setTimeout(r, config.pollIntervalSeconds * 1000));
    }
  }

  log("Daemon stopped.");
}
