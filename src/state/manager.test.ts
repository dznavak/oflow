import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StateManager } from "./manager.js";
import { mkdtemp, rm, readFile } from "fs/promises";
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

    it("auto-emits an artifact event to events.jsonl", async () => {
      await manager.initRun("42");
      await manager.writeArtifact("42", "plan", "content");

      const eventsContent = await readFile(manager.eventsPath("42"), "utf-8");
      const lines = eventsContent.trim().split("\n").filter(Boolean);
      expect(lines).toHaveLength(1);
      const event = JSON.parse(lines[0]);
      expect(event.type).toBe("artifact");
      expect(event.name).toBe("plan");
      expect(event.path).toBe("plan.md");
      expect(typeof event.ts).toBe("string");
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

  describe("eventsPath", () => {
    it("returns the events.jsonl path for a task", () => {
      const p = manager.eventsPath("42");
      expect(p).toBe(join(tmpDir, ".oflow", "runs", "42", "events.jsonl"));
    });
  });

  describe("appendEvent", () => {
    it("creates events.jsonl and appends a JSON line", async () => {
      await manager.initRun("42");
      await manager.appendEvent("42", { type: "step", step: "exploration", ts: "2026-01-01T00:00:00.000Z" });
      const content = await readFile(manager.eventsPath("42"), "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toMatchObject({ type: "step", step: "exploration" });
    });

    it("appends multiple events as separate JSON lines", async () => {
      await manager.initRun("42");
      await manager.appendEvent("42", { type: "step", step: "exploration", ts: "2026-01-01T00:00:00.000Z" });
      await manager.appendEvent("42", { type: "artifact", name: "plan", path: "plan.md", ts: "2026-01-01T00:00:01.000Z" });
      const content = await readFile(manager.eventsPath("42"), "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toMatchObject({ type: "step" });
      expect(JSON.parse(lines[1])).toMatchObject({ type: "artifact" });
    });
  });

  describe("tailEvents", () => {
    it("returns a ChildProcess", async () => {
      await manager.initRun("42");
      const proc = manager.tailEvents("42", () => {});
      proc.kill();
      expect(proc.pid).toBeDefined();
    });

    it("calls callback with each line written to events.jsonl", async () => {
      await manager.initRun("42");
      const lines: string[] = [];
      const proc = manager.tailEvents("42", (line) => lines.push(line));

      // Give tail time to start, then append
      await new Promise((r) => setTimeout(r, 100));
      await manager.appendEvent("42", { type: "step", step: "test", ts: "2026-01-01T00:00:00.000Z" });
      await new Promise((r) => setTimeout(r, 200));

      proc.kill();

      expect(lines.length).toBeGreaterThanOrEqual(1);
      expect(JSON.parse(lines[0])).toMatchObject({ type: "step", step: "test" });
    });
  });

  describe("writeTaskContext / readTaskContext", () => {
    it("round-trips task context", async () => {
      await manager.initRun("42");
      const context = {
        id: "42",
        number: 42,
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
