import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// Mock child_process at module level
vi.mock("child_process", () => {
  const mockStdin = { write: vi.fn(), end: vi.fn() };
  const mockProcess = {
    pid: 99999,
    stdin: mockStdin,
    stdout: null,
    stderr: null,
    on: vi.fn(),
    kill: vi.fn(),
    unref: vi.fn(),
  };
  return {
    spawn: vi.fn(() => mockProcess),
  };
});

// Mock fs/promises to return a fake FileHandle (avoids unclosed fd GC errors)
const mockLogFd = {
  fd: 5,
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
import { ClaudeCodeAdapter } from "./claude-code.js";

describe("ClaudeCodeAdapter", () => {
  let tmpDir: string;
  let adapter: ClaudeCodeAdapter;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let _mockChildProcess: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLogFd.close.mockResolvedValue(undefined);
    tmpDir = await mkdtemp(join(tmpdir(), "oflow-agent-test-"));
    adapter = new ClaudeCodeAdapter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _mockChildProcess = (spawnMock as any).mock.results[0]?.value ?? {
      pid: 99999,
      on: vi.fn(),
      kill: vi.fn(),
      unref: vi.fn(),
    };
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (spawnMock as any).mockReturnValue({
        pid: 99999,
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn(),
        unref: vi.fn(),
        stdout: null,
        stderr: null,
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

    it("spawns claude with -p and --dangerously-skip-permissions via stdin", async () => {
      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");
      await writeFile(skillFile, "# Skill");
      await writeFile(taskContextFile, "{}");

      const mockStdin = { write: vi.fn(), end: vi.fn() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (spawnMock as any).mockReturnValue({
        pid: 99999,
        stdin: mockStdin,
        on: vi.fn(),
        unref: vi.fn(),
        stdout: null,
        stderr: null,
      });

      await adapter.spawn({ skill: skillFile, taskContextFile, repoPath: tmpDir, taskId: "42", logFile });

      const spawnCall = (spawnMock as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(spawnCall[1]).toContain("-p");
      expect(spawnCall[1]).toContain("--dangerously-skip-permissions");
      expect(mockStdin.write).toHaveBeenCalled();
      expect(mockStdin.end).toHaveBeenCalled();
    });

    it("sets OFLOW_CURRENT_TASK_ID env var for child process", async () => {
      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");

      await writeFile(skillFile, "# Skill");
      await writeFile(taskContextFile, "{}");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (spawnMock as any).mockReturnValue({
        pid: 12345,
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn(),
        unref: vi.fn(),
        stdout: null,
        stderr: null,
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
    it("returns running when process is alive", async () => {
      // Mock process.kill to not throw (process is running)
      const killSpy = vi.spyOn(process, "kill").mockReturnValue(true);

      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");
      await writeFile(skillFile, "# Skill");
      await writeFile(taskContextFile, "{}");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (spawnMock as any).mockReturnValue({
        pid: 99999,
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn(),
        unref: vi.fn(),
        stdout: null,
        stderr: null,
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

    it("returns completed when process is not running", async () => {
      // Mock process.kill to throw ESRCH (process not found)
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (spawnMock as any).mockReturnValue({
        pid: 99999,
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn(),
        unref: vi.fn(),
        stdout: null,
        stderr: null,
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
    function makeSpawnMocks(closeHandlerRef: { value?: (code: number | null) => void }) {
      // claude process — captures the close handler
      const claudeMock = {
        pid: 99999,
        stdin: { write: vi.fn(), end: vi.fn() },
        stdout: null,
        stderr: null,
        on: vi.fn((event: string, handler: (code: number | null) => void) => {
          if (event === "close") closeHandlerRef.value = handler;
        }),
        kill: vi.fn(),
        unref: vi.fn(),
      };
      // tail process — no close handler needed
      const tailMock = {
        pid: 88888,
        stdin: null,
        stdout: null,
        stderr: null,
        on: vi.fn(),
        kill: vi.fn(),
        unref: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (spawnMock as any).mockReturnValueOnce(claudeMock).mockReturnValueOnce(tailMock);
    }

    it("resolves with exit code after process closes (already-exited race case)", async () => {
      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");
      await writeFile(skillFile, "# Skill");
      await writeFile(taskContextFile, "{}");
      await writeFile(logFile, "");

      const closeHandlerRef: { value?: (code: number | null) => void } = {};
      makeSpawnMocks(closeHandlerRef);

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

    it("resolves with failed status when process exits with non-zero code", async () => {
      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");
      await writeFile(skillFile, "# Skill");
      await writeFile(taskContextFile, "{}");
      await writeFile(logFile, "");

      const closeHandlerRef: { value?: (code: number | null) => void } = {};
      makeSpawnMocks(closeHandlerRef);

      const session = await adapter.spawn({
        skill: skillFile,
        taskContextFile,
        repoPath: tmpDir,
        taskId: "42",
        logFile,
      });

      // Start waiting, then fire close handler
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
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn(),
        unref: vi.fn(),
        stdout: null,
        stderr: null,
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
