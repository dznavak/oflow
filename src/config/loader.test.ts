import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "./loader.js";

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

  it("throws if OFLOW_BOARD is missing", () => {
    expect(() => loadConfig()).toThrow(/OFLOW_BOARD/);
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
});
