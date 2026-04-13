import { z } from "zod";
import { exec } from "node:child_process";
import type { Config } from "./types.js";

const baseSchema = z.object({
  OFLOW_BOARD: z.enum(["github", "gitlab", "jira"], {
    message: "OFLOW_BOARD must be one of: github, gitlab, jira",
  }).default("github"),
  OFLOW_TASK_LABEL: z.string().default("oflow-ready"),
  OFLOW_TASK_IN_PROGRESS_LABEL: z.string().default("oflow-in-progress"),
  OFLOW_TASK_DONE_LABEL: z.string().default("oflow-done"),
  OFLOW_AGENT: z.string().default("claude-code"),
  OFLOW_MAX_CONCURRENT_TASKS: z
    .string()
    .default("1")
    .transform((v) => parseInt(v, 10)),
  OFLOW_DEFAULT_WORKFLOW: z.string().default("dev-workflow"),
  OFLOW_POLL_INTERVAL_SECONDS: z
    .string()
    .default("60")
    .transform((v) => parseInt(v, 10)),
  OFLOW_STEP_TIMEOUT_SECONDS: z
    .string()
    .default("900")
    .transform((v) => parseInt(v, 10)),
});

const githubSchema = z.object({
  OFLOW_GITHUB_TOKEN: z.string({
    required_error: "OFLOW_GITHUB_TOKEN is required when OFLOW_BOARD=github",
  }),
  OFLOW_GITHUB_REPO: z.string({
    required_error: "OFLOW_GITHUB_REPO is required when OFLOW_BOARD=github",
  }),
});

const gitlabSchema = z.object({
  OFLOW_GITLAB_TOKEN: z.string({
    required_error: "OFLOW_GITLAB_TOKEN is required when OFLOW_BOARD=gitlab",
  }),
  OFLOW_GITLAB_PROJECT_ID: z.string({
    required_error: "OFLOW_GITLAB_PROJECT_ID is required when OFLOW_BOARD=gitlab",
  }),
  OFLOW_GITLAB_URL: z.string().default("https://gitlab.com/api/v4"),
});

const jiraSchema = z.object({
  OFLOW_JIRA_TOKEN: z.string({
    required_error: "OFLOW_JIRA_TOKEN is required when OFLOW_BOARD=jira",
  }),
  OFLOW_JIRA_URL: z.string({
    required_error: "OFLOW_JIRA_URL is required when OFLOW_BOARD=jira",
  }),
  OFLOW_JIRA_EMAIL: z.string({
    required_error: "OFLOW_JIRA_EMAIL is required when OFLOW_BOARD=jira",
  }),
  OFLOW_JIRA_PROJECT_KEY: z.string({
    required_error: "OFLOW_JIRA_PROJECT_KEY is required when OFLOW_BOARD=jira",
  }),
  OFLOW_JIRA_READY_STATUS: z.string().default("To Do"),
  OFLOW_JIRA_IN_PROGRESS_STATUS: z.string().default("In Progress"),
  OFLOW_JIRA_DONE_STATUS: z.string().default("Done"),
  OFLOW_JIRA_BOARD_ID: z.string().optional(),
});

