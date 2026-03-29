import { z } from "zod";

export const ValidationSchema = z.object({
  artifact: z.literal("validation"),
  task_id: z.string(),
  created_at: z.string(),
  verdict: z.enum(["PASS", "FAIL"]),
  test_results: z.string(),
  issues: z.array(z.string()),
});

export type Validation = z.infer<typeof ValidationSchema>;
