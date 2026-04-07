import { describe, it, expect } from "vitest";
import type { SessionStatus, SessionResult, AgentAdapter } from "./index.js";

describe("AgentAdapter types", () => {
  describe("SessionStatus", () => {
    it("accepts 'timed-out' as a valid SessionStatus value", () => {
      const status: SessionStatus = "timed-out";
      expect(status).toBe("timed-out");
    });

    it("accepts 'running' as a valid SessionStatus value", () => {
      const status: SessionStatus = "running";
      expect(status).toBe("running");
    });

    it("accepts 'completed' as a valid SessionStatus value", () => {
      const status: SessionStatus = "completed";
      expect(status).toBe("completed");
    });

    it("accepts 'failed' as a valid SessionStatus value", () => {
      const status: SessionStatus = "failed";
      expect(status).toBe("failed");
    });
  });

  describe("SessionResult", () => {
    it("accepts 'timed-out' as a valid SessionResult status", () => {
      const result: SessionResult = { status: "timed-out", exitCode: -1, duration: 900000 };
      expect(result.status).toBe("timed-out");
    });

    it("accepts 'completed' as a valid SessionResult status", () => {
      const result: SessionResult = { status: "completed", exitCode: 0, duration: 1000 };
      expect(result.status).toBe("completed");
    });

    it("accepts 'failed' as a valid SessionResult status", () => {
      const result: SessionResult = { status: "failed", exitCode: 1, duration: 500 };
      expect(result.status).toBe("failed");
    });
  });

  describe("AgentAdapter interface", () => {
    it("accepts an implementation that includes kill()", () => {
      const mockAdapter: AgentAdapter = {
        spawn: async () => ({
          id: "test-id",
          taskId: "42",
          pid: 99999,
          logFile: "/tmp/test.log",
          startedAt: new Date(),
        }),
        getStatus: async () => "running",
        waitForCompletion: async () => ({
          status: "timed-out",
          exitCode: -1,
          duration: 900000,
        }),
        getLogs: async () => "some logs",
        kill: async (_sessionId: string) => {
          // no-op for test
        },
      };
      expect(typeof mockAdapter.kill).toBe("function");
    });

    it("kill() returns a Promise<void>", async () => {
      const killFn = async (_sessionId: string): Promise<void> => {};
      const result = killFn("some-session-id");
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });
  });
});
