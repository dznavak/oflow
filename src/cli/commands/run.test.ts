import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import { runDaemon } from "./run.js";
import * as poller from "../../daemon/poller.js";
import { Scheduler } from "../../daemon/scheduler.js";
import { GitHubBoardAdapter } from "../../adapters/board/github.js";
import { GitLabBoardAdapter } from "../../adapters/board/gitlab.js";
import { ClaudeCodeAdapter } from "../../adapters/agent/claude-code.js";
import { StateManager } from "../../state/manager.js";
import { loadConfig } from "../../config/loader.js";


const mockTailProcess = {
  kill: vi.fn(),
  stdout: null,
  pid: 999,
};

const mockLoadJiraToken = vi.fn().mockResolvedValue(undefined);

vi.mock("../../config/loader.js", () => ({
  loadConfig: vi.fn(() => ({
    taskLabel: "oflow-ready",
    taskInProgressLabel: "oflow-in-progress",
    taskDoneLabel: "oflow-done",
    pollIntervalSeconds: 30,
    maxConcurrentTasks: 1,
    agent: "claude-code",
    stepTimeoutSeconds: 900,
    defaultWorkflow: "dev-workflow",
    board: "github",
  })),
  loadJiraToken: () => mockLoadJiraToken(),
}));

vi.mock("../../adapters/board/github.js", () => ({
  GitHubBoardAdapter: vi.fn().mockImplementation(() => ({
    listAvailableTasks: vi.fn().mockResolvedValue([]),
    claimTask: vi.fn(),
    updateTask: vi.fn(),
    getTask: vi.fn(),
  })),
}));

