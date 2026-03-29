import { z } from "zod";

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