export function loadConfig(): Config {

  const baseResult = baseSchema.safeParse(process.env);
  if (!baseResult.success) {
    const messages = baseResult.error.issues.map((i) => i.message).join("; ");
    // Provide a descriptive error if the board value is not in the union
    const boardIssue = baseResult.error.issues.find((i) =>
      i.path.includes("OFLOW_BOARD")
    );
    if (boardIssue && process.env.OFLOW_BOARD) {
      throw new Error(
        `Configuration error: Unsupported board "${process.env.OFLOW_BOARD}". Must be one of: github, gitlab, jira`
      );
    }
    throw new Error(`Configuration error: ${messages}`);
  }

  const base = baseResult.data;

  if (base.OFLOW_BOARD === "github") {
    const ghResult = githubSchema.safeParse(process.env);
    if (!ghResult.success) {
      const messages = ghResult.error.issues.map((i) => i.message).join("; ");
      throw new Error(`Configuration error: ${messages}`);
    }

    const gh = ghResult.data;
    return {
      board: base.OFLOW_BOARD,
      githubToken: gh.OFLOW_GITHUB_TOKEN,
      githubRepo: gh.OFLOW_GITHUB_REPO,
      taskLabel: base.OFLOW_TASK_LABEL,
      taskInProgressLabel: base.OFLOW_TASK_IN_PROGRESS_LABEL,
      taskDoneLabel: base.OFLOW_TASK_DONE_LABEL,
      agent: base.OFLOW_AGENT,
      maxConcurrentTasks: base.OFLOW_MAX_CONCURRENT_TASKS,
      defaultWorkflow: base.OFLOW_DEFAULT_WORKFLOW,
      pollIntervalSeconds: base.OFLOW_POLL_INTERVAL_SECONDS,
      stepTimeoutSeconds: base.OFLOW_STEP_TIMEOUT_SECONDS,
    };
  }

  if (base.OFLOW_BOARD === "gitlab") {
    const glResult = gitlabSchema.safeParse(process.env);
    if (!glResult.success) {
      const messages = glResult.error.issues.map((i) => i.message).join("; ");
      throw new Error(`Configuration error: ${messages}`);
    }

    const gl = glResult.data;
    return {
      board: base.OFLOW_BOARD,
      gitlabToken: gl.OFLOW_GITLAB_TOKEN,
      gitlabProjectId: gl.OFLOW_GITLAB_PROJECT_ID,
      gitlabUrl: gl.OFLOW_GITLAB_URL,
      taskLabel: base.OFLOW_TASK_LABEL,
      taskInProgressLabel: base.OFLOW_TASK_IN_PROGRESS_LABEL,
      taskDoneLabel: base.OFLOW_TASK_DONE_LABEL,
      agent: base.OFLOW_AGENT,
      maxConcurrentTasks: base.OFLOW_MAX_CONCURRENT_TASKS,
      defaultWorkflow: base.OFLOW_DEFAULT_WORKFLOW,
      pollIntervalSeconds: base.OFLOW_POLL_INTERVAL_SECONDS,
      stepTimeoutSeconds: base.OFLOW_STEP_TIMEOUT_SECONDS,
    };
  }

  if (base.OFLOW_BOARD === "jira") {
  const jiraResult = jiraSchema.safeParse(process.env);
  if (!jiraResult.success) {
    const messages = jiraResult.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Configuration error: ${messages}`);
  }

  const jira = jiraResult.data;
  return {
    board: base.OFLOW_BOARD,
    jiraToken: jira.OFLOW_JIRA_TOKEN,
    jiraUrl: jira.OFLOW_JIRA_URL,
    jiraEmail: jira.OFLOW_JIRA_EMAIL,
    jiraProjectKey: jira.OFLOW_JIRA_PROJECT_KEY,
    jiraBoardId: jira.OFLOW_JIRA_BOARD_ID,
    jiraReadyStatus: jira.OFLOW_JIRA_READY_STATUS,
    jiraInProgressStatus: jira.OFLOW_JIRA_IN_PROGRESS_STATUS,
    jiraDoneStatus: jira.OFLOW_JIRA_DONE_STATUS,
    taskLabel: base.OFLOW_TASK_LABEL,
    taskInProgressLabel: base.OFLOW_TASK_IN_PROGRESS_LABEL,
    taskDoneLabel: base.OFLOW_TASK_DONE_LABEL,
    agent: base.OFLOW_AGENT,
    maxConcurrentTasks: base.OFLOW_MAX_CONCURRENT_TASKS,
    defaultWorkflow: base.OFLOW_DEFAULT_WORKFLOW,
    pollIntervalSeconds: base.OFLOW_POLL_INTERVAL_SECONDS,
    stepTimeoutSeconds: base.OFLOW_STEP_TIMEOUT_SECONDS,
  };
  }

  // Exhaustive guard: OFLOW_BOARD enum only allows github/gitlab/jira, so this
  // is unreachable in practice. It prevents silent fall-through if a new board
  // type is added to the enum without a corresponding config branch.
  throw new Error(`Configuration error: Unsupported board "${base.OFLOW_BOARD}"`);
}

/**
 * Resolves the Jira API token. Checks OFLOW_JIRA_TOKEN env var first;
 * falls back to macOS keychain (`security find-generic-password -s oflow-jira -w`).
 * Returns undefined if neither source has the token.
 */
export async function loadJiraToken(): Promise<string | undefined> {
  if (process.env.OFLOW_JIRA_TOKEN) {
    return process.env.OFLOW_JIRA_TOKEN;
  }

  return new Promise<string | undefined>((resolve) => {
    exec(
      "security find-generic-password -s oflow-jira -w",
      (error, stdout) => {
        if (error) {
          // Non-zero exit means the item was not found — treat as "not found"
          resolve(undefined);
          return;
        }
        resolve(stdout.trim() || undefined);
      }
    );
  });
}
