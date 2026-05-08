import { describe, it, expect, vi, beforeEach } from "vitest";
import { poll } from "./poller.js";
import type { Session } from "../adapters/agent/index.js";
import { makeTask, makeMockAdapter, makeMockStateManager } from "../test-utils.js";

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

function makeMockAgent() {
  return {
    spawn: vi.fn(),
    getStatus: vi.fn(),
    waitForCompletion: vi.fn(),
    getLogs: vi.fn(),
    kill: vi.fn(),
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


describe("poll", () => {
  let board: ReturnType<typeof makeMockAdapter>;
  let agent: ReturnType<typeof makeMockAgent>;
  let scheduler: ReturnType<typeof makeMockScheduler>;
  let stateManager: ReturnType<typeof makeMockStateManager>;

  beforeEach(() => {
    board = makeMockAdapter();
    agent = makeMockAgent();
    scheduler = makeMockScheduler(true);
    stateManager = makeMockStateManager();
  });

  it("calls board.listAvailableTasks when slot is available", async () => {
    board.listAvailableTasks.mockResolvedValue([]);

    await poll(board, scheduler, agent, stateManager, "/repo");

    expect(board.listAvailableTasks).toHaveBeenCalled();
  });

  it("does not call board.listAvailableTasks when no slot available", async () => {
    const fullScheduler = makeMockScheduler(false);

    await poll(board, fullScheduler, agent, stateManager, "/repo");

    expect(board.listAvailableTasks).not.toHaveBeenCalled();
  });

  it("spawns agent when task is available and slot is free", async () => {
    const task = makeTask();
    board.listAvailableTasks.mockResolvedValue([task]);
    board.claimTask.mockResolvedValue(task);
    agent.spawn.mockResolvedValue(makeSession());

    await poll(board, scheduler, agent, stateManager, "/repo");

    expect(board.claimTask).toHaveBeenCalledWith("42");
    expect(agent.spawn).toHaveBeenCalled();
    expect(scheduler.addSession).toHaveBeenCalled();
  });

  it("does not spawn when no tasks available", async () => {
    board.listAvailableTasks.mockResolvedValue([]);

    await poll(board, scheduler, agent, stateManager, "/repo");

    expect(agent.spawn).not.toHaveBeenCalled();
    expect(board.claimTask).not.toHaveBeenCalled();
  });

  it("calls listAvailableTasks with label when label is provided", async () => {
    board.listAvailableTasks.mockResolvedValue([]);

    await poll(board, scheduler, agent, stateManager, "/repo", "my-label");

    expect(board.listAvailableTasks).toHaveBeenCalledWith("my-label");
  });

  it("calls listAvailableTasks without label when label is not provided", async () => {
    board.listAvailableTasks.mockResolvedValue([]);

    await poll(board, scheduler, agent, stateManager, "/repo");

    expect(board.listAvailableTasks).toHaveBeenCalledWith(undefined);
  });

  describe("prFailedLabel priority", () => {
    it("picks PR-failed task first when prFailedLabel tasks exist", async () => {
      const prFailedTask = makeTask({ id: "99", title: "Fix failed PR" });
      const normalTask = makeTask({ id: "42", title: "Normal task" });

      board.listAvailableTasks
        .mockResolvedValueOnce([prFailedTask]) // first call: prFailedLabel
        .mockResolvedValueOnce([normalTask]);  // second call: normal label (should not be reached)
      board.claimTask.mockResolvedValue(prFailedTask);
      agent.spawn.mockResolvedValue(makeSession({ taskId: "99" }));

      await poll(board, scheduler, agent, stateManager, "/repo", undefined, "oflow-pr-failed");

      expect(board.listAvailableTasks).toHaveBeenCalledWith("oflow-pr-failed");
      expect(board.claimTask).toHaveBeenCalledWith("99");
    });

    it("falls through to normal label when no prFailedLabel tasks exist", async () => {
      const normalTask = makeTask({ id: "42", title: "Normal task" });

      board.listAvailableTasks
        .mockResolvedValueOnce([])            // first call: prFailedLabel returns empty
        .mockResolvedValueOnce([normalTask]); // second call: normal label
      board.claimTask.mockResolvedValue(normalTask);
      agent.spawn.mockResolvedValue(makeSession());

      await poll(board, scheduler, agent, stateManager, "/repo", undefined, "oflow-pr-failed");

      expect(board.listAvailableTasks).toHaveBeenNthCalledWith(1, "oflow-pr-failed");
      expect(board.listAvailableTasks).toHaveBeenNthCalledWith(2, undefined);
      expect(board.claimTask).toHaveBeenCalledWith("42");
    });

    it("uses provided label for fallback when prFailedLabel tasks are absent", async () => {
      const normalTask = makeTask({ id: "42", title: "Normal task" });

      board.listAvailableTasks
        .mockResolvedValueOnce([])            // prFailedLabel returns empty
        .mockResolvedValueOnce([normalTask]); // fallback label
      board.claimTask.mockResolvedValue(normalTask);
      agent.spawn.mockResolvedValue(makeSession());

      await poll(board, scheduler, agent, stateManager, "/repo", "my-label", "oflow-pr-failed");

      expect(board.listAvailableTasks).toHaveBeenNthCalledWith(1, "oflow-pr-failed");
      expect(board.listAvailableTasks).toHaveBeenNthCalledWith(2, "my-label");
    });

    it("skips prFailedLabel check when prFailedLabel is not provided", async () => {
      board.listAvailableTasks.mockResolvedValue([]);

      await poll(board, scheduler, agent, stateManager, "/repo", "my-label");

      expect(board.listAvailableTasks).toHaveBeenCalledTimes(1);
      expect(board.listAvailableTasks).toHaveBeenCalledWith("my-label");
    });
  });
});
