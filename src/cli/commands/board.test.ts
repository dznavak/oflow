import { describe, it, expect, vi, beforeEach } from "vitest";
import { listTasks, pickTask, updateTask } from "./board.js";
import type { Task } from "../../adapters/board/index.js";

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

function makeMockAdapter() {
  return {
    listAvailableTasks: vi.fn(),
    claimTask: vi.fn(),
    updateTask: vi.fn(),
    getTask: vi.fn(),
  };
}

function makeMockStateManager() {
  return {
    initRun: vi.fn(),
    writeTaskContext: vi.fn(),
    readTaskContext: vi.fn(),
    writeArtifact: vi.fn(),
    readArtifact: vi.fn(),
    listArtifacts: vi.fn(),
    getRunDir: vi.fn(),
  };
}

describe("board commands", () => {
  let adapter: ReturnType<typeof makeMockAdapter>;
  let stateManager: ReturnType<typeof makeMockStateManager>;
  let output: string[];

  beforeEach(() => {
    adapter = makeMockAdapter();
    stateManager = makeMockStateManager();
    output = [];
    vi.spyOn(process.stdout, "write").mockImplementation((data) => {
      output.push(String(data));
      return true;
    });
  });

  describe("listTasks", () => {
    it("prints JSON array of tasks", async () => {
      adapter.listAvailableTasks.mockResolvedValue([makeTask()]);

      await listTasks(adapter);

      const printed = output.join("");
      const parsed = JSON.parse(printed);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe("42");
    });

    it("prints empty array when no tasks", async () => {
      adapter.listAvailableTasks.mockResolvedValue([]);

      await listTasks(adapter);

      const printed = output.join("");
      expect(JSON.parse(printed)).toEqual([]);
    });
  });

  describe("pickTask", () => {
    it("claims next available task and prints task JSON", async () => {
      const task = makeTask();
      adapter.listAvailableTasks.mockResolvedValue([task]);
      adapter.claimTask.mockResolvedValue(task);
      stateManager.initRun.mockResolvedValue("/path/to/run");
      stateManager.writeTaskContext.mockResolvedValue(undefined);

      await pickTask(adapter, stateManager, "/repo");

      expect(adapter.claimTask).toHaveBeenCalledWith("42");
      expect(stateManager.initRun).toHaveBeenCalledWith("42");
      expect(stateManager.writeTaskContext).toHaveBeenCalledWith(
        "42",
        expect.objectContaining({ id: "42" })
      );
      const printed = output.join("");
      const parsed = JSON.parse(printed);
      expect(parsed.id).toBe("42");
    });

    it("throws when no available tasks", async () => {
      adapter.listAvailableTasks.mockResolvedValue([]);

      await expect(pickTask(adapter, stateManager, "/repo")).rejects.toThrow(
        /No available tasks/
      );
    });
  });

  describe("updateTask command", () => {
    it("calls adapter.updateTask with status and comment", async () => {
      adapter.updateTask.mockResolvedValue(undefined);

      await updateTask(adapter, "42", { status: "done", comment: "Done!" });

      expect(adapter.updateTask).toHaveBeenCalledWith("42", {
        status: "done",
        comment: "Done!",
      });
    });
  });
});
