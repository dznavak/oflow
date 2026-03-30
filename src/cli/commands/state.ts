import { readFile } from "fs/promises";
import { join } from "path";
import { StateManager } from "../../state/manager.js";

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

export async function stateInit(taskId: string, repoPath: string): Promise<void> {
  const manager = new StateManager(repoPath);
  const runDir = await manager.initRun(taskId);
  console.log(runDir);
}

export async function stateWrite(
  artifactName: string,
  repoPath: string
): Promise<void> {
  const taskId = await getCurrentTaskId(repoPath);
  const manager = new StateManager(repoPath);

  const content = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    process.stdin.on("error", reject);
  });

  await manager.writeArtifact(taskId, artifactName, content);
}

export async function stateRead(
  artifactName: string,
  repoPath: string
): Promise<void> {
  const taskId = await getCurrentTaskId(repoPath);
  const manager = new StateManager(repoPath);
  const content = await manager.readArtifact(taskId, artifactName);
  process.stdout.write(content);
}

export async function stateList(repoPath: string): Promise<void> {
  const taskId = await getCurrentTaskId(repoPath);
  const manager = new StateManager(repoPath);
  const artifacts = await manager.listArtifacts(taskId);
  console.log(artifacts.join("\n"));
}
