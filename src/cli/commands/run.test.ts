import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import { runDaemon } from "./run.js";
import * as poller from "../../daemon/poller.js";
import { Scheduler } from "../../daemon/scheduler.js";
import { GitHubBoardAdapter } from "../../adapters/board/github.js";
import { ClaudeCodeAdapter } from "../../adapters/agent/claude-code.js";

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

  it("removes session from scheduler even when updateTask throws", async () => {
    const session = {
      id: "session-1",
      taskId: "42",
      pid: 12345,
      logFile: "/tmp/run.log",
      startedAt: new Date(),
    };

    const removeSession = vi.fn().mockImplementation(() => {
      // Stop the daemon after the session is cleaned up so the test doesn't hang
      process.emit("SIGINT" as any);
    });

    // activeSessions is called 4 times per loop iteration:
    // 1. idsBefore snapshot, 2. activesAfter size, 3. new-sessions log loop,
    // 4. completed-sessions check — only the 4th call should return the session
    let activeSessionsCallCount = 0;
    (Scheduler as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      hasSlot: vi.fn().mockReturnValue(false),
      addSession: vi.fn(),
      removeSession,
      activeSessions: vi.fn().mockImplementation(() => {
        activeSessionsCallCount++;
        return activeSessionsCallCount === 4
          ? new Map([["42", session]])
          : new Map();
      }),
    }));

    (ClaudeCodeAdapter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      spawn: vi.fn(),
      getStatus: vi.fn().mockResolvedValue("completed"),
    }));

    (GitHubBoardAdapter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      listAvailableTasks: vi.fn().mockResolvedValue([]),
      claimTask: vi.fn(),
      updateTask: vi.fn().mockRejectedValue(
        Object.assign(new Error("Label does not exist"), { status: 404 })
      ),
      getTask: vi.fn(),
    }));

    pollSpy.mockResolvedValue(undefined);

    await runDaemon("/repo");

    expect(removeSession).toHaveBeenCalledWith("42");
  });
});
