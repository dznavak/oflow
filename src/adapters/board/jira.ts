import type { Config } from "../../config/types.js";
import type { BoardAdapter, Task, TaskUpdate } from "./index.js";

interface JiraIssue {
  key: string;
  id: string;
  fields: {
    summary: string;
    description?: unknown;
    labels?: string[];
    status?: { name: string };
    assignee?: { displayName: string };
    [key: string]: unknown;
  };
}

interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

export class JiraBoardAdapter implements BoardAdapter {
  private baseUrl: string;
  private authHeader: string;
  private projectKey: string;

  constructor(private config: Config) {
    if (!config.jiraUrl || !config.jiraEmail || !config.jiraToken || !config.jiraProjectKey) {
      throw new Error("JiraBoardAdapter requires jiraUrl, jiraEmail, jiraToken, and jiraProjectKey");
    }
    this.baseUrl = config.jiraUrl.replace(/\/$/, "");
    this.authHeader = `Basic ${Buffer.from(`${config.jiraEmail}:${config.jiraToken}`).toString("base64")}`;
    this.projectKey = config.jiraProjectKey;
  }

  private get authHeaders(): Record<string, string> {
    return {
      Authorization: this.authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private async checkResponse(res: Response): Promise<void> {
    if (!res.ok) {
      throw new Error(`Jira API error: ${res.status}`);
    }
  }

  private issueToTask(issue: JiraIssue): Task {
    const labels: string[] = issue.fields.labels ?? [];
    const workflowLabel = labels.find((l) => l.startsWith("workflow:"));
    const workflow = workflowLabel
      ? workflowLabel.slice("workflow:".length)
      : this.config.defaultWorkflow;

    // Extract plain text from description (ADF or string)
    let description = "";
    if (typeof issue.fields.description === "string") {
      description = issue.fields.description;
    } else if (
      issue.fields.description &&
      typeof issue.fields.description === "object"
    ) {
      // ADF format — extract plain text from content nodes
      description = extractAdfText(issue.fields.description as AdfNode);
    }

    return {
      id: issue.key,
      number: parseInt(issue.id, 10),
      title: issue.fields.summary,
      description,
      labels,
      url: `${this.baseUrl}/browse/${issue.key}`,
      workflow,
    };
  }

  private async getTransitionId(
    issueKey: string,
    targetStatusName: string
  ): Promise<string> {
    const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/transitions`;
    const res = await fetch(url, { headers: this.authHeaders });
    await this.checkResponse(res);
    const data: { transitions: JiraTransition[] } = await res.json();

    const transition = data.transitions.find(
      (t) => t.to.name.toLowerCase() === targetStatusName.toLowerCase()
    );

    if (!transition) {
      const available = data.transitions.map((t) => t.to.name).join(", ");
      throw new Error(
        `Jira transition to "${targetStatusName}" not found for issue ${issueKey}. Available transitions: ${available}`
      );
    }

    return transition.id;
  }

  private async postTransition(issueKey: string, transitionId: string): Promise<void> {
    const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/transitions`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.authHeaders,
      body: JSON.stringify({ transition: { id: transitionId } }),
    });
    await this.checkResponse(res);
  }

  async listAvailableTasks(label?: string): Promise<Task[]> {
    const readyStatus = this.config.jiraReadyStatus ?? "To Do";
    let jql = `project = ${this.projectKey} AND assignee = currentUser() AND status = "${readyStatus}"`;
    if (label) {
      jql += ` AND labels = "${label}"`;
    }

    const params = new URLSearchParams({ jql, maxResults: "50" });
    const url = `${this.baseUrl}/rest/api/3/search?${params}`;
    const res = await fetch(url, { headers: this.authHeaders });
    await this.checkResponse(res);

    const data: { issues: JiraIssue[] } = await res.json();
    return data.issues.map((issue) => this.issueToTask(issue));
  }

  async claimTask(taskId: string): Promise<Task> {
    // Fetch the issue first
    const issueUrl = `${this.baseUrl}/rest/api/3/issue/${taskId}`;
    const getRes = await fetch(issueUrl, { headers: this.authHeaders });
    await this.checkResponse(getRes);
    const issue: JiraIssue = await getRes.json();

    // Transition to in-progress
    const inProgressStatus = this.config.jiraInProgressStatus ?? "In Progress";
    const transitionId = await this.getTransitionId(taskId, inProgressStatus);
    await this.postTransition(taskId, transitionId);

    // Post a comment
    await this.postComment(taskId, "oflow picking up this task");

    return this.issueToTask(issue);
  }

  async updateTask(taskId: string, update: TaskUpdate): Promise<void> {
    if (update.status) {
      const statusMap: Record<string, string> = {
        "in-progress": this.config.jiraInProgressStatus ?? "In Progress",
        done: this.config.jiraDoneStatus ?? "Done",
        failed: this.config.jiraReadyStatus ?? "To Do",
      };

      const targetStatus = statusMap[update.status];
      if (targetStatus) {
        const transitionId = await this.getTransitionId(taskId, targetStatus);
        await this.postTransition(taskId, transitionId);
      }
    }

    if (update.comment) {
      await this.postComment(taskId, update.comment);
    }
  }

  async postComment(taskId: string, comment: string): Promise<void> {
    const url = `${this.baseUrl}/rest/api/3/issue/${taskId}/comment`;
    const body = {
      body: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: comment }],
          },
        ],
      },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: this.authHeaders,
      body: JSON.stringify(body),
    });
    await this.checkResponse(res);
  }

  async getTask(taskId: string): Promise<Task> {
    const url = `${this.baseUrl}/rest/api/3/issue/${taskId}`;
    const res = await fetch(url, { headers: this.authHeaders });
    await this.checkResponse(res);
    const issue: JiraIssue = await res.json();
    return this.issueToTask(issue);
  }
}

interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
}

function extractAdfText(node: AdfNode): string {
  if (node.type === "text" && node.text) {
    return node.text;
  }
  if (node.content) {
    return node.content.map(extractAdfText).join("");
  }
  return "";
}
