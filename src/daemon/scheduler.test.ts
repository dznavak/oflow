import { describe, it, expect } from "vitest";
import { Scheduler } from "./scheduler.js";
import type { Session } from "../adapters/agent/index.js";

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

describe("Scheduler", () => {
  it("hasSlot returns true when under max capacity", () => {
    const scheduler = new Scheduler(2);
    expect(scheduler.hasSlot()).toBe(true);
  });

  it("hasSlot returns false when at max capacity", () => {
    const scheduler = new Scheduler(1);
    scheduler.addSession("42", makeSession());
    expect(scheduler.hasSlot()).toBe(false);
  });

  it("hasSlot returns true after removing a session", () => {
    const scheduler = new Scheduler(1);
    scheduler.addSession("42", makeSession());
    scheduler.removeSession("42");
    expect(scheduler.hasSlot()).toBe(true);
  });

  it("correctly tracks active sessions", () => {
    const scheduler = new Scheduler(3);
    const session1 = makeSession({ taskId: "1", id: "s1" });
    const session2 = makeSession({ taskId: "2", id: "s2" });

    scheduler.addSession("1", session1);
    scheduler.addSession("2", session2);

    const active = scheduler.activeSessions();
    expect(active.size).toBe(2);
    expect(active.get("1")).toEqual(session1);
    expect(active.get("2")).toEqual(session2);
  });

  it("removeSession decreases active count", () => {
    const scheduler = new Scheduler(3);
    scheduler.addSession("42", makeSession());
    expect(scheduler.activeSessions().size).toBe(1);

    scheduler.removeSession("42");
    expect(scheduler.activeSessions().size).toBe(0);
  });
});
