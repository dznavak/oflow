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

export async function runDaemon(repoPath: string): Promise<void> {
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

  log(`oflow daemon started. Max concurrent: ${config.maxConcurrentTasks}`);

  while (running) {
    try {
      await poll(board, scheduler, agent, stateManager, config, repoPath);

      // Check completed sessions
      for (const [taskId, session] of scheduler.activeSessions()) {
        const status = await agent.getStatus(session.id);
        if (status !== "running") {
          log(`Task ${taskId} ${status}`);
          await board.updateTask(taskId, {
            status: status === "completed" ? "done" : "failed",
            comment: `oflow: task ${status}`,
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
