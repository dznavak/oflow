import { readFile } from "fs/promises";
import { join } from "path";

export async function getCurrentTaskId(repoPath: string): Promise<string> {
  const envTaskId = process.env.OFLOW_CURRENT_TASK_ID;
  if (envTaskId) return envTaskId;

  const currentFile = join(repoPath, ".oflow", "current");
  try {
    const content = await readFile(currentFile, "utf-8");
    return content.trim();
  } catch {
    throw new Error(
      "No current task ID found. Set OFLOW_CURRENT_TASK_ID env var or create .oflow/current file."
    );
  }
}
