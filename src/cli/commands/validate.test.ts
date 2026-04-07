import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateArtifactCmd } from "./validate.js";

vi.mock("fs/promises");
vi.mock("../../state/validator.js");

import { readFile } from "fs/promises";
import { validateArtifact } from "../../state/validator.js";

const mockReadFile = vi.mocked(readFile);
const mockValidateArtifact = vi.mocked(validateArtifact);

describe("validateArtifactCmd", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: OFLOW_CURRENT_TASK_ID is set so getCurrentTaskId doesn't hit the filesystem
    process.env.OFLOW_CURRENT_TASK_ID = "42";
  });

  describe("file-not-found case", () => {
    it("throws when the artifact file does not exist", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT: no such file or directory"));

      await expect(validateArtifactCmd("plan", "/repo")).rejects.toThrow(
        /artifact file not found/
      );
    });

    it("throws with a non-existent artifact name", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      await expect(validateArtifactCmd("nonexistent-artifact", "/repo")).rejects.toThrow(
        /artifact file not found/
      );
    });

    it("throws with a non-existent task ID (no current file, no env var)", async () => {
      delete process.env.OFLOW_CURRENT_TASK_ID;
      // First readFile call is for .oflow/current, second would be for the artifact
      mockReadFile.mockRejectedValueOnce(new Error("ENOENT: .oflow/current not found"));

      await expect(validateArtifactCmd("plan", "/repo")).rejects.toThrow(
        /No current task ID found/
      );
    });
  });

  describe("validation failure case", () => {
    it("throws when the artifact fails schema validation", async () => {
      mockReadFile.mockResolvedValue("---\nartifact: plan\n---\n" as never);
      mockValidateArtifact.mockReturnValue({
        success: false,
        errors: ["field: required field missing"],
      });

      await expect(validateArtifactCmd("plan", "/repo")).rejects.toThrow(
        /plan validation failed/
      );
    });

    it("throws for implementation-1 when validation fails", async () => {
      mockReadFile.mockResolvedValue("---\nartifact: implementation\n---\n" as never);
      mockValidateArtifact.mockReturnValue({
        success: false,
        errors: ["status: invalid value"],
      });

      await expect(validateArtifactCmd("implementation-1", "/repo")).rejects.toThrow(
        /implementation-1 validation failed/
      );
    });
  });

  describe("happy path", () => {
    it("resolves without throwing when the artifact is valid", async () => {
      mockReadFile.mockResolvedValue("---\nartifact: plan\n---\n" as never);
      mockValidateArtifact.mockReturnValue({ success: true, data: {} });

      await expect(validateArtifactCmd("plan", "/repo")).resolves.toBeUndefined();
    });

    it("calls validateArtifact with the artifact name and file content", async () => {
      const content = "---\nartifact: exploration\n---\nsome body\n";
      mockReadFile.mockResolvedValue(content as never);
      mockValidateArtifact.mockReturnValue({ success: true, data: {} });

      await validateArtifactCmd("exploration", "/repo");

      expect(mockValidateArtifact).toHaveBeenCalledWith("exploration", content);
    });

    it("resolves for implementation-N artifact names", async () => {
      mockReadFile.mockResolvedValue("---\nartifact: implementation\n---\n" as never);
      mockValidateArtifact.mockReturnValue({ success: true, data: {} });

      await expect(validateArtifactCmd("implementation-2", "/repo")).resolves.toBeUndefined();
    });
  });
});
