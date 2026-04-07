import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// Mock child_process at module level
vi.mock("child_process", () => {
  const mockStdout = { pipe: vi.fn() };
  const mockStderr = { pipe: vi.fn() };
  const mockProcess = {
    pid: 99999,
    stdout: mockStdout,
    stderr: mockStderr,
    on: vi.fn(),
    unref: vi.fn(),
  };
  return {
    spawn: vi.fn(() => mockProcess),
  };
});

// Mock fs/promises to return a fake FileHandle (avoids unclosed fd GC errors)
const mockLogFd = {
  createWriteStream: vi.fn(() => ({ write: vi.fn(), end: vi.fn() })),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    open: vi.fn(async (_path: string, _flags: string) => mockLogFd),
  };
});

import { spawn as spawnMock } from "child_process";
import { OpencodeAdapter } from "./opencode.js";

describe("OpencodeAdapter", () => {
  let tmpDir: string;
  let adapter: OpencodeAdapter;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLogFd.createWriteStream.mockReturnValue({ write: vi.fn(), end: vi.fn() });
    mockLogFd.close.mockResolvedValue(undefined);
    tmpDir = await mkdtemp(join(tmpdir(), "oflow-opencode-test-"));
    adapter = new OpencodeAdapter();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("spawn", () => {
    it("spawns a process and returns a session", async () => {
      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");

      await writeFile(skillFile, "# Skill content");
      await writeFile(taskContextFile, JSON.stringify({ id: "42" }));
      await writeFile(logFile, "");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (spawnMock as any).mockReturnValue({
        pid: 99999,
        stdout: { pipe: vi.fn() },
        stderr: { pipe: vi.fn() },
        on: vi.fn(),
        unref: vi.fn(),
      });

      const session = await adapter.spawn({
        skill: skillFile,
        taskContextFile,
        repoPath: tmpDir,
        taskId: "42",
        logFile,
      });

      expect(session.pid).toBe(99999);
      expect(session.taskId).toBe("42");
      expect(session.logFile).toBe(logFile);
      expect(session.id).toBeTruthy();
      expect(spawnMock).toHaveBeenCalled();
    });

    it("spawns opencode with run --prompt args", async () => {
      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");
      await writeFile(skillFile, "# Skill");
      await writeFile(taskContextFile, "{}");
      await writeFile(logFile, "");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (spawnMock as any).mockReturnValue({
        pid: 99999,
        stdout: { pipe: vi.fn() },
        stderr: { pipe: vi.fn() },
        on: vi.fn(),
        unref: vi.fn(),
      });

      await adapter.spawn({ skill: skillFile, taskContextFile, repoPath: tmpDir, taskId: "42", logFile });

      const spawnCall = (spawnMock as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(spawnCall[0]).toBe("opencode");
      expect(spawnCall[1]).toContain("run");
      expect(spawnCall[1]).toContain("--prompt");
    });

    it("sets OFLOW_CURRENT_TASK_ID env var for child process", async () => {
      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");

      await writeFile(skillFile, "# Skill");
      await writeFile(taskContextFile, "{}");
      await writeFile(logFile, "");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (spawnMock as any).mockReturnValue({
        pid: 12345,
        stdout: { pipe: vi.fn() },
        stderr: { pipe: vi.fn() },
        on: vi.fn(),
        unref: vi.fn(),
      });

      await adapter.spawn({
        skill: skillFile,
        taskContextFile,
        repoPath: tmpDir,
        taskId: "42",
        logFile,
      });

      const spawnCall = (spawnMock as ReturnType<typeof vi.fn>).mock.calls[0];
      const spawnOptions = spawnCall[2] as { env?: Record<string, string> };
      expect(spawnOptions.env?.OFLOW_CURRENT_TASK_ID).toBe("42");
    });
  });

  describe("getStatus", () => {
    it("returns completed from exitCodes map when exit code is 0", async () => {
      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");
      await writeFile(skillFile, "# Skill");
      await writeFile(taskContextFile, "{}");
      await writeFile(logFile, "");

      let closeHandler: ((code: number | null) => void) | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (spawnMock as any).mockReturnValue({
        pid: 99999,
        stdout: { pipe: vi.fn() },
        stderr: { pipe: vi.fn() },
        on: vi.fn((event: string, handler: (code: number | null) => void) => {
          if (event === "close") closeHandler = handler;
        }),
        unref: vi.fn(),
      });

      const session = await adapter.spawn({
        skill: skillFile,
        taskContextFile,
        repoPath: tmpDir,
        taskId: "42",
        logFile,
      });

      // Simulate process exit with code 0
      closeHandler?.(0);

      const status = await adapter.getStatus(session.id);
      expect(status).toBe("completed");
    });

    it("returns failed from exitCodes map when exit code is non-zero", async () => {
      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");
      await writeFile(skillFile, "# Skill");
      await writeFile(taskContextFile, "{}");
      await writeFile(logFile, "");

      let closeHandler: ((code: number | null) => void) | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (spawnMock as any).mockReturnValue({
        pid: 99999,
        stdout: { pipe: vi.fn() },
        stderr: { pipe: vi.fn() },
        on: vi.fn((event: string, handler: (code: number | null) => void) => {
          if (event === "close") closeHandler = handler;
        }),
        unref: vi.fn(),
      });

      const session = await adapter.spawn({
        skill: skillFile,
        taskContextFile,
        repoPath: tmpDir,
        taskId: "42",
        logFile,
      });

      // Simulate process exit with non-zero code
      closeHandler?.(1);

      const status = await adapter.getStatus(session.id);
      expect(status).toBe("failed");
    });

    it("returns running when process is alive (no exit code yet)", async () => {
      const killSpy = vi.spyOn(process, "kill").mockReturnValue(true);

      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");
      await writeFile(skillFile, "# Skill");
      await writeFile(taskContextFile, "{}");
      await writeFile(logFile, "");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (spawnMock as any).mockReturnValue({
        pid: 99999,
        stdout: { pipe: vi.fn() },
        stderr: { pipe: vi.fn() },
        on: vi.fn(),
        unref: vi.fn(),
      });

      const session = await adapter.spawn({
        skill: skillFile,
        taskContextFile,
        repoPath: tmpDir,
        taskId: "42",
        logFile,
      });

      const status = await adapter.getStatus(session.id);
      expect(status).toBe("running");
      killSpy.mockRestore();
    });

    it("returns completed when process is not running (ESRCH, no exit code)", async () => {
      const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
        const err = new Error("ESRCH") as NodeJS.ErrnoException;
        err.code = "ESRCH";
        throw err;
      });

      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");
      await writeFile(skillFile, "# Skill");
      await writeFile(taskContextFile, "{}");
      await writeFile(logFile, "");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (spawnMock as any).mockReturnValue({
        pid: 99999,
        stdout: { pipe: vi.fn() },
        stderr: { pipe: vi.fn() },
        on: vi.fn(),
        unref: vi.fn(),
      });

      const session = await adapter.spawn({
        skill: skillFile,
        taskContextFile,
        repoPath: tmpDir,
        taskId: "42",
        logFile,
      });

      const status = await adapter.getStatus(session.id);
      expect(status).toBe("completed");
      killSpy.mockRestore();
    });
  });

  describe("waitForCompletion", () => {
    function makeSpawnMock(closeHandlerRef: { value?: (code: number | null) => void }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (spawnMock as any).mockReturnValue({
        pid: 99999,
        stdout: { pipe: vi.fn() },
        stderr: { pipe: vi.fn() },
        on: vi.fn((event: string, handler: (code: number | null) => void) => {
          if (event === "close") closeHandlerRef.value = handler;
        }),
        unref: vi.fn(),
      });
    }

    it("returns actual exit code from exitCodes map", async () => {
      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");
      await writeFile(skillFile, "# Skill");
      await writeFile(taskContextFile, "{}");
      await writeFile(logFile, "");

      const closeHandlerRef: { value?: (code: number | null) => void } = {};
      makeSpawnMock(closeHandlerRef);

      const session = await adapter.spawn({
        skill: skillFile,
        taskContextFile,
        repoPath: tmpDir,
        taskId: "42",
        logFile,
      });

      // Simulate process exit with code 42 (non-zero)
      closeHandlerRef.value?.(42);

      const result = await adapter.waitForCompletion(session.id);
      expect(result.exitCode).toBe(42);
      expect(result.status).toBe("failed");
    });

    it("resolves immediately when process has already exited (race case)", async () => {
      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");
      await writeFile(skillFile, "# Skill");
      await writeFile(taskContextFile, "{}");
      await writeFile(logFile, "");

      const closeHandlerRef: { value?: (code: number | null) => void } = {};
      makeSpawnMock(closeHandlerRef);

      const session = await adapter.spawn({
        skill: skillFile,
        taskContextFile,
        repoPath: tmpDir,
        taskId: "42",
        logFile,
      });

      // Simulate process exit before waitForCompletion is called
      closeHandlerRef.value?.(0);

      const result = await adapter.waitForCompletion(session.id);
      expect(result.exitCode).toBe(0);
      expect(result.status).toBe("completed");
    });

    it("resolves via resolver when process exits after waitForCompletion is called", async () => {
      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");
      await writeFile(skillFile, "# Skill");
      await writeFile(taskContextFile, "{}");
      await writeFile(logFile, "");

      const closeHandlerRef: { value?: (code: number | null) => void } = {};
      makeSpawnMock(closeHandlerRef);

      const session = await adapter.spawn({
        skill: skillFile,
        taskContextFile,
        repoPath: tmpDir,
        taskId: "42",
        logFile,
      });

      // Start waiting, then fire close handler (no polling needed)
      const resultPromise = adapter.waitForCompletion(session.id);
      closeHandlerRef.value?.(1);

      const result = await resultPromise;
      expect(result.exitCode).toBe(1);
      expect(result.status).toBe("failed");
    });
  });

  describe("getLogs", () => {
    it("reads logFile content", async () => {
      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");
      await writeFile(skillFile, "# Skill");
      await writeFile(taskContextFile, "{}");
      await writeFile(logFile, "agent output here");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (spawnMock as any).mockReturnValue({
        pid: 99999,
        stdout: { pipe: vi.fn() },
        stderr: { pipe: vi.fn() },
        on: vi.fn(),
        unref: vi.fn(),
      });

      const session = await adapter.spawn({
        skill: skillFile,
        taskContextFile,
        repoPath: tmpDir,
        taskId: "42",
        logFile,
      });

      const logs = await adapter.getLogs(session.id);
      expect(logs).toBe("agent output here");
    });
  });
});
