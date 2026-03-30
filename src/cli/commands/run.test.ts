import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import { runDaemon } from "./run.js";
import * as poller from "../../daemon/poller.js";

vi.mock("../../config/loader.js", () => ({
  loadConfig: () => ({
    taskLabel: "oflow-ready",
    pollIntervalSeconds: 30,
    maxConcurrentTasks: 1,
    agent: "claude-code",
  }),
}));

vi.mock("../../adapters/board/github.js", () => ({
  GitHubBoardAdapter: vi.fn().mockImplementation(() => ({
    listAvailableTasks: vi.fn().mockResolvedValue([]),
    claimTask: vi.fn(),
    updateTask: vi.fn(),
    getTask: vi.fn(),
  })),
}));

vi.mock("../../adapters/agent/claude-code.js", () => ({
  ClaudeCodeAdapter: vi.fn().mockImplementation(() => ({
    spawn: vi.fn(),
    getStatus: vi.fn().mockResolvedValue("running"),
  })),
}));

vi.mock("../../state/manager.js", () => ({
  StateManager: vi.fn().mockImplementation(() => ({
    initRun: vi.fn(),
    writeTaskContext: vi.fn(),
    getRunDir: vi.fn(),
  })),
}));

vi.mock("../../daemon/scheduler.js", () => ({
  Scheduler: vi.fn().mockImplementation(() => ({
    hasSlot: vi.fn().mockReturnValue(false),
    addSession: vi.fn(),
    removeSession: vi.fn(),
    activeSessions: vi.fn().mockReturnValue(new Map()),
  })),
}));

describe("runDaemon", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pollSpy: MockInstance<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    pollSpy = vi.spyOn(poller, "poll").mockResolvedValue(undefined);
  });

  it("calls poll without label when no label is provided", async () => {
    // Run one iteration then stop by making it non-running after first poll
    let calls = 0;
    pollSpy.mockImplementation(async () => {
      calls++;
      if (calls >= 1) {
        process.emit("SIGINT" as any);
      }
    });

    await runDaemon("/repo");

    expect(pollSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      "/repo",
      undefined
    );
  });

  it("passes label to poll when label is provided", async () => {
    let calls = 0;
    pollSpy.mockImplementation(async () => {
      calls++;
      if (calls >= 1) {
        process.emit("SIGINT" as any);
      }
    });

    await runDaemon("/repo", "my-label");

    expect(pollSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      "/repo",
      "my-label"
    );
  });
});
