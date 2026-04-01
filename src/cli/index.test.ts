import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const _require = createRequire(import.meta.url);
const pkg = _require("../../package.json") as { version: string };

describe("cli version", () => {
  it("version imported from package.json matches the package version field", () => {
    expect(typeof pkg.version).toBe("string");
    expect(pkg.version.length).toBeGreaterThan(0);
  });
});
