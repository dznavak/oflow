import { loadConfig } from "../../config/loader.js";
import { GitHubBoardAdapter } from "../../adapters/board/github.js";
import { ClaudeCodeAdapter } from "../../adapters/agent/claude-code.js";
import { OpencodeAdapter } from "../../adapters/agent/opencode.js";
import { StateManager } from "../../state/manager.js";
import { Scheduler } from "../../daemon/scheduler.js";
import { poll } from "../../daemon/poller.js";
import type { AgentAdapter } from "../../adapters/agent/index.js";

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

export async function runDaemon(repoPath: string, label?: string): Promise<void> {
  const config = loadConfig();
  const board = new GitHubBoardAdapter(config);
  const stateManager = new StateManager(repoPath);
  const scheduler = new Scheduler(config.maxConcurrentTasks);

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

  log(`oflow daemon started`);
  log(`  board:  ${config.board} / ${config.githubRepo}`);
  log(`  agent:  ${config.agent} (${config.agentModel})`);
  log(`  label:  ${label ?? config.taskLabel}`);
  log(`  slots:  ${config.maxConcurrentTasks}`);
  log(`  poll:   every ${config.pollIntervalSeconds}s`);

  while (running) {
    try {
      const activesBefore = scheduler.activeSessions().size;
      await poll(board, scheduler, agent, stateManager, config, repoPath, label);
      const activesAfter = scheduler.activeSessions().size;

      // Log newly spawned sessions
      if (activesAfter > activesBefore) {
        for (const [taskId, session] of scheduler.activeSessions()) {
          log(`Task ${taskId} started — pid ${session.pid}`);
          log(`  log: ${session.logFile}`);
          log(`--- agent output ---`);
        }
      } else if (activesAfter === 0) {
        log(`No tasks available. Polling again in ${config.pollIntervalSeconds}s`);
      }

      // Check completed sessions
      for (const [taskId, session] of scheduler.activeSessions()) {
        const status = await agent.getStatus(session.id);
        if (status !== "running") {
          const duration = Math.round((Date.now() - session.startedAt.getTime()) / 1000);
          log(`--- agent output end ---`);
          log(`Task ${taskId} ${status} in ${duration}s`);
          if (status === "failed") {
            log(`  logs: ${session.logFile}`);
          }
          await board.updateTask(taskId, {
            status: status === "completed" ? "done" : "failed",
            comment: `oflow: task ${status} in ${duration}s`,
          });
          scheduler.removeSession(taskId);
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
