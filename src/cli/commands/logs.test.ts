import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must mock before importing the module under test
vi.mock("fs", () => {
  const createReadStream = vi.fn();
  const stat = vi.fn();
  return { createReadStream, stat, default: { createReadStream, stat } };
});

vi.mock("child_process", () => {
  const spawn = vi.fn();
  return { spawn, default: { spawn } };
});

import * as fs from "fs";
import { spawn } from "child_process";
import { logsCommand } from "./logs.js";

const mockCreateReadStream = vi.mocked(fs.createReadStream);
const mockStat = vi.mocked(fs.stat);
const mockSpawn = vi.mocked(spawn);

function makeStream(opts: { emitError?: Error; emitEnd?: boolean } = {}) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const stream = {
    pipe: vi.fn().mockReturnThis(),
    on: vi.fn().mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
      return stream;
    }),
    emit(event: string, ...args: unknown[]) {
      (listeners[event] ?? []).forEach((cb) => cb(...args));
    },
  };
  if (opts.emitError) {
    process.nextTick(() => stream.emit("error", opts.emitError));
  }
  return stream;
}

describe("logsCommand", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: ReturnType<typeof vi.spyOn<any, any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleErrorSpy: ReturnType<typeof vi.spyOn<any, any>>;

  beforeEach(() => {
    vi.resetAllMocks();
    exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: string | number | null) => {
      throw new Error(`process.exit(${_code})`);
    });
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("without --follow", () => {
    it("pipes run.log to stdout when the file exists", async () => {
      const stream = makeStream();
      mockCreateReadStream.mockReturnValue(stream as unknown as ReturnType<typeof fs.createReadStream>);

      const promise = logsCommand("42", {});

      // Allow async setup to happen
      await new Promise((r) => setImmediate(r));

      expect(mockCreateReadStream).toHaveBeenCalledWith(
        expect.stringContaining("runs/42/run.log")
      );
      expect(stream.pipe).toHaveBeenCalledWith(process.stdout);

      // Resolve the promise by simulating stream close
      stream.emit("close");
      await promise;
    });

    it("prints error message and exits 1 when log file does not exist", async () => {
      const enoentError = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      const stream = makeStream({ emitError: enoentError });
      mockCreateReadStream.mockReturnValue(stream as unknown as ReturnType<typeof fs.createReadStream>);

      await expect(logsCommand("99", {})).rejects.toThrow("process.exit(1)");

      expect(console.error).toHaveBeenCalledWith("No log found for task 99");
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("re-emits non-ENOENT stream errors", async () => {
      const otherError = new Error("EIO");
      const stream = makeStream({ emitError: otherError });
      mockCreateReadStream.mockReturnValue(stream as unknown as ReturnType<typeof fs.createReadStream>);

      await expect(logsCommand("77", {})).rejects.toThrow("process.exit(1)");

      // Should still exit 1 but not print the missing-log message
      expect(console.error).not.toHaveBeenCalledWith("No log found for task 77");
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("with --follow", () => {
    it("spawns tail -f when log file exists", async () => {
      const fakeChild = { on: vi.fn() };
      mockStat.mockImplementation((_path, cb) => {
        (cb as (err: null) => void)(null);
      });
      mockSpawn.mockReturnValue(fakeChild as unknown as ReturnType<typeof spawn>);

      await logsCommand("42", { follow: true });

      expect(mockStat).toHaveBeenCalledWith(
        expect.stringContaining("runs/42/run.log"),
        expect.any(Function)
      );
      expect(mockSpawn).toHaveBeenCalledWith(
        "tail",
        ["-f", expect.stringContaining("runs/42/run.log")],
        { stdio: "inherit" }
      );
    });

    it("prints message and exits 1 when log file does not exist", async () => {
      const enoentError = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      mockStat.mockImplementation((_path, cb) => {
        (cb as (err: Error) => void)(enoentError);
      });

      await expect(logsCommand("55", { follow: true })).rejects.toThrow("process.exit(1)");

      expect(console.error).toHaveBeenCalledWith(
        "Log file not yet created for task 55 — task may not have started"
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
