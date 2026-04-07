import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "oflow-utils-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.OFLOW_CURRENT_TASK_ID;
});

describe("getCurrentTaskId", () => {
  it("returns the env var when OFLOW_CURRENT_TASK_ID is set", async () => {
    const { getCurrentTaskId } = await import("./utils.js");
    process.env.OFLOW_CURRENT_TASK_ID = "42";
    const result = await getCurrentTaskId(tmpDir);
    expect(result).toBe("42");
  });

  it("reads from .oflow/current file when env var is not set", async () => {
    const { getCurrentTaskId } = await import("./utils.js");
    const oflowDir = join(tmpDir, ".oflow");
    await mkdir(oflowDir);
    await writeFile(join(oflowDir, "current"), "  99  \n");
    const result = await getCurrentTaskId(tmpDir);
    expect(result).toBe("99");
  });

  it("throws when env var is absent and .oflow/current does not exist", async () => {
    const { getCurrentTaskId } = await import("./utils.js");
    await expect(getCurrentTaskId(tmpDir)).rejects.toThrow(
      "No current task ID found"
    );
  });
});
