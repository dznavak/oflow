import { describe, it, expect, vi, beforeEach } from "vitest";
import { showStatus } from "./status.js";

vi.mock("fs/promises");

import { readFile } from "fs/promises";

const mockReadFile = vi.mocked(readFile);

describe("showStatus", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("active sessions", () => {
    it("prints 'No active sessions found.' when sessions.json is missing", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      await showStatus("/repo");

      expect(console.log).toHaveBeenCalledWith("No active sessions found.");
    });

    it("prints 'No active sessions.' when sessions.json is empty array", async () => {
      mockReadFile.mockResolvedValueOnce("[]" as never);
      // task-log.jsonl read: no failures
      mockReadFile.mockRejectedValueOnce(new Error("ENOENT") as never);

      await showStatus("/repo");

      expect(console.log).toHaveBeenCalledWith("No active sessions.");
    });

    it("prints active sessions when sessions.json has entries", async () => {
      const session = {
        id: "sess-1",
        taskId: "42",
        pid: 1234,
        logFile: "/repo/.oflow/runs/42/run.log",
        startedAt: "2026-04-07T10:00:00.000Z",
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify([session]) as never);
      // task-log.jsonl read: return empty
      mockReadFile.mockResolvedValueOnce("" as never);

      await showStatus("/repo");

      expect(console.log).toHaveBeenCalledWith("Active sessions:");
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("42"));
    });
  });

  describe("recent failures / timeouts section", () => {
    it("prints nothing when task-log.jsonl is missing", async () => {
      const session = {
        id: "sess-1",
        taskId: "42",
        pid: 1234,
        logFile: "/repo/.oflow/runs/42/run.log",
        startedAt: "2026-04-07T10:00:00.000Z",
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify([session]) as never);
      mockReadFile.mockRejectedValueOnce(new Error("ENOENT"));

      await showStatus("/repo");

      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining("Recent failures")
      );
    });

    it("shows failed and timed-out rows from task-log.jsonl", async () => {
      mockReadFile.mockResolvedValueOnce("[]" as never);
      const rows = [
        { task_id: "10", title: "task A", status: "completed", completed_at: "2026-04-07T09:00:00.000Z", actual_seconds: 60 },
        { task_id: "11", title: "task B", status: "failed", completed_at: "2026-04-07T09:10:00.000Z", actual_seconds: 90 },
        { task_id: "12", title: "task C", status: "timed-out", completed_at: "2026-04-07T09:20:00.000Z", actual_seconds: 900 },
      ];
      mockReadFile.mockResolvedValueOnce(rows.map((r) => JSON.stringify(r)).join("\n") as never);

      await showStatus("/repo");

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Recent failures / timeouts")
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("task B")
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("task C")
      );
      // completed rows should NOT appear
      const calls = vi.mocked(console.log).mock.calls.flat().map(String);
      expect(calls.some((c) => c.includes("task A"))).toBe(false);
    });

    it("shows only the last 10 failed/timed-out rows", async () => {
      mockReadFile.mockResolvedValueOnce("[]" as never);
      // Create 12 failed rows with zero-padded task IDs to avoid substring collisions
      const rows = Array.from({ length: 12 }, (_, i) => ({
        task_id: String(i + 1).padStart(3, "0"),
        title: `task-${String(i + 1).padStart(3, "0")}`,
        status: "failed",
        completed_at: `2026-04-07T${String(i).padStart(2, "0")}:00:00.000Z`,
        actual_seconds: 10,
      }));
      mockReadFile.mockResolvedValueOnce(rows.map((r) => JSON.stringify(r)).join("\n") as never);

      await showStatus("/repo");

      const calls = vi.mocked(console.log).mock.calls.flat().map(String);
      // Rows 001 and 002 (the oldest) should NOT appear; rows 003-012 should
      expect(calls.some((c) => c.includes("task-001"))).toBe(false);
      expect(calls.some((c) => c.includes("task-002"))).toBe(false);
      expect(calls.some((c) => c.includes("task-012"))).toBe(true);
      expect(calls.some((c) => c.includes("task-003"))).toBe(true);
    });

    it("does not print the section when no failed/timed-out rows exist", async () => {
      mockReadFile.mockResolvedValueOnce("[]" as never);
      const rows = [
        { task_id: "10", title: "task A", status: "completed", completed_at: "2026-04-07T09:00:00.000Z", actual_seconds: 60 },
      ];
      mockReadFile.mockResolvedValueOnce(rows.map((r) => JSON.stringify(r)).join("\n") as never);

      await showStatus("/repo");

      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining("Recent failures")
      );
    });
  });
});
