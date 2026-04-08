import { describe, it, expect, vi, beforeEach } from "vitest";
import { JiraBoardAdapter } from "./jira.js";

const defaultConfig = {
  board: "jira" as const,
  jiraToken: "test-api-token",
  jiraEmail: "user@example.com",
  jiraUrl: "https://mycompany.atlassian.net",
  jiraProjectKey: "PROJ",
  jiraReadyStatus: "To Do",
  jiraInProgressStatus: "In Progress",
  jiraDoneStatus: "Done",
  taskLabel: "oflow-ready",
  taskInProgressLabel: "oflow-in-progress",
  taskDoneLabel: "oflow-done",
  agent: "claude-code",
  maxConcurrentTasks: 1,
  defaultWorkflow: "dev-workflow",
  pollIntervalSeconds: 60,
  stepTimeoutSeconds: 900,
};

function makeIssue(overrides: Partial<{
  key: string;
  id: string;
  summary: string;
  description: unknown;
  labels: string[];
  statusName: string;
}> = {}) {
  return {
    key: overrides.key ?? "PROJ-42",
    id: overrides.id ?? "10042",
    fields: {
      summary: overrides.summary ?? "Test issue",
      description: overrides.description ?? null,
      labels: overrides.labels ?? ["oflow-ready"],
      status: { name: overrides.statusName ?? "To Do" },
    },
  };
}

function makeTransitions(names: string[]) {
  return {
    transitions: names.map((name, i) => ({
      id: String(i + 1),
      name: `Transition to ${name}`,
      to: { name },
    })),
  };
}

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const resp = responses[callIndex++] ?? responses[responses.length - 1];
    return Promise.resolve({
      ok: resp.status >= 200 && resp.status < 300,
      status: resp.status,
      json: () => Promise.resolve(resp.body),
    });
  });
}

