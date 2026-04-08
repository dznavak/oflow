export type BoardType = "github" | "gitlab" | "jira";

export interface Config {
  board: BoardType;
  githubToken?: string;
  githubRepo?: string;
  gitlabToken?: string;
  gitlabProjectId?: string;
  gitlabUrl?: string;
  jiraToken?: string;
  jiraUrl?: string;
  jiraEmail?: string;
  jiraProjectKey?: string;
  jiraBoardId?: string;
  jiraReadyStatus?: string;
  jiraInProgressStatus?: string;
  jiraDoneStatus?: string;
  taskLabel: string;
  taskInProgressLabel: string;
  taskDoneLabel: string;
  agent: string;
  maxConcurrentTasks: number;
  defaultWorkflow: string;
  pollIntervalSeconds: number;
  stepTimeoutSeconds: number;
}
