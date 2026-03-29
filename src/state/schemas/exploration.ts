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
