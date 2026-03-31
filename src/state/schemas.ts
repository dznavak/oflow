import { z } from "zod";

export const ExplorationSchema = z.object({
  artifact: z.literal("exploration"),
  task_id: z.string(),
  created_at: z.string(),
  repo_summary: z.string(),
  relevant_files: z.array(z.string()),
  key_patterns: z.array(z.string()),
  risks: z.array(z.string()),
});

export type Exploration = z.infer<typeof ExplorationSchema>;

export const PlanSchema = z.object({
  artifact: z.literal("plan"),
  task_id: z.string(),
  created_at: z.string(),
  verdict: z.enum(["PENDING", "PASS", "FAIL"]),
  approach: z.string(),
  subtasks: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      estimate: z.enum(["small", "medium", "large"]),
    })
  ),
  open_questions: z.array(z.string()),
});

export type Plan = z.infer<typeof PlanSchema>;

export const PlanReviewSchema = z.object({
  artifact: z.literal("plan-review"),
  task_id: z.string(),
  created_at: z.string(),
  verdict: z.enum(["PASS", "FAIL"]),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
});

export type PlanReview = z.infer<typeof PlanReviewSchema>;

export const ImplementationSchema = z.object({
  artifact: z.literal("implementation"),
  task_id: z.string(),
  subtask_id: z.number(),
  created_at: z.string(),
  files_changed: z.array(z.string()),
  tests_added: z.array(z.string()),
  status: z.enum(["completed", "failed"]),
});

export type Implementation = z.infer<typeof ImplementationSchema>;

export const ValidationSchema = z.object({
  artifact: z.literal("validation"),
  task_id: z.string(),
  created_at: z.string(),
  verdict: z.enum(["PASS", "FAIL"]),
  test_results: z.string(),
  issues: z.array(z.string()),
});

export type Validation = z.infer<typeof ValidationSchema>;

export const ReviewSchema = z.object({
  artifact: z.literal("review"),
  task_id: z.string(),
  created_at: z.string(),
  verdict: z.enum(["PASS", "FAIL"]),
  blockers: z.array(z.string()),
  suggestions: z.array(z.string()),
});

export type Review = z.infer<typeof ReviewSchema>;
