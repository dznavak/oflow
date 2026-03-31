import { vi } from "vitest";
import type { Task } from "./adapters/board/index.js";

export function makeTask(overrides: Partial<Task> = {}): Task {
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

export function makeMockAdapter() {
  return {
    listAvailableTasks: vi.fn(),
    claimTask: vi.fn(),
    updateTask: vi.fn(),
    getTask: vi.fn(),
  };
}

export function makeMockStateManager() {
  return {
    initRun: vi.fn().mockResolvedValue("/tmp/run"),
    writeTaskContext: vi.fn().mockResolvedValue(undefined),
    readTaskContext: vi.fn(),
    writeArtifact: vi.fn(),
    readArtifact: vi.fn(),
    listArtifacts: vi.fn(),
    getRunDir: vi.fn().mockReturnValue("/tmp/run"),
  };
}
