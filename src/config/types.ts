export interface Config {
  board: string;
  githubToken?: string;
  githubRepo?: string;
  taskLabel: string;
  taskInProgressLabel: string;
  taskDoneLabel: string;
  agent: string;
  agentModel: string;
  maxConcurrentTasks: number;
  defaultWorkflow: string;
  pollIntervalSeconds: number;
}
