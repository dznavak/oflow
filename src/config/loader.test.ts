import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadConfig, loadJiraToken } from "./loader.js";

vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Remove all OFLOW_ vars to start clean
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("OFLOW_")) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults OFLOW_BOARD to 'github' when not set", () => {
    process.env.OFLOW_GITHUB_TOKEN = "ghp_test";
    process.env.OFLOW_GITHUB_REPO = "owner/repo";
    const config = loadConfig();
    expect(config.board).toBe("github");
  });

  it("throws if OFLOW_GITHUB_TOKEN is missing when board=github", () => {
    process.env.OFLOW_BOARD = "github";
    process.env.OFLOW_GITHUB_REPO = "owner/repo";
    expect(() => loadConfig()).toThrow(/OFLOW_GITHUB_TOKEN/);
  });

  it("throws if OFLOW_GITHUB_REPO is missing when board=github", () => {
    process.env.OFLOW_BOARD = "github";
    process.env.OFLOW_GITHUB_TOKEN = "ghp_test";
    expect(() => loadConfig()).toThrow(/OFLOW_GITHUB_REPO/);
  });

  it("returns typed config when all required fields present", () => {
    process.env.OFLOW_BOARD = "github";
    process.env.OFLOW_GITHUB_TOKEN = "ghp_test";
    process.env.OFLOW_GITHUB_REPO = "owner/repo";

    const config = loadConfig();

    expect(config.board).toBe("github");
    expect(config.githubToken).toBe("ghp_test");
    expect(config.githubRepo).toBe("owner/repo");
  });

  it("uses defaults for optional fields", () => {
    process.env.OFLOW_BOARD = "github";
    process.env.OFLOW_GITHUB_TOKEN = "ghp_test";
    process.env.OFLOW_GITHUB_REPO = "owner/repo";

    const config = loadConfig();

    expect(config.maxConcurrentTasks).toBe(1);
    expect(config.pollIntervalSeconds).toBe(60);
    expect(config.taskLabel).toBe("oflow-ready");
    expect(config.taskInProgressLabel).toBe("oflow-in-progress");
    expect(config.taskDoneLabel).toBe("oflow-done");
    expect(config.defaultWorkflow).toBe("dev-workflow");
  });

  it("respects overridden optional fields", () => {
    process.env.OFLOW_BOARD = "github";
    process.env.OFLOW_GITHUB_TOKEN = "ghp_test";
    process.env.OFLOW_GITHUB_REPO = "owner/repo";
    process.env.OFLOW_MAX_CONCURRENT_TASKS = "3";
    process.env.OFLOW_POLL_INTERVAL_SECONDS = "30";

    const config = loadConfig();

    expect(config.maxConcurrentTasks).toBe(3);
    expect(config.pollIntervalSeconds).toBe(30);
  });

  it("defaults stepTimeoutSeconds to 900 for github board", () => {
    process.env.OFLOW_BOARD = "github";
    process.env.OFLOW_GITHUB_TOKEN = "ghp_test";
    process.env.OFLOW_GITHUB_REPO = "owner/repo";

    const config = loadConfig();

    expect(config.stepTimeoutSeconds).toBe(900);
  });

  it("respects overridden OFLOW_STEP_TIMEOUT_SECONDS for github board", () => {
    process.env.OFLOW_BOARD = "github";
    process.env.OFLOW_GITHUB_TOKEN = "ghp_test";
    process.env.OFLOW_GITHUB_REPO = "owner/repo";
    process.env.OFLOW_STEP_TIMEOUT_SECONDS = "300";

    const config = loadConfig();

    expect(config.stepTimeoutSeconds).toBe(300);
  });

  it("defaults stepTimeoutSeconds to 900 for gitlab board", () => {
    process.env.OFLOW_BOARD = "gitlab";
    process.env.OFLOW_GITLAB_TOKEN = "glpat_test";
    process.env.OFLOW_GITLAB_PROJECT_ID = "owner/repo";

    const config = loadConfig();

    expect(config.stepTimeoutSeconds).toBe(900);
  });

  it("throws for unsupported board value", () => {
    process.env.OFLOW_BOARD = "other";

    expect(() => loadConfig()).toThrow(/unsupported board.*other/i);
  });

  it("throws if OFLOW_GITLAB_TOKEN is missing when board=gitlab", () => {
    process.env.OFLOW_BOARD = "gitlab";
    process.env.OFLOW_GITLAB_PROJECT_ID = "owner/repo";
    expect(() => loadConfig()).toThrow(/OFLOW_GITLAB_TOKEN/);
  });

  it("throws if OFLOW_GITLAB_PROJECT_ID is missing when board=gitlab", () => {
    process.env.OFLOW_BOARD = "gitlab";
    process.env.OFLOW_GITLAB_TOKEN = "glpat_test";
    expect(() => loadConfig()).toThrow(/OFLOW_GITLAB_PROJECT_ID/);
  });

  it("returns typed gitlab config with defaults when required fields present", () => {
    process.env.OFLOW_BOARD = "gitlab";
    process.env.OFLOW_GITLAB_TOKEN = "glpat_test";
    process.env.OFLOW_GITLAB_PROJECT_ID = "owner/repo";

    const config = loadConfig();

    expect(config.board).toBe("gitlab");
    expect(config.gitlabToken).toBe("glpat_test");
    expect(config.gitlabProjectId).toBe("owner/repo");
    expect(config.gitlabUrl).toBe("https://gitlab.com/api/v4");
  });

  it("uses custom OFLOW_GITLAB_URL when provided for board=gitlab", () => {
    process.env.OFLOW_BOARD = "gitlab";
    process.env.OFLOW_GITLAB_TOKEN = "glpat_test";
    process.env.OFLOW_GITLAB_PROJECT_ID = "owner/repo";
    process.env.OFLOW_GITLAB_URL = "https://mygitlab.example.com/api/v4";

    const config = loadConfig();

    expect(config.gitlabUrl).toBe("https://mygitlab.example.com/api/v4");
  });

  it("throws if OFLOW_JIRA_TOKEN is missing when board=jira", () => {
    process.env.OFLOW_BOARD = "jira";
    process.env.OFLOW_JIRA_URL = "https://mycompany.atlassian.net";
    process.env.OFLOW_JIRA_EMAIL = "dev@example.com";
    process.env.OFLOW_JIRA_PROJECT_KEY = "DEV";
    expect(() => loadConfig()).toThrow(/OFLOW_JIRA_TOKEN/);
  });

  it("throws if OFLOW_JIRA_URL is missing when board=jira", () => {
    process.env.OFLOW_BOARD = "jira";
    process.env.OFLOW_JIRA_TOKEN = "jira-token";
    process.env.OFLOW_JIRA_EMAIL = "dev@example.com";
    process.env.OFLOW_JIRA_PROJECT_KEY = "DEV";
    expect(() => loadConfig()).toThrow(/OFLOW_JIRA_URL/);
  });

  it("throws if OFLOW_JIRA_EMAIL is missing when board=jira", () => {
    process.env.OFLOW_BOARD = "jira";
    process.env.OFLOW_JIRA_TOKEN = "jira-token";
    process.env.OFLOW_JIRA_URL = "https://mycompany.atlassian.net";
    process.env.OFLOW_JIRA_PROJECT_KEY = "DEV";
    expect(() => loadConfig()).toThrow(/OFLOW_JIRA_EMAIL/);
  });

  it("throws if OFLOW_JIRA_PROJECT_KEY is missing when board=jira", () => {
    process.env.OFLOW_BOARD = "jira";
    process.env.OFLOW_JIRA_TOKEN = "jira-token";
    process.env.OFLOW_JIRA_URL = "https://mycompany.atlassian.net";
    process.env.OFLOW_JIRA_EMAIL = "dev@example.com";
    expect(() => loadConfig()).toThrow(/OFLOW_JIRA_PROJECT_KEY/);
  });

  it("returns typed jira config with defaults when required fields present", () => {
    process.env.OFLOW_BOARD = "jira";
    process.env.OFLOW_JIRA_TOKEN = "jira-token";
    process.env.OFLOW_JIRA_URL = "https://mycompany.atlassian.net";
    process.env.OFLOW_JIRA_EMAIL = "dev@example.com";
    process.env.OFLOW_JIRA_PROJECT_KEY = "DEV";

    const config = loadConfig();

    expect(config.board).toBe("jira");
    expect(config.jiraToken).toBe("jira-token");
    expect(config.jiraUrl).toBe("https://mycompany.atlassian.net");
    expect(config.jiraEmail).toBe("dev@example.com");
    expect(config.jiraProjectKey).toBe("DEV");
    expect(config.jiraReadyStatus).toBe("To Do");
    expect(config.jiraInProgressStatus).toBe("In Progress");
    expect(config.jiraDoneStatus).toBe("Done");
    expect(config.jiraBoardId).toBeUndefined();
  });

  it("uses custom Jira status values when provided", () => {
    process.env.OFLOW_BOARD = "jira";
    process.env.OFLOW_JIRA_TOKEN = "jira-token";
    process.env.OFLOW_JIRA_URL = "https://mycompany.atlassian.net";
    process.env.OFLOW_JIRA_EMAIL = "dev@example.com";
    process.env.OFLOW_JIRA_PROJECT_KEY = "DEV";
    process.env.OFLOW_JIRA_READY_STATUS = "Ready for Dev";
    process.env.OFLOW_JIRA_IN_PROGRESS_STATUS = "In Development";
    process.env.OFLOW_JIRA_DONE_STATUS = "Deployed";

    const config = loadConfig();

    expect(config.jiraReadyStatus).toBe("Ready for Dev");
    expect(config.jiraInProgressStatus).toBe("In Development");
    expect(config.jiraDoneStatus).toBe("Deployed");
  });

  it("accepts optional OFLOW_JIRA_BOARD_ID when board=jira", () => {
    process.env.OFLOW_BOARD = "jira";
    process.env.OFLOW_JIRA_TOKEN = "jira-token";
    process.env.OFLOW_JIRA_URL = "https://mycompany.atlassian.net";
    process.env.OFLOW_JIRA_EMAIL = "dev@example.com";
    process.env.OFLOW_JIRA_PROJECT_KEY = "DEV";
    process.env.OFLOW_JIRA_BOARD_ID = "42";

    const config = loadConfig();

    expect(config.jiraBoardId).toBe("42");
  });
});

describe("loadJiraToken", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("OFLOW_")) {
        delete process.env[key];
      }
    }
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("returns token from OFLOW_JIRA_TOKEN env var", async () => {
    process.env.OFLOW_JIRA_TOKEN = "env-token";
    const token = await loadJiraToken();
    expect(token).toBe("env-token");
  });

  it("returns token from macOS keychain when env var is absent", async () => {
    delete process.env.OFLOW_JIRA_TOKEN;
    const childProcess = await import("node:child_process");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(childProcess.exec).mockImplementation((_cmd: string, callback: any) => {
      callback(null, "keychain-token\n", "");
      return {} as ReturnType<typeof childProcess.exec>;
    });

    const token = await loadJiraToken();
    expect(token).toBe("keychain-token");
  });

  it("returns undefined when env var is absent and keychain returns non-zero exit", async () => {
    delete process.env.OFLOW_JIRA_TOKEN;
    const childProcess = await import("node:child_process");
    const err = Object.assign(new Error("not found"), { code: 44 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(childProcess.exec).mockImplementation((_cmd: string, callback: any) => {
      callback(err, "", "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.");
      return {} as ReturnType<typeof childProcess.exec>;
    });

    const token = await loadJiraToken();
    expect(token).toBeUndefined();
  });
});
