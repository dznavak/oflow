import { readFile } from "fs/promises";
import { join } from "path";
import { validateArtifact } from "../../state/validator.js";
import { getCurrentTaskId } from "../utils.js";

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
    throw new Error(`artifact file not found: ${artifactFile}`);
  }

  const result = validateArtifact(artifactName, content);

  if (result.success) {
    console.log(`✓ ${artifactName} is valid`);
    return;
  } else {
    const errorLines = result.errors.map((e) => `  - ${e}`).join("\n");
    throw new Error(`${artifactName} validation failed:\n${errorLines}`);
  }
}
