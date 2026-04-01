import { appendFileSync } from "fs";
import { readFileSync } from "fs";
import { join } from "path";

function getCurrentTaskId(repoPath: string): string {
  const envTaskId = process.env.OFLOW_CURRENT_TASK_ID;
  if (envTaskId) return envTaskId;

  const currentFile = join(repoPath, ".oflow", "current");
  try {
    return readFileSync(currentFile, "utf-8").trim();
  } catch {
    throw new Error(
      "No current task ID found. Set OFLOW_CURRENT_TASK_ID env var or create .oflow/current file."
    );
  }
}

function getEventsFilePath(repoPath: string): string {
  const taskId = getCurrentTaskId(repoPath);
  return join(repoPath, ".oflow", "runs", taskId, "events.jsonl");
}

function appendEvent(eventsFile: string, event: Record<string, unknown>): void {
  appendFileSync(eventsFile, JSON.stringify(event) + "\n", "utf-8");
}

export function reportStep(stepName: string, eventsFile: string): void {
  appendEvent(eventsFile, {
    type: "step",
    step: stepName,
    ts: new Date().toISOString(),
  });
}

export function reportArtifact(artifactName: string, eventsFile: string): void {
  appendEvent(eventsFile, {
    type: "artifact",
    name: artifactName,
    path: `${artifactName}.md`,
    ts: new Date().toISOString(),
  });
}

export function reportEstimate(score: number, estimatedSeconds: number, eventsFile: string): void {
  const taskId = process.env.OFLOW_CURRENT_TASK_ID ?? "";
  appendEvent(eventsFile, {
    type: "estimate",
    task_id: taskId,
    score,
    estimated_seconds: estimatedSeconds,
    ts: new Date().toISOString(),
  });
}

export function reportStatus(tokens: number | undefined, eventsFile: string): void {
  const event: Record<string, unknown> = {
    type: "status",
    ts: new Date().toISOString(),
  };
  if (tokens !== undefined) {
    event.tokens = tokens;
  }
  appendEvent(eventsFile, event);
}

export async function reportCmd(
  action: string,
  args: string[],
  options: { tokens?: number; score?: number; seconds?: number },
  repoPath: string
): Promise<void> {
  const eventsFile = getEventsFilePath(repoPath);

  switch (action) {
    case "step": {
      const stepName = args[0];
      if (!stepName) {
        console.error("Usage: oflow report step <step-name>");
        process.exit(1);
      }
      reportStep(stepName, eventsFile);
      break;
    }
    case "artifact": {
      const artifactName = args[0];
      if (!artifactName) {
        console.error("Usage: oflow report artifact <artifact-name>");
        process.exit(1);
      }
      reportArtifact(artifactName, eventsFile);
      break;
    }
    case "status": {
      reportStatus(options.tokens, eventsFile);
      break;
    }
    case "estimate": {
      const { score, seconds } = options;
      if (score === undefined || seconds === undefined) {
        console.error("Usage: oflow report estimate --score <n> --seconds <n>");
        process.exit(1);
      }
      reportEstimate(score, seconds, eventsFile);
      break;
    }
    default:
      console.error(`Unknown report action: ${action}. Use: step, artifact, status, estimate`);
      process.exit(1);
  }
}
