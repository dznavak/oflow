import type { BoardAdapter, TaskUpdate } from "../../adapters/board/index.js";

interface StateManagerLike {
  initRun(taskId: string): Promise<string>;
  writeTaskContext(taskId: string, context: object): Promise<void>;
}

export async function listTasks(adapter: BoardAdapter): Promise<void> {
  const tasks = await adapter.listAvailableTasks();
  process.stdout.write(JSON.stringify(tasks, null, 2) + "\n");
}

export async function pickTask(
  adapter: BoardAdapter,
  stateManager: StateManagerLike,
  _repoPath: string
): Promise<void> {
  const tasks = await adapter.listAvailableTasks();

  if (tasks.length === 0) {
    throw new Error("No available tasks to pick up");
  }

  const task = await adapter.claimTask(tasks[0].id);
  await stateManager.initRun(task.id);
  await stateManager.writeTaskContext(task.id, {
    id: task.id,
    number: task.number,
    title: task.title,
    description: task.description,
    labels: task.labels,
    workflow: task.workflow,
    url: task.url,
    repoPath: _repoPath,
  });

  process.stdout.write(JSON.stringify(task, null, 2) + "\n");
}

export async function updateTask(
  adapter: BoardAdapter,
  taskId: string,
  update: TaskUpdate
): Promise<void> {
  await adapter.updateTask(taskId, update);
}
