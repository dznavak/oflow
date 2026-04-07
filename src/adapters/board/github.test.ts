import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitHubBoardAdapter } from "./github.js";

// Mock @octokit/rest at module level
vi.mock("@octokit/rest", () => {
  const mockOctokit = {
    issues: {
      listForRepo: vi.fn(),
      get: vi.fn(),
      addLabels: vi.fn(),
      removeLabel: vi.fn(),
      createComment: vi.fn(),
    },
  };
  return {
    Octokit: vi.fn(() => mockOctokit),
  };
});

import { Octokit } from "@octokit/rest";

function getMockOctokit() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (Octokit as any).mock.results[0].value as {
    issues: {
      listForRepo: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      addLabels: ReturnType<typeof vi.fn>;
      removeLabel: ReturnType<typeof vi.fn>;
      createComment: ReturnType<typeof vi.fn>;
    };
  };
}

const defaultConfig = {
  board: "github",
  githubToken: "ghp_test",
  githubRepo: "owner/repo",
  taskLabel: "oflow-ready",
  taskInProgressLabel: "oflow-in-progress",
  taskDoneLabel: "oflow-done",
  agent: "claude-code",
  agentModel: "claude-opus-4-6",
  maxConcurrentTasks: 1,
  defaultWorkflow: "dev-workflow",
  pollIntervalSeconds: 60,
  stepTimeoutSeconds: 900,
};

function makeIssue(overrides: Partial<{
  number: number;
  title: string;
  body: string;
  labels: Array<{ name: string }>;
  html_url: string;
}> = {}) {
  return {
    number: 42,
    title: "Test issue",
    body: "Test description",
    labels: [{ name: "oflow-ready" }],
    html_url: "https://github.com/owner/repo/issues/42",
    ...overrides,
  };
}

