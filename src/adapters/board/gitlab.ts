import type { Config } from "../../config/types.js";
import type { BoardAdapter, Task, TaskUpdate } from "./index.js";

interface GitLabIssue {
  iid: number;
  title: string;
  description: string;
  labels: string[];
  web_url: string;
}

export class GitLabBoardAdapter implements BoardAdapter {
  private encodedProjectId: string;
  private baseUrl: string;
  private token: string;

  constructor(private config: Config) {
    this.encodedProjectId = encodeURIComponent(config.gitlabProjectId ?? "");
    this.baseUrl = config.gitlabUrl ?? "https://gitlab.com/api/v4";
    this.token = config.gitlabToken ?? "";
  }

  private get authHeaders(): Record<string, string> {
    return { "PRIVATE-TOKEN": this.token };
  }

  private async checkResponse(res: Response): Promise<void> {
    if (!res.ok) {
      throw new Error(`GitLab API error: ${res.status}`);
    }
  }

  private issueToTask(issue: GitLabIssue): Task {
    const labelNames = issue.labels;

    const workflowLabel = labelNames.find((l) => l.startsWith("workflow:"));
    const workflow = workflowLabel
      ? workflowLabel.slice("workflow:".length)
      : this.config.defaultWorkflow;

    return {
      id: String(issue.iid),
      number: issue.iid,
      title: issue.title,
      description: issue.description ?? "",
      labels: labelNames,
      url: issue.web_url,
      workflow,
    };
  }

  async listAvailableTasks(label?: string): Promise<Task[]> {
    const params = new URLSearchParams({
      state: "opened",
      labels: label ?? this.config.taskLabel,
      order_by: "created_at",
      sort: "asc",
    });

    const url = `${this.baseUrl}/projects/${this.encodedProjectId}/issues?${params}`;
    const res = await fetch(url, { headers: this.authHeaders });
    await this.checkResponse(res);

    const issues: GitLabIssue[] = await res.json();
    return issues.map((issue) => this.issueToTask(issue));
  }

  async claimTask(taskId: string): Promise<Task> {
    const iid = parseInt(taskId, 10);
    const issueUrl = `${this.baseUrl}/projects/${this.encodedProjectId}/issues/${iid}`;

    const getRes = await fetch(issueUrl, { headers: this.authHeaders });
    await this.checkResponse(getRes);
    const issue: GitLabIssue = await getRes.json();

    const putBody = new URLSearchParams({
      add_labels: this.config.taskInProgressLabel,
      remove_labels: this.config.taskLabel,
    });

    const putRes = await fetch(issueUrl, {
      method: "PUT",
      headers: {
        ...this.authHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: putBody.toString(),
    });
    await this.checkResponse(putRes);

    const noteUrl = `${this.baseUrl}/projects/${this.encodedProjectId}/issues/${iid}/notes`;
    const noteBody = new URLSearchParams({ body: "🤖 oflow picking up this task" });
    const noteRes = await fetch(noteUrl, {
      method: "POST",
      headers: {
        ...this.authHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: noteBody.toString(),
    });
    await this.checkResponse(noteRes);

    return this.issueToTask(issue);
  }

  async updateTask(taskId: string, update: TaskUpdate): Promise<void> {
    const iid = parseInt(taskId, 10);
    const issueUrl = `${this.baseUrl}/projects/${this.encodedProjectId}/issues/${iid}`;

    if (update.status) {
      const labelMap: Record<string, string> = {
        "in-progress": this.config.taskInProgressLabel,
        done: this.config.taskDoneLabel,
        failed: this.config.taskLabel,
      };

      const removeMap: Record<string, string> = {
        "in-progress": this.config.taskLabel,
        done: this.config.taskInProgressLabel,
        failed: this.config.taskInProgressLabel,
      };

      const addLabel = labelMap[update.status];
      const removeLabel = removeMap[update.status];

      const putBody = new URLSearchParams();
      if (addLabel) putBody.set("add_labels", addLabel);
      if (removeLabel) putBody.set("remove_labels", removeLabel);

      const putRes = await fetch(issueUrl, {
        method: "PUT",
        headers: {
          ...this.authHeaders,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: putBody.toString(),
      });

      if (!putRes.ok) {
        if (putRes.status === 404) {
          // Idempotent: label already absent is fine
        } else {
          throw new Error(`GitLab API error: ${putRes.status}`);
        }
      }
    }

    if (update.comment) {
      const noteUrl = `${this.baseUrl}/projects/${this.encodedProjectId}/issues/${iid}/notes`;
      const noteBody = new URLSearchParams({ body: update.comment });
      const noteRes = await fetch(noteUrl, {
        method: "POST",
        headers: {
          ...this.authHeaders,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: noteBody.toString(),
      });
      await this.checkResponse(noteRes);
    }
  }

  async getTask(taskId: string): Promise<Task> {
    const iid = parseInt(taskId, 10);
    const url = `${this.baseUrl}/projects/${this.encodedProjectId}/issues/${iid}`;
    const res = await fetch(url, { headers: this.authHeaders });
    await this.checkResponse(res);
    const issue: GitLabIssue = await res.json();
    return this.issueToTask(issue);
  }
}
