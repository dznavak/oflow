import { mkdir, writeFile, readFile, readdir } from "fs/promises";
import { join } from "path";

export interface TaskContext {
  id: string;
  title: string;
  description: string;
  labels: string[];
  workflow: string;
  url: string;
  repoPath: string;
  runDir: string;
}

export class StateManager {
  constructor(private repoRoot: string) {}

  getRunDir(taskId: string): string {
    return join(this.repoRoot, ".oflow", "runs", taskId);
  }

  async initRun(taskId: string): Promise<string> {
    const runDir = this.getRunDir(taskId);
    await mkdir(runDir, { recursive: true });
    return runDir;
  }

  async writeArtifact(taskId: string, name: string, content: string): Promise<void> {
    const runDir = this.getRunDir(taskId);
    await writeFile(join(runDir, `${name}.md`), content, "utf-8");
  }

  async readArtifact(taskId: string, name: string): Promise<string> {
    const runDir = this.getRunDir(taskId);
    return readFile(join(runDir, `${name}.md`), "utf-8");
  }

  async listArtifacts(taskId: string): Promise<string[]> {
    const runDir = this.getRunDir(taskId);
    const entries = await readdir(runDir);
    return entries
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3));
  }

  async writeTaskContext(taskId: string, context: TaskContext): Promise<void> {
    const runDir = this.getRunDir(taskId);
    await writeFile(
      join(runDir, "task-context.json"),
      JSON.stringify(context, null, 2),
      "utf-8"
    );
  }

  async readTaskContext(taskId: string): Promise<TaskContext> {
    const runDir = this.getRunDir(taskId);
    const content = await readFile(join(runDir, "task-context.json"), "utf-8");
    return JSON.parse(content) as TaskContext;
  }
}
