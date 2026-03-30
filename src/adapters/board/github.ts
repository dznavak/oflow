import { Octokit } from "@octokit/rest";
import type { Config } from "../../config/types.js";
import type { BoardAdapter, Task, TaskUpdate } from "./index.js";

export class GitHubBoardAdapter implements BoardAdapter {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(private config: Config) {
    this.octokit = new Octokit({ auth: config.githubToken });
    const [owner, repo] = (config.githubRepo ?? "").split("/");
    this.owner = owner;
    this.repo = repo;
  }

  private issueToTask(issue: {
    number: number;
    title: string;
    body?: string | null;
    labels: Array<{ name?: string } | string>;
    html_url: string;
  }): Task {
    const labelNames = issue.labels.map((l) =>
      typeof l === "string" ? l : (l.name ?? "")
    );

    const workflowLabel = labelNames.find((l) => l.startsWith("workflow:"));
    const workflow = workflowLabel
      ? workflowLabel.slice("workflow:".length)
      : this.config.defaultWorkflow;

    return {
      id: String(issue.number),
      number: issue.number,
      title: issue.title,
      description: issue.body ?? "",
      labels: labelNames,
      url: issue.html_url,
      workflow,
    };
  }

  async listAvailableTasks(label?: string): Promise<Task[]> {
    const labels = label
      ? `${this.config.taskLabel},${label}`
      : this.config.taskLabel;
    const response = await this.octokit.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      labels,
      state: "open",
    });

    return response.data.map((issue) => this.issueToTask(issue));
  }

  async claimTask(taskId: string): Promise<Task> {
    const issueNumber = parseInt(taskId, 10);

    let issue;
    try {
      const response = await this.octokit.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
      });
      issue = response.data;
    } catch (err) {
      throw new Error(
        `Task ${taskId} not found: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    await this.octokit.issues.addLabels({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      labels: [this.config.taskInProgressLabel],
    });

    await this.octokit.issues.removeLabel({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      name: this.config.taskLabel,
    });

    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body: "🤖 oflow picking up this task",
    });

    return this.issueToTask(issue);
  }

  async updateTask(taskId: string, update: TaskUpdate): Promise<void> {
    const issueNumber = parseInt(taskId, 10);

    if (update.status) {
      const labelMap: Record<string, string> = {
        "in-progress": this.config.taskInProgressLabel,
        done: this.config.taskDoneLabel,
        failed: this.config.taskDoneLabel,
      };

      const removeMap: Record<string, string> = {
        "in-progress": this.config.taskLabel,
        done: this.config.taskInProgressLabel,
        failed: this.config.taskInProgressLabel,
      };

      const newLabel = labelMap[update.status];
      const removeLabel = removeMap[update.status];

      if (newLabel) {
        await this.octokit.issues.addLabels({
          owner: this.owner,
          repo: this.repo,
          issue_number: issueNumber,
          labels: [newLabel],
        });
      }

      if (removeLabel) {
        await this.octokit.issues.removeLabel({
          owner: this.owner,
          repo: this.repo,
          issue_number: issueNumber,
          name: removeLabel,
        });
      }
    }

    if (update.comment) {
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        body: update.comment,
      });
    }
  }

  async getTask(taskId: string): Promise<Task> {
    const issueNumber = parseInt(taskId, 10);

    const response = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });

    return this.issueToTask(response.data);
  }
}
