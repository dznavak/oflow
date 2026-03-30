import { describe, it, expect, vi, beforeEach } from "vitest";
import { poll } from "./poller.js";
import type { Task } from "../adapters/board/index.js";
import type { Session } from "../adapters/agent/index.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "42",
    number: 42,
    title: "Test task",
    description: "Test description",
    labels: ["oflow-ready"],
    url: "https://github.com/owner/repo/issues/42",
    workflow: "dev-workflow",
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    taskId: "42",
    pid: 12345,
    logFile: "/tmp/run.log",
    startedAt: new Date(),
    ...overrides,
  };
}

function makeMockBoard() {
  return {
    listAvailableTasks: vi.fn(),
    claimTask: vi.fn(),
    updateTask: vi.fn(),
    getTask: vi.fn(),
  };
}

function makeMockAgent() {
  return {
    spawn: vi.fn(),
    getStatus: vi.fn(),
    waitForCompletion: vi.fn(),
    getLogs: vi.fn(),
  };
}

function makeMockScheduler(hasSlot = true) {
  return {
    hasSlot: vi.fn(() => hasSlot),
    addSession: vi.fn(),
    removeSession: vi.fn(),
    activeSessions: vi.fn(() => new Map()),
  };
}

function makeMockStateManager() {
  return {
    initRun: vi.fn().mockResolvedValue("/tmp/run"),
    writeTaskContext: vi.fn().mockResolvedValue(undefined),
    getRunDir: vi.fn().mockReturnValue("/tmp/run"),
    readArtifact: vi.fn(),
    writeArtifact: vi.fn(),
    listArtifacts: vi.fn(),
    readTaskContext: vi.fn(),
  };
}

const baseConfig = {
  board: "github",
  githubToken: "ghp_test",
  githubRepo: "owner/repo",
  taskLabel: "oflow-ready",
  taskInProgressLabel: "oflow-in-progress",
  taskDoneLabel: "oflow-done",
  agent: "claude-code",
  agentModel: "claude-opus-4-6",
  maxConcurrentTasks: 1,
  defaultWorkflow: "dev-workflow",
  pollIntervalSeconds: 60,
};

describe("poll", () => {
  let board: ReturnType<typeof makeMockBoard>;
  let agent: ReturnType<typeof makeMockAgent>;
  let scheduler: ReturnType<typeof makeMockScheduler>;
  let stateManager: ReturnType<typeof makeMockStateManager>;

  beforeEach(() => {
    board = makeMockBoard();
    agent = makeMockAgent();
    scheduler = makeMockScheduler(true);
    stateManager = makeMockStateManager();
  });

  it("calls board.listAvailableTasks when slot is available", async () => {
    board.listAvailableTasks.mockResolvedValue([]);

    await poll(board, scheduler, agent, stateManager, baseConfig, "/repo");

    expect(board.listAvailableTasks).toHaveBeenCalled();
  });

  it("does not call board.listAvailableTasks when no slot available", async () => {
    const fullScheduler = makeMockScheduler(false);

    await poll(board, fullScheduler, agent, stateManager, baseConfig, "/repo");

    expect(board.listAvailableTasks).not.toHaveBeenCalled();
  });

  it("spawns agent when task is available and slot is free", async () => {
    const task = makeTask();
    board.listAvailableTasks.mockResolvedValue([task]);
    board.claimTask.mockResolvedValue(task);
    agent.spawn.mockResolvedValue(makeSession());

    await poll(board, scheduler, agent, stateManager, baseConfig, "/repo");

    expect(board.claimTask).toHaveBeenCalledWith("42");
    expect(agent.spawn).toHaveBeenCalled();
    expect(scheduler.addSession).toHaveBeenCalled();
  });

  it("does not spawn when no tasks available", async () => {
    board.listAvailableTasks.mockResolvedValue([]);

    await poll(board, scheduler, agent, stateManager, baseConfig, "/repo");

    expect(agent.spawn).not.toHaveBeenCalled();
    expect(board.claimTask).not.toHaveBeenCalled();
  });
});
