import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { reportStep, reportArtifact, reportStatus, reportEstimate } from "./report.js";

describe("report commands", () => {
  let tmpDir: string;
  let eventsFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oflow-report-test-"));
    eventsFile = path.join(tmpDir, "events.jsonl");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function readEvents(): object[] {
    if (!fs.existsSync(eventsFile)) return [];
    return fs
      .readFileSync(eventsFile, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  describe("reportStep", () => {
    it("appends a step event to events.jsonl", () => {
      reportStep("exploration", eventsFile);
      const events = readEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: "step", step: "exploration" });
    });

    it("includes a ts field in ISO format", () => {
      reportStep("planning", eventsFile);
      const events = readEvents();
      const event = events[0] as { ts: string };
      expect(new Date(event.ts).toISOString()).toBe(event.ts);
    });

    it("appends multiple step events", () => {
      reportStep("exploration", eventsFile);
      reportStep("planning", eventsFile);
      const events = readEvents();
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({ type: "step", step: "exploration" });
      expect(events[1]).toMatchObject({ type: "step", step: "planning" });
    });
  });

  describe("reportArtifact", () => {
    it("appends an artifact event to events.jsonl", () => {
      reportArtifact("plan", eventsFile);
      const events = readEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: "artifact", name: "plan" });
    });

    it("includes path derived from artifact name", () => {
      reportArtifact("plan", eventsFile);
      const events = readEvents();
      const event = events[0] as { path: string };
      expect(event.path).toContain("plan");
    });

    it("includes a ts field in ISO format", () => {
      reportArtifact("plan", eventsFile);
      const events = readEvents();
      const event = events[0] as { ts: string };
      expect(new Date(event.ts).toISOString()).toBe(event.ts);
    });
  });

  describe("reportEstimate", () => {
    it("appends an estimate event to events.jsonl", () => {
      reportEstimate(42, 3600, eventsFile);
      const events = readEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: "estimate", score: 42, estimated_seconds: 3600 });
    });

    it("includes task_id in the estimate event", () => {
      reportEstimate(75, 1800, eventsFile);
      const events = readEvents();
      const event = events[0] as Record<string, unknown>;
      expect("task_id" in event).toBe(true);
    });

    it("includes a ts field in ISO format", () => {
      reportEstimate(50, 900, eventsFile);
      const events = readEvents();
      const event = events[0] as { ts: string };
      expect(new Date(event.ts).toISOString()).toBe(event.ts);
    });
  });

  describe("reportStatus", () => {
    it("appends a status event to events.jsonl", () => {
      reportStatus(undefined, eventsFile);
      const events = readEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: "status" });
    });

    it("includes tokens when provided", () => {
      reportStatus(1234, eventsFile);
      const events = readEvents();
      expect(events[0]).toMatchObject({ type: "status", tokens: 1234 });
    });

    it("omits tokens field when not provided", () => {
      reportStatus(undefined, eventsFile);
      const events = readEvents();
      const event = events[0] as Record<string, unknown>;
      expect("tokens" in event).toBe(false);
    });

    it("includes a ts field in ISO format", () => {
      reportStatus(undefined, eventsFile);
      const events = readEvents();
      const event = events[0] as { ts: string };
      expect(new Date(event.ts).toISOString()).toBe(event.ts);
    });
  });
});
