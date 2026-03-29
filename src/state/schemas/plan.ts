import { z } from "zod";

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
