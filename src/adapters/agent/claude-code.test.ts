import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// Mock child_process at module level
vi.mock("child_process", () => {
  const mockProcess = {
    pid: 99999,
    stdout: null,
    stderr: null,
    on: vi.fn(),
    unref: vi.fn(),
  };
  return {
    spawn: vi.fn(() => mockProcess),
  };
});

import { spawn as spawnMock } from "child_process";
import { ClaudeCodeAdapter } from "./claude-code.js";

describe("ClaudeCodeAdapter", () => {
  let tmpDir: string;
  let adapter: ClaudeCodeAdapter;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockChildProcess: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await mkdtemp(join(tmpdir(), "oflow-agent-test-"));
    adapter = new ClaudeCodeAdapter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockChildProcess = (spawnMock as any).mock.results[0]?.value ?? {
      pid: 99999,
      on: vi.fn(),
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

    it("sets OFLOW_CURRENT_TASK_ID env var for child process", async () => {
      const skillFile = join(tmpDir, "skill.md");
      const taskContextFile = join(tmpDir, "task-context.json");
      const logFile = join(tmpDir, "run.log");

      await writeFile(skillFile, "# Skill");
      await writeFile(taskContextFile, "{}");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (spawnMock as any).mockReturnValue({
        pid: 12345,
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
