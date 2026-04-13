import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitLabBoardAdapter } from "./gitlab.js";

const defaultConfig = {
  board: "gitlab" as const,
  gitlabToken: "glpat-test",
  gitlabProjectId: "owner/repo",
  gitlabUrl: "https://gitlab.com/api/v4",
  taskLabel: "oflow-ready",
  taskInProgressLabel: "oflow-in-progress",
  taskDoneLabel: "oflow-done",
  taskFailedLabel: "oflow-failed",
  agent: "claude-code",
  maxConcurrentTasks: 1,
  defaultWorkflow: "dev-workflow",
  pollIntervalSeconds: 60,
  stepTimeoutSeconds: 900,
};

function makeIssue(overrides: Partial<{
  iid: number;
  title: string;
  description: string;
  labels: string[];
  web_url: string;
}> = {}) {
  return {
    iid: 42,
    title: "Test issue",
    description: "Test description",
    labels: ["oflow-ready"],
    web_url: "https://gitlab.com/owner/repo/-/issues/42",
    ...overrides,
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

describe("GitLabBoardAdapter", () => {
  let adapter: GitLabBoardAdapter;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    adapter = new GitLabBoardAdapter(defaultConfig);
  });

  describe("listAvailableTasks", () => {
    it("returns tasks filtered by default taskLabel", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: [makeIssue()] }]));

      const tasks = await adapter.listAvailableTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe("42");
      expect(tasks[0].number).toBe(42);
      expect(tasks[0].title).toBe("Test issue");
      expect(tasks[0].description).toBe("Test description");
      expect(tasks[0].labels).toContain("oflow-ready");
      expect(tasks[0].url).toBe("https://gitlab.com/owner/repo/-/issues/42");
    });

    it("returns empty array when no matching issues", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: [] }]));

      const tasks = await adapter.listAvailableTasks();

      expect(tasks).toHaveLength(0);
    });

    it("derives workflow from workflow: label", async () => {
      vi.stubGlobal("fetch", mockFetch([{
        status: 200,
        body: [makeIssue({ labels: ["oflow-ready", "workflow:code-review-workflow"] })],
      }]));

      const tasks = await adapter.listAvailableTasks();

      expect(tasks[0].workflow).toBe("code-review-workflow");
    });

    it("defaults workflow to config.defaultWorkflow when no workflow label", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: [makeIssue()] }]));

      const tasks = await adapter.listAvailableTasks();

      expect(tasks[0].workflow).toBe("dev-workflow");
    });

    it("uses custom label when provided", async () => {
      const fetchMock = mockFetch([{ status: 200, body: [] }]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.listAvailableTasks("critical");

      const url = new URL((fetchMock.mock.calls[0][0] as string));
      expect(url.searchParams.get("labels")).toBe("critical");
    });

    it("uses taskLabel by default in query params", async () => {
      const fetchMock = mockFetch([{ status: 200, body: [] }]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.listAvailableTasks();

      const url = new URL((fetchMock.mock.calls[0][0] as string));
      expect(url.searchParams.get("labels")).toBe("oflow-ready");
      expect(url.searchParams.get("order_by")).toBe("created_at");
      expect(url.searchParams.get("sort")).toBe("asc");
      expect(url.searchParams.get("state")).toBe("opened");
    });

    it("throws on non-2xx response", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 401, body: { message: "Unauthorized" } }]));

      await expect(adapter.listAvailableTasks()).rejects.toThrow("401");
    });
  });

  describe("claimTask", () => {
    it("fetches issue, swaps labels in single PUT, posts comment", async () => {
      const fetchMock = mockFetch([
        { status: 200, body: makeIssue() },         // GET issue
        { status: 200, body: makeIssue({ labels: ["oflow-in-progress"] }) }, // PUT labels
        { status: 201, body: { id: 1 } },            // POST note
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const task = await adapter.claimTask("42");

      expect(task.id).toBe("42");

      // GET
      expect(fetchMock.mock.calls[0][0]).toContain("/issues/42");
      expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBeUndefined();

      // PUT
      const putCall = fetchMock.mock.calls[1];
      expect(putCall[0]).toContain("/issues/42");
      expect((putCall[1] as RequestInit).method).toBe("PUT");
      const putBody = new URLSearchParams((putCall[1] as RequestInit).body as string);
      expect(putBody.get("add_labels")).toBe("oflow-in-progress");
      expect(putBody.get("remove_labels")).toBe("oflow-ready");

      // POST note
      const postCall = fetchMock.mock.calls[2];
      expect(postCall[0]).toContain("/notes");
      expect((postCall[1] as RequestInit).method).toBe("POST");
    });

    it("throws if fetching the issue returns non-2xx", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 404, body: { message: "Not Found" } }]));

      await expect(adapter.claimTask("999")).rejects.toThrow("404");
    });
  });

  describe("updateTask", () => {
    it("swaps labels when status is done", async () => {
      const fetchMock = mockFetch([
        { status: 200, body: makeIssue() }, // PUT labels
      ]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.updateTask("42", { status: "done" });

      const putBody = new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(putBody.get("add_labels")).toBe("oflow-done");
      expect(putBody.get("remove_labels")).toBe("oflow-in-progress");
    });

    it("restores oflow-ready and removes oflow-in-progress when status is failed", async () => {
      const fetchMock = mockFetch([{ status: 200, body: makeIssue() }]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.updateTask("42", { status: "failed" });

      const putBody = new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(putBody.get("add_labels")).toBe("oflow-ready");
      expect(putBody.get("remove_labels")).toBe("oflow-in-progress");
    });

    it("swaps labels when status is in-progress", async () => {
      const fetchMock = mockFetch([{ status: 200, body: makeIssue() }]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.updateTask("42", { status: "in-progress" });

      const putBody = new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(putBody.get("add_labels")).toBe("oflow-in-progress");
      expect(putBody.get("remove_labels")).toBe("oflow-ready");
    });

    it("posts comment when comment provided", async () => {
      const fetchMock = mockFetch([{ status: 201, body: { id: 1 } }]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.updateTask("42", { comment: "Task completed" });

      expect(fetchMock.mock.calls[0][0]).toContain("/notes");
      expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    });

    it("handles both status and comment together", async () => {
      const fetchMock = mockFetch([
        { status: 200, body: makeIssue() }, // PUT labels
        { status: 201, body: { id: 1 } },   // POST note
      ]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.updateTask("42", { status: "done", comment: "done!" });

      expect(fetchMock.mock.calls).toHaveLength(2);
    });

    it("swallows 404 on the PUT (idempotent label removal)", async () => {
      const fetchMock = mockFetch([{ status: 404, body: { message: "Not Found" } }]);
      vi.stubGlobal("fetch", fetchMock);

      await expect(adapter.updateTask("42", { status: "done" })).resolves.not.toThrow();
    });

    it("re-throws non-404 errors from the PUT", async () => {
      const fetchMock = mockFetch([{ status: 403, body: { message: "Forbidden" } }]);
      vi.stubGlobal("fetch", fetchMock);

      await expect(adapter.updateTask("42", { status: "done" })).rejects.toThrow("403");
    });
  });

  describe("getTask", () => {
    it("returns task by iid", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 200, body: makeIssue() }]));

      const task = await adapter.getTask("42");

      expect(task.id).toBe("42");
      expect(task.number).toBe(42);
    });

    it("throws on non-2xx response", async () => {
      vi.stubGlobal("fetch", mockFetch([{ status: 404, body: { message: "Not Found" } }]));

      await expect(adapter.getTask("999")).rejects.toThrow("404");
    });
  });

  describe("URL encoding of project ID", () => {
    it("URL-encodes owner/repo style project ID in requests", async () => {
      const fetchMock = mockFetch([{ status: 200, body: [] }]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.listAvailableTasks();

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("owner%2Frepo");
    });
  });

  describe("workflow label parsing", () => {
    it("parses workflow:code-review-workflow label correctly", async () => {
      vi.stubGlobal("fetch", mockFetch([{
        status: 200,
        body: [makeIssue({ labels: ["oflow-ready", "workflow:code-review-workflow"] })],
      }]));

      const tasks = await adapter.listAvailableTasks();

      expect(tasks[0].workflow).toBe("code-review-workflow");
    });
  });

  describe("PRIVATE-TOKEN auth header", () => {
    it("sends PRIVATE-TOKEN header on all requests", async () => {
      const fetchMock = mockFetch([{ status: 200, body: [] }]);
      vi.stubGlobal("fetch", fetchMock);

      await adapter.listAvailableTasks();

      const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers["PRIVATE-TOKEN"]).toBe("glpat-test");
    });
  });
});
