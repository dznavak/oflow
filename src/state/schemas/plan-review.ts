import { z } from "zod";

export const PlanReviewSchema = z.object({
  artifact: z.literal("plan-review"),
  task_id: z.string(),
  created_at: z.string(),
  verdict: z.enum(["PASS", "FAIL"]),
  issues: z.array(z.string()),
  suggestions: z.array(z.string()),
});

export type PlanReview = z.infer<typeof PlanReviewSchema>;
