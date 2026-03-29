import { z } from "zod";

export const ReviewSchema = z.object({
  artifact: z.literal("review"),
  task_id: z.string(),
  created_at: z.string(),
  verdict: z.enum(["PASS", "FAIL"]),
  blockers: z.array(z.string()),
  suggestions: z.array(z.string()),
});

export type Review = z.infer<typeof ReviewSchema>;
