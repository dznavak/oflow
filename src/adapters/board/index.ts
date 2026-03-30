export interface Task {
  id: string;
  number: number;
  title: string;
  description: string;
  labels: string[];
  url: string;
  workflow: string;
}

export interface TaskUpdate {
  status?: "in-progress" | "done" | "failed";
  comment?: string;
}

export interface BoardAdapter {
  listAvailableTasks(): Promise<Task[]>;
  claimTask(taskId: string): Promise<Task>;
  updateTask(taskId: string, update: TaskUpdate): Promise<void>;
  getTask(taskId: string): Promise<Task>;
}
