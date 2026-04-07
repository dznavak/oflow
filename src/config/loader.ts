import { z } from "zod";
import type { Config } from "./types.js";

const baseSchema = z.object({
  OFLOW_BOARD: z.string({ required_error: "OFLOW_BOARD is required" }),
  OFLOW_TASK_LABEL: z.string().default("oflow-ready"),
  OFLOW_TASK_IN_PROGRESS_LABEL: z.string().default("oflow-in-progress"),
  OFLOW_TASK_DONE_LABEL: z.string().default("oflow-done"),
  OFLOW_AGENT: z.string().default("claude-code"),
  OFLOW_AGENT_MODEL: z.string().default("claude-opus-4-6"),
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

export function loadConfig(): Config {

  const baseResult = baseSchema.safeParse(process.env);
  if (!baseResult.success) {
    const messages = baseResult.error.issues.map((i) => i.message).join("; ");
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
      agentModel: base.OFLOW_AGENT_MODEL,
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
      agentModel: base.OFLOW_AGENT_MODEL,
      maxConcurrentTasks: base.OFLOW_MAX_CONCURRENT_TASKS,
      defaultWorkflow: base.OFLOW_DEFAULT_WORKFLOW,
      pollIntervalSeconds: base.OFLOW_POLL_INTERVAL_SECONDS,
      stepTimeoutSeconds: base.OFLOW_STEP_TIMEOUT_SECONDS,
    };
  }

  return {
    board: base.OFLOW_BOARD,
    taskLabel: base.OFLOW_TASK_LABEL,
    taskInProgressLabel: base.OFLOW_TASK_IN_PROGRESS_LABEL,
    taskDoneLabel: base.OFLOW_TASK_DONE_LABEL,
    agent: base.OFLOW_AGENT,
    agentModel: base.OFLOW_AGENT_MODEL,
    maxConcurrentTasks: base.OFLOW_MAX_CONCURRENT_TASKS,
    defaultWorkflow: base.OFLOW_DEFAULT_WORKFLOW,
    pollIntervalSeconds: base.OFLOW_POLL_INTERVAL_SECONDS,
    stepTimeoutSeconds: base.OFLOW_STEP_TIMEOUT_SECONDS,
  };
}
