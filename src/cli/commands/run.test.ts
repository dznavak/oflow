import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import { runDaemon } from "./run.js";
import * as poller from "../../daemon/poller.js";
import { Scheduler } from "../../daemon/scheduler.js";
import { GitHubBoardAdapter } from "../../adapters/board/github.js";
import { ClaudeCodeAdapter } from "../../adapters/agent/claude-code.js";
import { StateManager } from "../../state/manager.js";
import { EventEmitter } from "events";

const mockTailProcess = {
  kill: vi.fn(),
  stdout: null,
  pid: 999,
};

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
    getRunDir: vi.fn().mockReturnValue("/tmp/runs/42"),
    tailEvents: vi.fn().mockReturnValue(mockTailProcess),
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

vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(""),
  writeFile: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockResolvedValue(undefined),
  appendFile: vi.fn().mockResolvedValue(undefined),
}));

describe("runDaemon", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pollSpy: MockInstance<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTailProcess.kill = vi.fn();
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

  it("starts tailing events when a new session is detected", async () => {
    const session = {
      id: "session-1",
      taskId: "42",
      pid: 12345,
      logFile: "/tmp/run.log",
      startedAt: new Date(),
    };

    let activeSessionsCallCount = 0;
    const tailEvents = vi.fn().mockReturnValue(mockTailProcess);

    (StateManager as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      initRun: vi.fn(),
      writeTaskContext: vi.fn(),
      getRunDir: vi.fn().mockReturnValue("/tmp/runs/42"),
      tailEvents,
    }));

    (Scheduler as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      hasSlot: vi.fn().mockReturnValue(false),
      addSession: vi.fn(),
      removeSession: vi.fn(),
      activeSessions: vi.fn().mockImplementation(() => {
        activeSessionsCallCount++;
        // On first loop: calls 1 (idsBefore) and 2 (activesAfter) return the session
        // so it looks like a new session was started
        if (activeSessionsCallCount === 1) return new Map(); // idsBefore empty
        if (activeSessionsCallCount <= 3) return new Map([["42", session]]); // new session found
        // After first loop, emit SIGINT to stop
        process.emit("SIGINT" as any);
        return new Map([["42", session]]);
      }),
    }));

    (ClaudeCodeAdapter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      spawn: vi.fn(),
      getStatus: vi.fn().mockResolvedValue("running"),
    }));

    pollSpy.mockResolvedValue(undefined);

    await runDaemon("/repo");

    expect(tailEvents).toHaveBeenCalledWith("42", expect.any(Function));
  });

  it("kills tail process on session completion", async () => {
    const session = {
      id: "session-1",
      taskId: "42",
      pid: 12345,
      logFile: "/tmp/run.log",
      startedAt: new Date(),
    };

    const killFn = vi.fn();
    const tailProcess = { kill: killFn, stdout: null, pid: 999 };

    let activeSessionsCallCount = 0;

    (StateManager as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      initRun: vi.fn(),
      writeTaskContext: vi.fn(),
      getRunDir: vi.fn().mockReturnValue("/tmp/runs/42"),
      tailEvents: vi.fn().mockReturnValue(tailProcess),
    }));

    (Scheduler as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      hasSlot: vi.fn().mockReturnValue(false),
      addSession: vi.fn(),
      removeSession: vi.fn().mockImplementation(() => {
        process.emit("SIGINT" as any);
      }),
      activeSessions: vi.fn().mockImplementation(() => {
        activeSessionsCallCount++;
        // Loop iteration 1: idsBefore=empty(1), activesAfter=session(2), new-sessions=session(3), completion-check=session(4)
        if (activeSessionsCallCount === 1) return new Map(); // idsBefore empty => new session
        return new Map([["42", session]]);
      }),
    }));

    (ClaudeCodeAdapter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      spawn: vi.fn(),
      getStatus: vi.fn().mockResolvedValue("completed"),
    }));

    (GitHubBoardAdapter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      listAvailableTasks: vi.fn().mockResolvedValue([]),
      claimTask: vi.fn(),
      updateTask: vi.fn().mockResolvedValue(undefined),
      getTask: vi.fn(),
    }));

    pollSpy.mockResolvedValue(undefined);

    await runDaemon("/repo");

    expect(killFn).toHaveBeenCalled();
  });

  it("prints [active] heartbeat for running sessions at each poll tick", async () => {
    const session = {
      id: "session-1",
      taskId: "42",
      pid: 12345,
      logFile: "/tmp/run.log",
      startedAt: new Date(Date.now() - 5000), // 5 seconds ago
    };

    let activeSessionsCallCount = 0;

    (Scheduler as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      hasSlot: vi.fn().mockReturnValue(false),
      addSession: vi.fn(),
      removeSession: vi.fn(),
      activeSessions: vi.fn().mockImplementation(() => {
        activeSessionsCallCount++;
        // Call 1: idsBefore = empty (so "42" looks new in calls 2-3)
        if (activeSessionsCallCount === 1) return new Map();
        return new Map([["42", session]]);
      }),
    }));

    (ClaudeCodeAdapter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      spawn: vi.fn(),
      // First getStatus call triggers SIGINT so we don't loop again
      getStatus: vi.fn().mockImplementation(async () => {
        process.emit("SIGINT" as any);
        return "running";
      }),
    }));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    pollSpy.mockResolvedValue(undefined);

    await runDaemon("/repo");

    const activeLogs = consoleSpy.mock.calls
      .map((args) => args[0] as string)
      .filter((msg) => msg.includes("[active]"));

    expect(activeLogs.length).toBeGreaterThan(0);
    expect(activeLogs[0]).toMatch(/\[task-42\] \[active\] \d+s elapsed/);

    consoleSpy.mockRestore();
  });

  it("prints formatted step event from events callback", async () => {
    let capturedCallback: ((line: string) => void) | null = null;

    const session = {
      id: "session-1",
      taskId: "42",
      pid: 12345,
      logFile: "/tmp/run.log",
      startedAt: new Date(),
    };

    let activeSessionsCallCount = 0;

    (StateManager as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      initRun: vi.fn(),
      writeTaskContext: vi.fn(),
      getRunDir: vi.fn().mockReturnValue("/tmp/runs/42"),
      tailEvents: vi.fn().mockImplementation((taskId: string, cb: (line: string) => void) => {
        capturedCallback = cb;
        return mockTailProcess;
      }),
    }));

    (Scheduler as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      hasSlot: vi.fn().mockReturnValue(false),
      addSession: vi.fn(),
      removeSession: vi.fn(),
      activeSessions: vi.fn().mockImplementation(() => {
        activeSessionsCallCount++;
        if (activeSessionsCallCount === 1) return new Map(); // idsBefore empty => new session
        if (activeSessionsCallCount === 4) {
          process.emit("SIGINT" as any);
        }
        return new Map([["42", session]]);
      }),
    }));

    (ClaudeCodeAdapter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      spawn: vi.fn(),
      getStatus: vi.fn().mockResolvedValue("running"),
    }));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    pollSpy.mockResolvedValue(undefined);

    await runDaemon("/repo");

    // Simulate a step event arriving via the tail callback
    expect(capturedCallback).not.toBeNull();
    capturedCallback!(JSON.stringify({ type: "step", step: "exploration", ts: new Date().toISOString() }));

    const stepLogs = consoleSpy.mock.calls
      .map((args) => args[0] as string)
      .filter((msg) => msg.includes("[step]"));

    expect(stepLogs.length).toBeGreaterThan(0);
    expect(stepLogs[0]).toBe("[task-42] [step] exploration");

    consoleSpy.mockRestore();
  });

  it("prints formatted artifact event from events callback", async () => {
    let capturedCallback: ((line: string) => void) | null = null;

    const session = {
      id: "session-1",
      taskId: "42",
      pid: 12345,
      logFile: "/tmp/run.log",
      startedAt: new Date(),
    };

    let activeSessionsCallCount = 0;

    (StateManager as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      initRun: vi.fn(),
      writeTaskContext: vi.fn(),
      getRunDir: vi.fn().mockReturnValue("/tmp/runs/42"),
      tailEvents: vi.fn().mockImplementation((taskId: string, cb: (line: string) => void) => {
        capturedCallback = cb;
        return mockTailProcess;
      }),
    }));

    (Scheduler as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      hasSlot: vi.fn().mockReturnValue(false),
      addSession: vi.fn(),
      removeSession: vi.fn(),
      activeSessions: vi.fn().mockImplementation(() => {
        activeSessionsCallCount++;
        if (activeSessionsCallCount === 1) return new Map();
        if (activeSessionsCallCount === 4) {
          process.emit("SIGINT" as any);
        }
        return new Map([["42", session]]);
      }),
    }));

    (ClaudeCodeAdapter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      spawn: vi.fn(),
      getStatus: vi.fn().mockResolvedValue("running"),
    }));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    pollSpy.mockResolvedValue(undefined);

    await runDaemon("/repo");

    expect(capturedCallback).not.toBeNull();
    capturedCallback!(JSON.stringify({ type: "artifact", name: "plan", path: "plan.md", ts: new Date().toISOString() }));

    const artifactLogs = consoleSpy.mock.calls
      .map((args) => args[0] as string)
      .filter((msg) => msg.includes("[artifact]"));

    expect(artifactLogs.length).toBeGreaterThan(0);
    expect(artifactLogs[0]).toBe("[task-42] [artifact] plan — .oflow/runs/42/plan.md");

    consoleSpy.mockRestore();
  });

  it("appends a row to task-log.jsonl on task completion with estimate data", async () => {
    const fsMod = await import("fs/promises");
    const readFileMock = fsMod.readFile as ReturnType<typeof vi.fn>;
    const appendFileMock = fsMod.appendFile as ReturnType<typeof vi.fn>;

    readFileMock.mockImplementation((path: string) => {
      if (String(path).endsWith("events.jsonl")) {
        return Promise.resolve(
          JSON.stringify({ type: "estimate", score: 40, estimated_seconds: 3600, ts: "2026-04-01T00:00:00Z" }) + "\n"
        );
      }
      return Promise.resolve("");
    });

    const session = {
      id: "session-1",
      taskId: "42",
      pid: 12345,
      logFile: "/tmp/run.log",
      startedAt: new Date(Date.now() - 10000),
    };

    const readTaskContextFn = vi.fn().mockResolvedValue({
      id: "42",
      number: 42,
      title: "Run reporting",
      description: "",
      labels: [],
      workflow: "dev-workflow",
      url: "",
      repoPath: "/repo",
      runDir: "/repo/.oflow/runs/42",
    });

    let activeSessionsCallCount = 0;

    (StateManager as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      initRun: vi.fn(),
      writeTaskContext: vi.fn(),
      readTaskContext: readTaskContextFn,
      getRunDir: vi.fn().mockReturnValue("/repo/.oflow/runs/42"),
      eventsPath: vi.fn().mockReturnValue("/repo/.oflow/runs/42/events.jsonl"),
      tailEvents: vi.fn().mockReturnValue(mockTailProcess),
    }));

    (Scheduler as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      hasSlot: vi.fn().mockReturnValue(false),
      addSession: vi.fn(),
      removeSession: vi.fn().mockImplementation(() => {
        process.emit("SIGINT" as any);
      }),
      activeSessions: vi.fn().mockImplementation(() => {
        activeSessionsCallCount++;
        if (activeSessionsCallCount === 1) return new Map();
        return new Map([["42", session]]);
      }),
    }));

    (ClaudeCodeAdapter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      spawn: vi.fn(),
      getStatus: vi.fn().mockResolvedValue("completed"),
    }));

    (GitHubBoardAdapter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      listAvailableTasks: vi.fn().mockResolvedValue([]),
      claimTask: vi.fn(),
      updateTask: vi.fn().mockResolvedValue(undefined),
      getTask: vi.fn(),
    }));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    pollSpy.mockResolvedValue(undefined);

    await runDaemon("/repo");

    consoleSpy.mockRestore();

    const taskLogCalls = appendFileMock.mock.calls.filter(
      (args: unknown[]) => typeof args[0] === "string" && (args[0] as string).endsWith("task-log.jsonl")
    );
    expect(taskLogCalls.length).toBeGreaterThan(0);
    const written = JSON.parse(taskLogCalls[0][1] as string);
    expect(written.task_id).toBe("42");
    expect(written.title).toBe("Run reporting");
    expect(written.complexity_score).toBe(40);
    expect(written.estimated_seconds).toBe(3600);
    expect(typeof written.actual_seconds).toBe("number");
    expect(written.status).toBe("completed");
  });

  it("appends task-log.jsonl row with null scores when no estimate event found", async () => {
    const fsMod = await import("fs/promises");
    const readFileMock = fsMod.readFile as ReturnType<typeof vi.fn>;
    const appendFileMock = fsMod.appendFile as ReturnType<typeof vi.fn>;

    readFileMock.mockImplementation((path: string) => {
      if (String(path).endsWith("events.jsonl")) {
        return Promise.resolve(
          JSON.stringify({ type: "step", step: "exploration", ts: "2026-04-01T00:00:00Z" }) + "\n"
        );
      }
      return Promise.resolve("");
    });

    const session = {
      id: "session-1",
      taskId: "42",
      pid: 12345,
      logFile: "/tmp/run.log",
      startedAt: new Date(Date.now() - 10000),
    };

    const readTaskContextFn = vi.fn().mockResolvedValue({
      id: "42",
      number: 42,
      title: "Run reporting",
      description: "",
      labels: [],
      workflow: "dev-workflow",
      url: "",
      repoPath: "/repo",
      runDir: "/repo/.oflow/runs/42",
    });

    let activeSessionsCallCount = 0;

    (StateManager as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      initRun: vi.fn(),
      writeTaskContext: vi.fn(),
      readTaskContext: readTaskContextFn,
      getRunDir: vi.fn().mockReturnValue("/repo/.oflow/runs/42"),
      eventsPath: vi.fn().mockReturnValue("/repo/.oflow/runs/42/events.jsonl"),
      tailEvents: vi.fn().mockReturnValue(mockTailProcess),
    }));

    (Scheduler as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      hasSlot: vi.fn().mockReturnValue(false),
      addSession: vi.fn(),
      removeSession: vi.fn().mockImplementation(() => {
        process.emit("SIGINT" as any);
      }),
      activeSessions: vi.fn().mockImplementation(() => {
        activeSessionsCallCount++;
        if (activeSessionsCallCount === 1) return new Map();
        return new Map([["42", session]]);
      }),
    }));

    (ClaudeCodeAdapter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      spawn: vi.fn(),
      getStatus: vi.fn().mockResolvedValue("completed"),
    }));

    (GitHubBoardAdapter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      listAvailableTasks: vi.fn().mockResolvedValue([]),
      claimTask: vi.fn(),
      updateTask: vi.fn().mockResolvedValue(undefined),
      getTask: vi.fn(),
    }));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    pollSpy.mockResolvedValue(undefined);

    await runDaemon("/repo");

    consoleSpy.mockRestore();

    const taskLogCalls = appendFileMock.mock.calls.filter(
      (args: unknown[]) => typeof args[0] === "string" && (args[0] as string).endsWith("task-log.jsonl")
    );
    expect(taskLogCalls.length).toBeGreaterThan(0);
    const written = JSON.parse(taskLogCalls[0][1] as string);
    expect(written.task_id).toBe("42");
    expect(written.complexity_score).toBeNull();
    expect(written.estimated_seconds).toBeNull();
    expect(written.status).toBe("completed");
  });

  it("prints [done] with token count from run.log on session completion", async () => {
    const { readFile } = await import("fs/promises");

    (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
      "Some output\nTokens used: 12345\nmore output\n"
    );

    const session = {
      id: "session-1",
      taskId: "42",
      pid: 12345,
      logFile: "/tmp/run.log",
      startedAt: new Date(),
    };

    let activeSessionsCallCount = 0;

    (Scheduler as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      hasSlot: vi.fn().mockReturnValue(false),
      addSession: vi.fn(),
      removeSession: vi.fn().mockImplementation(() => {
        process.emit("SIGINT" as any);
      }),
      activeSessions: vi.fn().mockImplementation(() => {
        activeSessionsCallCount++;
        if (activeSessionsCallCount === 1) return new Map();
        return new Map([["42", session]]);
      }),
    }));

    (ClaudeCodeAdapter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      spawn: vi.fn(),
      getStatus: vi.fn().mockResolvedValue("completed"),
    }));

    (GitHubBoardAdapter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      listAvailableTasks: vi.fn().mockResolvedValue([]),
      claimTask: vi.fn(),
      updateTask: vi.fn().mockResolvedValue(undefined),
      getTask: vi.fn(),
    }));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    pollSpy.mockResolvedValue(undefined);

    await runDaemon("/repo");

    const doneLogs = consoleSpy.mock.calls
      .map((args) => args[0] as string)
      .filter((msg) => msg.includes("[done]"));

    expect(doneLogs.length).toBeGreaterThan(0);
    expect(doneLogs[0]).toBe("[task-42] [done] tokens: 12345");

    consoleSpy.mockRestore();
  });
});
