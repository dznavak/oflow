import { join } from "path";
import type { BoardAdapter } from "../adapters/board/index.js";
import type { AgentAdapter } from "../adapters/agent/index.js";
import type { Config } from "../config/types.js";
import type { Scheduler } from "./scheduler.js";
import type { StateManager } from "../state/manager.js";

interface SchedulerLike {
  hasSlot(): boolean;
  addSession(taskId: string, session: { id: string; taskId: string; pid: number; logFile: string; startedAt: Date }): void;
  removeSession(taskId: string): void;
  activeSessions(): Map<string, { id: string; taskId: string; pid: number; logFile: string; startedAt: Date }>;
}

export async function poll(
  board: BoardAdapter,
  scheduler: Scheduler | SchedulerLike,
  agent: AgentAdapter,
  stateManager: StateManager | { initRun: (id: string) => Promise<string>; writeTaskContext: (id: string, ctx: object) => Promise<void>; getRunDir: (id: string) => string },
  config: Config,
  repoPath: string
): Promise<void> {
  if (!scheduler.hasSlot()) {
    return;
  }

  const tasks = await board.listAvailableTasks();
  if (tasks.length === 0) {
    return;
  }

  const task = tasks[0];
  const claimedTask = await board.claimTask(task.id);

  const runDir = await stateManager.initRun(claimedTask.id);
  await stateManager.writeTaskContext(claimedTask.id, {
    id: claimedTask.id,
    number: claimedTask.number,
    title: claimedTask.title,
    description: claimedTask.description,
    labels: claimedTask.labels,
    workflow: claimedTask.workflow,
    url: claimedTask.url,
    repoPath,
    runDir,
  });

  const skillFile = join(repoPath, "skills", `${claimedTask.workflow}.md`);
  const taskContextFile = join(runDir, "task-context.json");
  const logFile = join(runDir, "run.log");

  const session = await agent.spawn({
    skill: skillFile,
    taskContextFile,
    repoPath,
    taskId: claimedTask.id,
    logFile,
  });

  scheduler.addSession(claimedTask.id, session);
}