describe("JiraBoardAdapter", () => {
  let adapter: JiraBoardAdapter;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    adapter = new JiraBoardAdapter(defaultConfig);
  });

  describe("listAvailableTasks", () => {
    it("returns tasks mapped from Jira issues", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([{ status: 200, body: { issues: [makeIssue()] } }])
      );

      const tasks = await adapter.listAvailableTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe("PROJ-42");
      expect(tasks[0].number).toBe(10042);
      expect(tasks[0].title).toBe("Test issue");
      expect(tasks[0].url).toBe("https://mycompany.atlassian.net/browse/PROJ-42");
    });

    it("returns empty array when no issues match", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([{ status: 200, body: { issues: [] } }])
      );

      const tasks = await adapter.listAvailableTasks();

      expect(tasks).toHaveLength(0);
    });

    it("builds correct JQL with readyStatus and projectKey", async () => {
      const fetchMock = mockFetch([{ status: 200, body: { issues: [] } }]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.listAvailableTasks();

      const url = new URL(fetchMock.mock.calls[0][0] as string);
      const jql = url.searchParams.get("jql") ?? "";
      expect(jql).toContain("project = PROJ");
      expect(jql).toContain("assignee = currentUser()");
      expect(jql).toContain('status = "To Do"');
    });

    it("appends label filter to JQL when label is provided", async () => {
      const fetchMock = mockFetch([{ status: 200, body: { issues: [] } }]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.listAvailableTasks("critical");

      const url = new URL(fetchMock.mock.calls[0][0] as string);
      const jql = url.searchParams.get("jql") ?? "";
      expect(jql).toContain('labels = "critical"');
    });

    it("derives workflow from workflow: label prefix", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([{
          status: 200,
          body: {
            issues: [makeIssue({ labels: ["oflow-ready", "workflow:code-review-workflow"] })],
          },
        }])
      );

      const tasks = await adapter.listAvailableTasks();

      expect(tasks[0].workflow).toBe("code-review-workflow");
    });

    it("falls back to config.defaultWorkflow when no workflow label", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([{ status: 200, body: { issues: [makeIssue()] } }])
      );

      const tasks = await adapter.listAvailableTasks();

      expect(tasks[0].workflow).toBe("dev-workflow");
    });

    it("throws on non-2xx response", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 401, body: { errorMessages: ["Unauthorized"] } }]));

      await expect(adapter.listAvailableTasks()).rejects.toThrow("401");
    });
  });

  describe("claimTask", () => {
    it("fetches issue, POSTs transition to In Progress, posts comment, returns task", async () => {
      const fetchMock = mockFetch([
        { status: 200, body: makeIssue() },                          // GET issue
        { status: 200, body: makeTransitions(["In Progress"]) },     // GET transitions
        { status: 204, body: null },                                  // POST transition
        { status: 201, body: { id: "100" } },                        // POST comment
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const task = await adapter.claimTask("PROJ-42");

      expect(task.id).toBe("PROJ-42");
      expect(fetchMock.mock.calls).toHaveLength(4);

      // GET issue
      expect(fetchMock.mock.calls[0][0]).toContain("/rest/api/3/issue/PROJ-42");
      expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBeUndefined();

      // GET transitions
      expect(fetchMock.mock.calls[1][0]).toContain("/transitions");

      // POST transition
      const postTransitionCall = fetchMock.mock.calls[2];
      expect(postTransitionCall[0]).toContain("/transitions");
      expect((postTransitionCall[1] as RequestInit).method).toBe("POST");
      const transitionBody = JSON.parse((postTransitionCall[1] as RequestInit).body as string);
      expect(transitionBody.transition.id).toBe("1");

      // POST comment
      expect(fetchMock.mock.calls[3][0]).toContain("/comment");
    });

    it("throws descriptive error when In Progress transition not found", async () => {
      const fetchMock = mockFetch([
        { status: 200, body: makeIssue() },
        { status: 200, body: makeTransitions(["Done", "Blocked"]) },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      await expect(adapter.claimTask("PROJ-42")).rejects.toThrow(
        'transition to "In Progress" not found'
      );
    });

    it("throws if fetching the issue returns non-2xx", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 404, body: { errorMessages: ["Not found"] } }]));

      await expect(adapter.claimTask("PROJ-999")).rejects.toThrow("404");
    });
  });

  describe("updateTask", () => {
    it("applies Done transition when status is done", async () => {
      const fetchMock = mockFetch([
        { status: 200, body: makeTransitions(["Done"]) },
        { status: 204, body: null },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.updateTask("PROJ-42", { status: "done" });

      const postBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
      expect(postBody.transition.id).toBe("1");
    });

    it("applies To Do transition when status is failed", async () => {
      const fetchMock = mockFetch([
        { status: 200, body: makeTransitions(["To Do"]) },
        { status: 204, body: null },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.updateTask("PROJ-42", { status: "failed" });

      const transitionsUrl = fetchMock.mock.calls[0][0] as string;
      expect(transitionsUrl).toContain("/transitions");
    });

    it("applies In Progress transition when status is in-progress", async () => {
      const fetchMock = mockFetch([
        { status: 200, body: makeTransitions(["In Progress"]) },
        { status: 204, body: null },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.updateTask("PROJ-42", { status: "in-progress" });

      const postBody = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string);
      expect(postBody.transition.id).toBe("1");
    });

    it("posts comment only when no status provided", async () => {
      const fetchMock = mockFetch([
        { status: 201, body: { id: "100" } },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.updateTask("PROJ-42", { comment: "All done" });

      expect(fetchMock.mock.calls).toHaveLength(1);
      expect(fetchMock.mock.calls[0][0]).toContain("/comment");
    });

    it("applies transition and posts comment when both status and comment provided", async () => {
      const fetchMock = mockFetch([
        { status: 200, body: makeTransitions(["Done"]) },
        { status: 204, body: null },
        { status: 201, body: { id: "100" } },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.updateTask("PROJ-42", { status: "done", comment: "done!" });

      expect(fetchMock.mock.calls).toHaveLength(3);
      expect(fetchMock.mock.calls[2][0]).toContain("/comment");
    });

    it("throws descriptive error when transition not found", async () => {
      const fetchMock = mockFetch([
        { status: 200, body: makeTransitions(["In Progress"]) },
      ]);
      vi.stubGlobal("fetch", fetchMock);

      await expect(adapter.updateTask("PROJ-42", { status: "done" })).rejects.toThrow(
        'transition to "Done" not found'
      );
    });
  });

  describe("getTask", () => {
    it("returns task by issue key", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: makeIssue() }]));

      const task = await adapter.getTask("PROJ-42");

      expect(task.id).toBe("PROJ-42");
      expect(task.number).toBe(10042);
      expect(task.title).toBe("Test issue");
    });

    it("throws on non-2xx response", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 404, body: { errorMessages: ["Not found"] } }]));

      await expect(adapter.getTask("PROJ-999")).rejects.toThrow("404");
    });
  });

  describe("Basic auth header", () => {
    it("sends Authorization Basic header on all requests", async () => {
      const fetchMock = mockFetch([{ status: 200, body: { issues: [] } }]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.listAvailableTasks();

      const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers["Authorization"]).toMatch(/^Basic /);

      // Decode and verify the content
      const encoded = headers["Authorization"].slice("Basic ".length);
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      expect(decoded).toBe("user@example.com:test-api-token");
    });
  });

  describe("postComment", () => {
    it("sends ADF formatted body", async () => {
      const fetchMock = mockFetch([{ status: 201, body: { id: "1" } }]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.postComment("PROJ-42", "Hello from oflow");

      const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(body.body.type).toBe("doc");
      expect(body.body.content[0].type).toBe("paragraph");
      expect(body.body.content[0].content[0].text).toBe("Hello from oflow");
    });

    it("throws on non-2xx response", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 403, body: {} }]));

      await expect(adapter.postComment("PROJ-42", "test")).rejects.toThrow("403");
    });
  });

  describe("ADF description parsing", () => {
    it("extracts plain text from ADF description", async () => {
      const adfDescription = {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Hello " }, { type: "text", text: "world" }],
          },
        ],
      };

      vi.stubGlobal(
        "fetch",
        mockFetch([{
          status: 200,
          body: { issues: [makeIssue({ description: adfDescription })] },
        }])
      );

      const tasks = await adapter.listAvailableTasks();

      expect(tasks[0].description).toBe("Hello world");
    });

    it("handles plain string description", async () => {
      vi.stubGlobal(
        "fetch",
        mockFetch([{
          status: 200,
          body: { issues: [makeIssue({ description: "Plain text description" })] },
        }])
      );

      const tasks = await adapter.listAvailableTasks();

      expect(tasks[0].description).toBe("Plain text description");
    });
  });
});