vi.mock("../../adapters/board/gitlab.js", () => ({
  GitLabBoardAdapter: vi.fn().mockImplementation(() => ({
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

    // activeSessions is called 5 times per loop iteration:
    // 1. idsBefore snapshot, 2. activesAfter size, 3. new-sessions log loop,
    // 4. writeSessionsJson, 5. completed-sessions check — only the 5th call should return the session
    let activeSessionsCallCount = 0;
    (Scheduler as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      hasSlot: vi.fn().mockReturnValue(false),
      addSession: vi.fn(),
      removeSession,
      activeSessions: vi.fn().mockImplementation(() => {
        activeSessionsCallCount++;
        return activeSessionsCallCount === 5
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
        // Loop iteration 1: idsBefore=empty(1), activesAfter=session(2), new-sessions=session(3), writeSessionsJson=session(4), completion-check=session(5)
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

  it("writes sessions.json after new sessions are detected", async () => {
    const fsMod = await import("fs/promises");
    const writeFileMock = fsMod.writeFile as ReturnType<typeof vi.fn>;

    const session = {
      id: "session-1",
      taskId: "42",
      pid: 12345,
      logFile: "/tmp/run.log",
      startedAt: new Date("2026-04-06T10:00:00.000Z"),
    };

    let activeSessionsCallCount = 0;

    (Scheduler as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      hasSlot: vi.fn().mockReturnValue(false),
      addSession: vi.fn(),
      removeSession: vi.fn(),
      activeSessions: vi.fn().mockImplementation(() => {
        activeSessionsCallCount++;
        // Call 1: idsBefore=empty, calls 2-3: session (new session detected), call 4: SIGINT+session for completion check
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

    pollSpy.mockResolvedValue(undefined);

    await runDaemon("/repo");

    const sessionsJsonCalls = writeFileMock.mock.calls.filter(
      (args: unknown[]) => typeof args[0] === "string" && (args[0] as string).endsWith("sessions.json")
    );
    expect(sessionsJsonCalls.length).toBeGreaterThan(0);

    const writtenContent = JSON.parse(sessionsJsonCalls[0][1] as string) as Array<Record<string, unknown>>;
    expect(writtenContent).toHaveLength(1);
    expect(writtenContent[0].taskId).toBe("42");
    expect(writtenContent[0].pid).toBe(12345);
    expect(writtenContent[0].logFile).toBe("/tmp/run.log");
    expect(writtenContent[0].startedAt).toBe("2026-04-06T10:00:00.000Z");
  });

  it("writes sessions.json after a session is removed in the finally block", async () => {
    const fsMod = await import("fs/promises");
    const writeFileMock = fsMod.writeFile as ReturnType<typeof vi.fn>;

    const session = {
      id: "session-1",
      taskId: "42",
      pid: 12345,
      logFile: "/tmp/run.log",
      startedAt: new Date("2026-04-06T10:00:00.000Z"),
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
        // activeSessions call sequence per loop iteration:
        // 1. idsBefore snapshot (empty => "42" looks new)
        // 2. activesAfter size
        // 3. new-sessions log loop
        // 4. writeSessionsJson after new-sessions loop
        // 5. completed-sessions check => returns session so completion fires
        // After removeSession, writeSessionsJson is called again (call 6) => returns empty
        if (activeSessionsCallCount === 1) return new Map(); // idsBefore empty
        if (activeSessionsCallCount <= 5) return new Map([["42", session]]);
        return new Map(); // after removeSession, empty
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

    const sessionsJsonCalls = writeFileMock.mock.calls.filter(
      (args: unknown[]) => typeof args[0] === "string" && (args[0] as string).endsWith("sessions.json")
    );
    // Should be written at least twice: once after new-sessions loop, once after removeSession
    expect(sessionsJsonCalls.length).toBeGreaterThanOrEqual(2);

    // The last write should contain an empty array (session was removed)
    const lastWritten = JSON.parse(
      sessionsJsonCalls[sessionsJsonCalls.length - 1][1] as string
    ) as Array<Record<string, unknown>>;
    expect(lastWritten).toHaveLength(0);
  });

  it("uses GitHubBoardAdapter when config.board is not 'gitlab'", async () => {
    let calls = 0;
    pollSpy.mockImplementation(async () => {
      calls++;
      if (calls >= 1) {
        process.emit("SIGINT" as any);
      }
    });

    await runDaemon("/repo");

    expect(GitHubBoardAdapter).toHaveBeenCalled();
    expect(GitLabBoardAdapter).not.toHaveBeenCalled();
  });

  it("enforces step timeout: kills agent, writes timed-out task-log row, updates board with failed, removes session", async () => {
    const fsMod = await import("fs/promises");
    const appendFileMock = fsMod.appendFile as ReturnType<typeof vi.fn>;

    // Session started well beyond the 900s timeout
    const session = {
      id: "session-1",
      taskId: "42",
      pid: 12345,
      logFile: "/tmp/run.log",
      startedAt: new Date(Date.now() - 1000 * 1000), // 1000s ago
    };

    const killFn = vi.fn().mockResolvedValue(undefined);
    const removeSession = vi.fn().mockImplementation(() => {
      process.emit("SIGINT" as any);
    });

    const readTaskContextFn = vi.fn().mockResolvedValue({
      id: "42",
      number: 42,
      title: "Timeout Task",
      description: "",
      labels: [],
      workflow: "dev-workflow",
      url: "",
      repoPath: "/repo",
      runDir: "/repo/.oflow/runs/42",
    });

    const appendEventFn = vi.fn().mockResolvedValue(undefined);

    let activeSessionsCallCount = 0;

    (StateManager as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      initRun: vi.fn(),
      writeTaskContext: vi.fn(),
      readTaskContext: readTaskContextFn,
      getRunDir: vi.fn().mockReturnValue("/repo/.oflow/runs/42"),
      eventsPath: vi.fn().mockReturnValue("/repo/.oflow/runs/42/events.jsonl"),
      tailEvents: vi.fn().mockReturnValue(mockTailProcess),
      appendEvent: appendEventFn,
    }));

    (Scheduler as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      hasSlot: vi.fn().mockReturnValue(false),
      addSession: vi.fn(),
      removeSession,
      activeSessions: vi.fn().mockImplementation(() => {
        activeSessionsCallCount++;
        if (activeSessionsCallCount === 1) return new Map(); // idsBefore empty
        return new Map([["42", session]]);
      }),
    }));

    (ClaudeCodeAdapter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      spawn: vi.fn(),
      getStatus: vi.fn().mockResolvedValue("running"),
      kill: killFn,
    }));

    const updateTaskFn = vi.fn().mockResolvedValue(undefined);

    (GitHubBoardAdapter as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      listAvailableTasks: vi.fn().mockResolvedValue([]),
      claimTask: vi.fn(),
      updateTask: updateTaskFn,
      getTask: vi.fn(),
    }));

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    pollSpy.mockResolvedValue(undefined);

    await runDaemon("/repo");

    // Check [timeout] log before restore
    const timeoutLogs = consoleSpy.mock.calls
      .map((args) => args[0] as string)
      .filter((msg) => msg?.includes("[timeout]"));

    consoleSpy.mockRestore();

    // [timeout] log message must have been emitted
    expect(timeoutLogs.length).toBeGreaterThan(0);
    expect(timeoutLogs[0]).toMatch(/\[task-42\] \[timeout\] step timed out after \d+s/);

    // agent.kill() must have been called
    expect(killFn).toHaveBeenCalledWith("session-1");

    // appendEvent must have been called with a timeout event
    expect(appendEventFn).toHaveBeenCalledWith("42", expect.objectContaining({ type: "timeout" }));

    // task-log.jsonl must contain a row with status "timed-out"
    const taskLogCalls = appendFileMock.mock.calls.filter(
      (args: unknown[]) => typeof args[0] === "string" && (args[0] as string).endsWith("task-log.jsonl")
    );
    expect(taskLogCalls.length).toBeGreaterThan(0);
    const written = JSON.parse(taskLogCalls[0][1] as string);
    expect(written.task_id).toBe("42");
    expect(written.status).toBe("timed-out");

    // board.updateTask must have been called with status "failed"
    expect(updateTaskFn).toHaveBeenCalledWith("42", expect.objectContaining({ status: "failed" }));

    // session must have been removed
    expect(removeSession).toHaveBeenCalledWith("42");
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

  describe("board target log line", () => {
    it("logs githubRepo as board target for github board", async () => {
      vi.mocked(loadConfig).mockReturnValueOnce({
        board: "github",
        githubRepo: "owner/my-repo",
        taskLabel: "oflow-ready",
        taskInProgressLabel: "oflow-in-progress",
        taskDoneLabel: "oflow-done",
        pollIntervalSeconds: 30,
        maxConcurrentTasks: 1,
        agent: "claude-code",
        stepTimeoutSeconds: 900,
        defaultWorkflow: "dev-workflow",
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      pollSpy.mockImplementation(async () => {
        process.emit("SIGINT" as any);
      });

      await runDaemon("/repo");

      const boardLog = consoleSpy.mock.calls
        .map((args) => args[0] as string)
        .find((msg) => msg.includes("board:"));

      consoleSpy.mockRestore();

      expect(boardLog).toContain("github");
      expect(boardLog).toContain("owner/my-repo");
    });

    it("logs gitlabProjectId as board target for gitlab board", async () => {
      vi.mocked(loadConfig).mockReturnValueOnce({
        board: "gitlab",
        gitlabProjectId: "mygroup/my-project",
        gitlabToken: "token",
        taskLabel: "oflow-ready",
        taskInProgressLabel: "oflow-in-progress",
        taskDoneLabel: "oflow-done",
        pollIntervalSeconds: 30,
        maxConcurrentTasks: 1,
        agent: "claude-code",
        stepTimeoutSeconds: 900,
        defaultWorkflow: "dev-workflow",
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      pollSpy.mockImplementation(async () => {
        process.emit("SIGINT" as any);
      });

      await runDaemon("/repo");

      const boardLog = consoleSpy.mock.calls
        .map((args) => args[0] as string)
        .find((msg) => msg.includes("board:"));

      consoleSpy.mockRestore();

      expect(boardLog).toContain("gitlab");
      expect(boardLog).toContain("mygroup/my-project");
    });

    it("logs jiraProjectKey and jiraUrl as board target for jira board", async () => {
      vi.mocked(loadConfig).mockReturnValueOnce({
        board: "jira",
        jiraProjectKey: "PROJ",
        jiraUrl: "https://my.atlassian.net",
        jiraEmail: "user@example.com",
        jiraToken: "token",
        taskLabel: "oflow-ready",
        taskInProgressLabel: "oflow-in-progress",
        taskDoneLabel: "oflow-done",
        pollIntervalSeconds: 30,
        maxConcurrentTasks: 1,
        agent: "claude-code",
        stepTimeoutSeconds: 900,
        defaultWorkflow: "dev-workflow",
      });

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      pollSpy.mockImplementation(async () => {
        process.emit("SIGINT" as any);
      });

      await runDaemon("/repo");

      const boardLog = consoleSpy.mock.calls
        .map((args) => args[0] as string)
        .find((msg) => msg.includes("board:"));

      consoleSpy.mockRestore();

      expect(boardLog).toContain("jira");
      expect(boardLog).toContain("PROJ");
      expect(boardLog).toContain("https://my.atlassian.net");
    });
  });

  describe("loadJiraToken keychain wiring", () => {
    it("calls loadJiraToken and sets OFLOW_JIRA_TOKEN when OFLOW_BOARD=jira and token not already set", async () => {
      const origBoard = process.env.OFLOW_BOARD;
      const origToken = process.env.OFLOW_JIRA_TOKEN;
      process.env.OFLOW_BOARD = "jira";
      delete process.env.OFLOW_JIRA_TOKEN;

      mockLoadJiraToken.mockResolvedValueOnce("keychain-token");

      let calls = 0;
      pollSpy.mockImplementation(async () => {
        calls++;
        if (calls >= 1) {
          process.emit("SIGINT" as any);
        }
      });

      let capturedToken: string | undefined;
      const origLoadConfig = (await import("../../config/loader.js")).loadConfig;
      // Intercept env at the point loadConfig is called
      pollSpy.mockImplementation(async () => {
        capturedToken = process.env.OFLOW_JIRA_TOKEN;
        process.emit("SIGINT" as any);
      });

      await runDaemon("/repo");

      expect(mockLoadJiraToken).toHaveBeenCalled();
      expect(capturedToken).toBe("keychain-token");

      // Restore env
      if (origBoard === undefined) delete process.env.OFLOW_BOARD;
      else process.env.OFLOW_BOARD = origBoard;
      if (origToken === undefined) delete process.env.OFLOW_JIRA_TOKEN;
      else process.env.OFLOW_JIRA_TOKEN = origToken;
    });

    it("does not overwrite OFLOW_JIRA_TOKEN when already set in env", async () => {
      const origBoard = process.env.OFLOW_BOARD;
      const origToken = process.env.OFLOW_JIRA_TOKEN;
      process.env.OFLOW_BOARD = "jira";
      process.env.OFLOW_JIRA_TOKEN = "existing-token";

      mockLoadJiraToken.mockResolvedValueOnce("keychain-token");

      pollSpy.mockImplementation(async () => {
        process.emit("SIGINT" as any);
      });

      await runDaemon("/repo");

      expect(process.env.OFLOW_JIRA_TOKEN).toBe("existing-token");

      // Restore env
      if (origBoard === undefined) delete process.env.OFLOW_BOARD;
      else process.env.OFLOW_BOARD = origBoard;
      if (origToken === undefined) delete process.env.OFLOW_JIRA_TOKEN;
      else process.env.OFLOW_JIRA_TOKEN = origToken;
    });

    it("does not call loadJiraToken when OFLOW_BOARD is 'github'", async () => {
      const origBoard = process.env.OFLOW_BOARD;
      process.env.OFLOW_BOARD = "github";

      mockLoadJiraToken.mockClear();

      pollSpy.mockImplementation(async () => {
        process.emit("SIGINT" as any);
      });

      await runDaemon("/repo");

      expect(mockLoadJiraToken).not.toHaveBeenCalled();

      // Restore env
      if (origBoard === undefined) delete process.env.OFLOW_BOARD;
      else process.env.OFLOW_BOARD = origBoard;
    });

    it("does not call loadJiraToken when OFLOW_BOARD is 'gitlab'", async () => {
      const origBoard = process.env.OFLOW_BOARD;
      process.env.OFLOW_BOARD = "gitlab";

      mockLoadJiraToken.mockClear();

      pollSpy.mockImplementation(async () => {
        process.emit("SIGINT" as any);
      });

      await runDaemon("/repo");

      expect(mockLoadJiraToken).not.toHaveBeenCalled();

      // Restore env
      if (origBoard === undefined) delete process.env.OFLOW_BOARD;
      else process.env.OFLOW_BOARD = origBoard;
    });
  });
});
