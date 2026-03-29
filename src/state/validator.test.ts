import { describe, it, expect } from "vitest";
import { validateArtifact } from "./validator.js";

const validExploration = `---
artifact: exploration
task_id: GH-42
created_at: 2026-03-28T10:00:00Z
repo_summary: A TypeScript project for workflow automation
relevant_files:
  - src/index.ts
key_patterns:
  - Use ESM imports with .js extension
risks:
  - Complex refactor needed
---

## Repository Overview
Test content
`;

const invalidExploration = `---
artifact: exploration
task_id: GH-42
---

## Missing required fields
`;

const validPlan = `---
artifact: plan
task_id: GH-42
created_at: 2026-03-28T10:00:00Z
verdict: PENDING
approach: Refactor the module incrementally
subtasks:
  - id: 1
    title: Step one
    estimate: small
open_questions: []
---

## Plan details
`;

describe("validateArtifact", () => {
  it("returns success for valid exploration artifact", () => {
    const result = validateArtifact("exploration", validExploration);
    expect(result.success).toBe(true);
  });

  it("returns error list for invalid exploration artifact", () => {
    const result = validateArtifact("exploration", invalidExploration);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toBeInstanceOf(Array);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/repo_summary|created_at/);
    }
  });

  it("returns success for valid plan artifact", () => {
    const result = validateArtifact("plan", validPlan);
    expect(result.success).toBe(true);
  });

  it("returns error for unknown artifact type", () => {
    const result = validateArtifact("unknown-artifact", "---\nfoo: bar\n---\n");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]).toMatch(/unknown/i);
    }
  });

  it("returns error for non-parseable frontmatter", () => {
    const result = validateArtifact("exploration", "no frontmatter at all");
    expect(result.success).toBe(false);
  });
});
