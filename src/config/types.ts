export interface Config {
  board: string;
  githubToken?: string;
  githubRepo?: string;
  gitlabToken?: string;
  gitlabProjectId?: string;
  gitlabUrl?: string;
  taskLabel: string;
  taskInProgressLabel: string;
  taskDoneLabel: string;
  agent: string;
  maxConcurrentTasks: number;
  defaultWorkflow: string;
  pollIntervalSeconds: number;
  stepTimeoutSeconds: number;
}
