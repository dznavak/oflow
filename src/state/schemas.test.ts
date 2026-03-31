import { describe, it, expect } from "vitest";
import {
  ExplorationSchema,
  PlanSchema,
  PlanReviewSchema,
  ImplementationSchema,
  ValidationSchema,
  ReviewSchema,
} from "./schemas.js";

describe("Artifact Schemas", () => {
  describe("ExplorationSchema", () => {
    it("accepts valid exploration frontmatter", () => {
      const valid = {
        artifact: "exploration",
        task_id: "GH-42",
        created_at: "2026-03-28T10:00:00Z",
        repo_summary: "A TypeScript project",
        relevant_files: ["src/index.ts"],
        key_patterns: ["use ESM imports"],
        risks: ["complex refactor"],
      };
      expect(() => ExplorationSchema.parse(valid)).not.toThrow();
    });

    it("rejects missing required fields", () => {
      const invalid = { artifact: "exploration" };
      const result = ExplorationSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        const fields = result.error.issues.map((i) => i.path[0]);
        expect(fields).toContain("task_id");
        expect(fields).toContain("repo_summary");
      }
    });
  });

  describe("PlanSchema", () => {
    it("accepts valid plan frontmatter", () => {
      const valid = {
        artifact: "plan",
        task_id: "GH-42",
        created_at: "2026-03-28T10:00:00Z",
        verdict: "PENDING",
        approach: "Refactor the module",
        subtasks: [
          { id: 1, title: "Step one", estimate: "small" },
        ],
        open_questions: [],
      };
      expect(() => PlanSchema.parse(valid)).not.toThrow();
    });

    it("rejects invalid verdict", () => {
      const invalid = {
        artifact: "plan",
        task_id: "GH-42",
        created_at: "2026-03-28T10:00:00Z",
        verdict: "UNKNOWN",
        approach: "x",
        subtasks: [],
        open_questions: [],
      };
      const result = PlanSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it("rejects missing approach", () => {
      const invalid = {
        artifact: "plan",
        task_id: "GH-42",
        created_at: "2026-03-28T10:00:00Z",
        verdict: "PENDING",
        subtasks: [],
        open_questions: [],
      };
      const result = PlanSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("PlanReviewSchema", () => {
    it("accepts valid plan-review frontmatter", () => {
      const valid = {
        artifact: "plan-review",
        task_id: "GH-42",
        created_at: "2026-03-28T10:00:00Z",
        verdict: "PASS",
        issues: [],
        suggestions: ["Consider edge cases"],
      };
      expect(() => PlanReviewSchema.parse(valid)).not.toThrow();
    });

    it("rejects verdict other than PASS/FAIL", () => {
      const invalid = {
        artifact: "plan-review",
        task_id: "GH-42",
        created_at: "2026-03-28T10:00:00Z",
        verdict: "PENDING",
        issues: [],
        suggestions: [],
      };
      const result = PlanReviewSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("ImplementationSchema", () => {
    it("accepts valid implementation frontmatter", () => {
      const valid = {
        artifact: "implementation",
        task_id: "GH-42",
        subtask_id: 1,
        created_at: "2026-03-28T10:00:00Z",
        files_changed: ["src/index.ts"],
        tests_added: ["src/index.test.ts"],
        status: "completed",
      };
      expect(() => ImplementationSchema.parse(valid)).not.toThrow();
    });

    it("rejects missing subtask_id", () => {
      const invalid = {
        artifact: "implementation",
        task_id: "GH-42",
        created_at: "2026-03-28T10:00:00Z",
        files_changed: [],
        tests_added: [],
        status: "completed",
      };
      const result = ImplementationSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("ValidationSchema", () => {
    it("accepts valid validation frontmatter", () => {
      const valid = {
        artifact: "validation",
        task_id: "GH-42",
        created_at: "2026-03-28T10:00:00Z",
        verdict: "PASS",
        test_results: "All 42 tests passed",
        issues: [],
      };
      expect(() => ValidationSchema.parse(valid)).not.toThrow();
    });

    it("rejects missing test_results", () => {
      const invalid = {
        artifact: "validation",
        task_id: "GH-42",
        created_at: "2026-03-28T10:00:00Z",
        verdict: "PASS",
        issues: [],
      };
      const result = ValidationSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe("ReviewSchema", () => {
    it("accepts valid review frontmatter", () => {
      const valid = {
        artifact: "review",
        task_id: "GH-42",
        created_at: "2026-03-28T10:00:00Z",
        verdict: "PASS",
        blockers: [],
        suggestions: [],
      };
      expect(() => ReviewSchema.parse(valid)).not.toThrow();
    });

    it("rejects missing blockers field", () => {
      const invalid = {
        artifact: "review",
        task_id: "GH-42",
        created_at: "2026-03-28T10:00:00Z",
        verdict: "PASS",
        suggestions: [],
      };
      const result = ReviewSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});
