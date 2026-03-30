import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StateManager } from "./manager.js";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

describe("StateManager", () => {
  let tmpDir: string;
  let manager: StateManager;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "oflow-test-"));
    manager = new StateManager(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("initRun", () => {
    it("creates the run directory", async () => {
      const runDir = await manager.initRun("42");

      expect(runDir).toContain("42");
      const { stat } = await import("fs/promises");
      const stats = await stat(runDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it("returns the run directory path", async () => {
      const runDir = await manager.initRun("GH-42");

      expect(runDir).toBe(join(tmpDir, ".oflow", "runs", "GH-42"));
    });
  });

  describe("getRunDir", () => {
    it("returns correct path without creating directory", () => {
      const runDir = manager.getRunDir("42");
      expect(runDir).toBe(join(tmpDir, ".oflow", "runs", "42"));
    });
  });

  describe("writeArtifact / readArtifact", () => {
    it("round-trips artifact content", async () => {
      await manager.initRun("42");
      const content = "---\nartifact: exploration\n---\n\n# Test";

      await manager.writeArtifact("42", "exploration", content);
      const read = await manager.readArtifact("42", "exploration");

      expect(read).toBe(content);
    });

    it("writes artifact as exploration.md", async () => {
      await manager.initRun("42");
      await manager.writeArtifact("42", "exploration", "content");

      const { stat } = await import("fs/promises");
      const stats = await stat(join(tmpDir, ".oflow", "runs", "42", "exploration.md"));
      expect(stats.isFile()).toBe(true);
    });
  });

  describe("listArtifacts", () => {
    it("returns correct artifact names", async () => {
      await manager.initRun("42");
      await manager.writeArtifact("42", "exploration", "content1");
      await manager.writeArtifact("42", "plan", "content2");

      const artifacts = await manager.listArtifacts("42");

      expect(artifacts).toContain("exploration");
      expect(artifacts).toContain("plan");
    });

    it("returns empty array when no artifacts", async () => {
      await manager.initRun("42");

      const artifacts = await manager.listArtifacts("42");

      expect(artifacts).toEqual([]);
    });
  });

  describe("writeTaskContext / readTaskContext", () => {
    it("round-trips task context", async () => {
      await manager.initRun("42");
      const context = {
        id: "42",
        title: "Test task",
        description: "Test description",
        labels: ["oflow-ready"],
        workflow: "dev-workflow",
        url: "https://github.com/owner/repo/issues/42",
        repoPath: "/repo",
        runDir: "/repo/.oflow/runs/42",
      };

      await manager.writeTaskContext("42", context);
      const read = await manager.readTaskContext("42");

      expect(read).toEqual(context);
    });
  });
});
