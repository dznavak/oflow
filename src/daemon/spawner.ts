import { join } from "path";
import type { BoardAdapter, Task } from "../adapters/board/index.js";
import type { AgentAdapter, Session } from "../adapters/agent/index.js";
import type { StateManager } from "../state/manager.js";

export async function spawnTaskSession(
  task: Task,
  board: BoardAdapter,
  agent: AgentAdapter,
  stateManager: StateManager,
  repoPath: string
): Promise<Session> {
  const runDir = await stateManager.initRun(task.id);

  await stateManager.writeTaskContext(task.id, {
    id: task.id,
    number: task.number,
    title: task.title,
    description: task.description,
    labels: task.labels,
    workflow: task.workflow,
    url: task.url,
    repoPath,
    runDir,
  });

  const skillFile = join(repoPath, "skills", `${task.workflow}.md`);
  const taskContextFile = join(runDir, "task-context.json");
  const logFile = join(runDir, "run.log");

  const session = await agent.spawn({
    skill: skillFile,
    taskContextFile,
    repoPath,
    taskId: task.id,
    logFile,
  });

  return session;
}