describe("GitHubBoardAdapter", () => {
  let adapter: GitHubBoardAdapter;
  let mock: ReturnType<typeof getMockOctokit>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new GitHubBoardAdapter(defaultConfig);
    mock = getMockOctokit();
  });

  describe("listAvailableTasks", () => {
    it("returns tasks filtered by label", async () => {
      mock.issues.listForRepo.mockResolvedValue({
        data: [makeIssue()],
      });

      const tasks = await adapter.listAvailableTasks();

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe("42");
      expect(tasks[0].number).toBe(42);
      expect(tasks[0].title).toBe("Test issue");
      expect(tasks[0].description).toBe("Test description");
      expect(tasks[0].labels).toContain("oflow-ready");
      expect(tasks[0].url).toBe("https://github.com/owner/repo/issues/42");
      expect(mock.issues.listForRepo).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: "owner",
          repo: "repo",
          labels: "oflow-ready",
          state: "open",
        })
      );
    });

    it("returns empty array when no matching issues", async () => {
      mock.issues.listForRepo.mockResolvedValue({ data: [] });

      const tasks = await adapter.listAvailableTasks();

      expect(tasks).toHaveLength(0);
    });

    it("derives workflow from workflow: label", async () => {
      mock.issues.listForRepo.mockResolvedValue({
        data: [
          makeIssue({
            labels: [
              { name: "oflow-ready" },
              { name: "workflow:code-review-workflow" },
            ],
          }),
        ],
      });

      const tasks = await adapter.listAvailableTasks();

      expect(tasks[0].workflow).toBe("code-review-workflow");
    });

    it("defaults workflow to config.defaultWorkflow when no workflow label", async () => {
      mock.issues.listForRepo.mockResolvedValue({
        data: [makeIssue()],
      });

      const tasks = await adapter.listAvailableTasks();

      expect(tasks[0].workflow).toBe("dev-workflow");
    });

    it("uses taskLabel when no custom label provided", async () => {
      mock.issues.listForRepo.mockResolvedValue({ data: [makeIssue()] });

      await adapter.listAvailableTasks();

      expect(mock.issues.listForRepo).toHaveBeenCalledWith(
        expect.objectContaining({ labels: "oflow-ready", sort: "created", direction: "asc" })
      );
    });

    it("uses custom label exclusively when provided", async () => {
      mock.issues.listForRepo.mockResolvedValue({ data: [makeIssue()] });

      await adapter.listAvailableTasks("critical");

      expect(mock.issues.listForRepo).toHaveBeenCalledWith(
        expect.objectContaining({ labels: "critical", sort: "created", direction: "asc" })
      );
    });
  });

  describe("claimTask", () => {
    it("adds in-progress label, removes ready label, posts comment", async () => {
      mock.issues.get.mockResolvedValue({ data: makeIssue() });
      mock.issues.addLabels.mockResolvedValue({});
      mock.issues.removeLabel.mockResolvedValue({});
      mock.issues.createComment.mockResolvedValue({});

      const task = await adapter.claimTask("42");

      expect(mock.issues.addLabels).toHaveBeenCalledWith(
        expect.objectContaining({
          issue_number: 42,
          labels: ["oflow-in-progress"],
        })
      );
      expect(mock.issues.removeLabel).toHaveBeenCalledWith(
        expect.objectContaining({
          issue_number: 42,
          name: "oflow-ready",
        })
      );
      expect(mock.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          issue_number: 42,
          body: expect.stringContaining("oflow picking up this task"),
        })
      );
      expect(task.id).toBe("42");
    });

    it("throws if task not found", async () => {
      mock.issues.get.mockRejectedValue(
        Object.assign(new Error("Not Found"), { status: 404 })
      );

      await expect(adapter.claimTask("999")).rejects.toThrow(/999/);
    });
  });

  describe("updateTask", () => {
    it("posts comment when comment provided", async () => {
      mock.issues.createComment.mockResolvedValue({});
      mock.issues.addLabels.mockResolvedValue({});
      mock.issues.removeLabel.mockResolvedValue({});
      mock.issues.get.mockResolvedValue({
        data: makeIssue({ labels: [{ name: "oflow-in-progress" }] }),
      });

      await adapter.updateTask("42", {
        status: "done",
        comment: "Task completed",
      });

      expect(mock.issues.createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          issue_number: 42,
          body: "Task completed",
        })
      );
    });

    it("swaps labels when status is done", async () => {
      mock.issues.createComment.mockResolvedValue({});
      mock.issues.addLabels.mockResolvedValue({});
      mock.issues.removeLabel.mockResolvedValue({});
      mock.issues.get.mockResolvedValue({
        data: makeIssue({ labels: [{ name: "oflow-in-progress" }] }),
      });

      await adapter.updateTask("42", { status: "done" });

      expect(mock.issues.addLabels).toHaveBeenCalledWith(
        expect.objectContaining({ labels: ["oflow-done"] })
      );
      expect(mock.issues.removeLabel).toHaveBeenCalledWith(
        expect.objectContaining({ name: "oflow-in-progress" })
      );
    });

    it("restores oflow-ready label and removes oflow-in-progress when status is failed", async () => {
      mock.issues.createComment.mockResolvedValue({});
      mock.issues.addLabels.mockResolvedValue({});
      mock.issues.removeLabel.mockResolvedValue({});
      mock.issues.get.mockResolvedValue({
        data: makeIssue({ labels: [{ name: "oflow-in-progress" }] }),
      });

      await adapter.updateTask("42", { status: "failed" });

      expect(mock.issues.addLabels).toHaveBeenCalledWith(
        expect.objectContaining({ labels: ["oflow-ready"] })
      );
      expect(mock.issues.removeLabel).toHaveBeenCalledWith(
        expect.objectContaining({ name: "oflow-in-progress" })
      );
    });

    it("does not throw when removeLabel returns 404 (label already removed)", async () => {
      mock.issues.addLabels.mockResolvedValue({});
      mock.issues.removeLabel.mockRejectedValue(
        Object.assign(new Error("Label does not exist"), { status: 404 })
      );
      mock.issues.createComment.mockResolvedValue({});

      await expect(adapter.updateTask("42", { status: "done" })).resolves.not.toThrow();
    });

    it("re-throws non-404 errors from removeLabel", async () => {
      mock.issues.addLabels.mockResolvedValue({});
      mock.issues.removeLabel.mockRejectedValue(
        Object.assign(new Error("Forbidden"), { status: 403 })
      );

      await expect(adapter.updateTask("42", { status: "done" })).rejects.toThrow("Forbidden");
    });
  });

  describe("getTask", () => {
    it("returns task by id", async () => {
      mock.issues.get.mockResolvedValue({ data: makeIssue() });

      const task = await adapter.getTask("42");

      expect(task.id).toBe("42");
      expect(task.number).toBe(42);
      expect(mock.issues.get).toHaveBeenCalledWith(
        expect.objectContaining({ issue_number: 42 })
      );
    });
  });

  describe("workflow label parsing", () => {
    it("parses workflow:code-review-workflow label correctly", async () => {
      mock.issues.listForRepo.mockResolvedValue({
        data: [
          makeIssue({
            labels: [
              { name: "oflow-ready" },
              { name: "workflow:code-review-workflow" },
            ],
          }),
        ],
      });

      const tasks = await adapter.listAvailableTasks();

      expect(tasks[0].workflow).toBe("code-review-workflow");
    });
  });
});
