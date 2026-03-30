import { readFile } from "fs/promises";
import { join } from "path";
import { validateArtifact } from "../../state/validator.js";

async function getCurrentTaskId(repoPath: string): Promise<string> {
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

export async function validateArtifactCmd(
  artifactName: string,
  repoPath: string
): Promise<void> {
  const taskId = await getCurrentTaskId(repoPath);
  const artifactFile = join(repoPath, ".oflow", "runs", taskId, `${artifactName}.md`);

  let content: string;
  try {
    content = await readFile(artifactFile, "utf-8");
  } catch {
    console.error(`Error: artifact file not found: ${artifactFile}`);
    process.exit(1);
  }

  const result = validateArtifact(artifactName, content);

  if (result.success) {
    console.log(`✓ ${artifactName} is valid`);
    process.exit(0);
  } else {
    console.error(`✗ ${artifactName} validation failed:`);
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
}
