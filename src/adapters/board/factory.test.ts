import { describe, it, expect } from "vitest";
import { createBoardAdapter } from "./factory.js";
import { GitHubBoardAdapter } from "./github.js";
import { GitLabBoardAdapter } from "./gitlab.js";
import { JiraBoardAdapter } from "./jira.js";
import type { Config } from "../../config/types.js";

function makeConfig(board: string): Config {
  return {
    board: board as Config["board"],
    githubToken: "gh-token",
    githubRepo: "owner/repo",
    taskLabel: "oflow-ready",
    defaultWorkflow: "dev-workflow",
    maxConcurrentTasks: 1,
    pollIntervalSeconds: 30,
    agent: "claude-code",
    stepTimeoutSeconds: 900,
    gitlabToken: "gl-token",
    gitlabProjectId: "123",
    gitlabUrl: "https://gitlab.com",
    jiraToken: "jira-token",
    jiraUrl: "https://example.atlassian.net",
    jiraEmail: "user@example.com",
    jiraProjectKey: "PROJ",
    jiraReadyStatus: "To Do",
    jiraInProgressStatus: "In Progress",
    jiraDoneStatus: "Done",
    taskInProgressLabel: "",
    taskDoneLabel: "",
  };
}

describe("createBoardAdapter", () => {
  it("returns a GitHubBoardAdapter for board='github'", () => {
    const adapter = createBoardAdapter(makeConfig("github"));
    expect(adapter).toBeInstanceOf(GitHubBoardAdapter);
  });

  it("returns a GitLabBoardAdapter for board='gitlab'", () => {
    const adapter = createBoardAdapter(makeConfig("gitlab"));
    expect(adapter).toBeInstanceOf(GitLabBoardAdapter);
  });

  it("returns a JiraBoardAdapter for board='jira'", () => {
    const adapter = createBoardAdapter(makeConfig("jira"));
    expect(adapter).toBeInstanceOf(JiraBoardAdapter);
  });

  it("throws a descriptive error for an unsupported board value", () => {
    expect(() => createBoardAdapter(makeConfig("linear" as Config["board"]))).toThrow(
      /unsupported board.*linear/i
    );
  });
});
