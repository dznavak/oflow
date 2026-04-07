import { StateManager } from "../../state/manager.js";
import { getCurrentTaskId } from "../utils.js";

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
