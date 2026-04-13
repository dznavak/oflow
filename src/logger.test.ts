import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger, logger } from "./logger.js";

describe("createLogger", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeSpy: ReturnType<typeof vi.spyOn<any, any>>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it("emits a JSON line with timestamp, level, and message fields", () => {
    const log = createLogger({ level: "info" });
    log.info("hello world");

    expect(writeSpy).toHaveBeenCalledOnce();
    const line = writeSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line.trim());
    expect(parsed).toHaveProperty("timestamp");
    expect(parsed).toHaveProperty("level", "info");
    expect(parsed).toHaveProperty("message", "hello world");
    expect(typeof parsed.timestamp).toBe("string");
    // timestamp should be a valid ISO date
    expect(new Date(parsed.timestamp).getTime()).not.toBeNaN();
  });

  it("includes taskId field when set", () => {
    const log = createLogger({ level: "info", taskId: "task-99" });
    log.warn("something happened");

    const line = writeSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line.trim());
    expect(parsed).toHaveProperty("taskId", "task-99");
  });

  it("does not include taskId field when not set", () => {
    const log = createLogger({ level: "info" });
    log.info("no task id here");

    const line = writeSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line.trim());
    expect(parsed).not.toHaveProperty("taskId");
  });

  it("filters out messages below the threshold level", () => {
    const log = createLogger({ level: "warn" });
    log.debug("debug msg");
    log.info("info msg");
    log.warn("warn msg");
    log.error("error msg");

    // only warn and error should be written
    expect(writeSpy).toHaveBeenCalledTimes(2);
    const levels = writeSpy.mock.calls.map((call) => {
      return JSON.parse((call[0] as string).trim()).level;
    });
    expect(levels).toEqual(["warn", "error"]);
  });

  it("level error does not emit debug, info, warn messages", () => {
    const log = createLogger({ level: "error" });
    log.debug("d");
    log.info("i");
    log.warn("w");
    expect(writeSpy).not.toHaveBeenCalled();
    log.error("e");
    expect(writeSpy).toHaveBeenCalledOnce();
  });

  it("level debug emits all log levels", () => {
    const log = createLogger({ level: "debug" });
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(writeSpy).toHaveBeenCalledTimes(4);
  });

  it("outputs a newline-terminated JSON line", () => {
    const log = createLogger({ level: "info" });
    log.info("newline check");
    const line = writeSpy.mock.calls[0][0] as string;
    expect(line.endsWith("\n")).toBe(true);
  });
});

describe("createLogger with OFLOW_LOG_LEVEL env var", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeSpy: ReturnType<typeof vi.spyOn<any, any>>;
  const originalEnv = process.env["OFLOW_LOG_LEVEL"];

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
    if (originalEnv === undefined) {
      delete process.env["OFLOW_LOG_LEVEL"];
    } else {
      process.env["OFLOW_LOG_LEVEL"] = originalEnv;
    }
  });

  it("uses OFLOW_LOG_LEVEL env var when no explicit level is provided", () => {
    process.env["OFLOW_LOG_LEVEL"] = "warn";
    const log = createLogger();
    log.info("should be suppressed");
    expect(writeSpy).not.toHaveBeenCalled();
    log.warn("should appear");
    expect(writeSpy).toHaveBeenCalledOnce();
  });

  it("defaults to info when OFLOW_LOG_LEVEL env var is absent", () => {
    delete process.env["OFLOW_LOG_LEVEL"];
    const log = createLogger();
    log.debug("debug suppressed");
    expect(writeSpy).not.toHaveBeenCalled();
    log.info("info appears");
    expect(writeSpy).toHaveBeenCalledOnce();
  });

  it("explicit level takes precedence over OFLOW_LOG_LEVEL env var", () => {
    process.env["OFLOW_LOG_LEVEL"] = "error";
    const log = createLogger({ level: "debug" });
    log.debug("debug should appear despite env var");
    expect(writeSpy).toHaveBeenCalledOnce();
  });
});

describe("logger singleton", () => {
  it("is exported as logger", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("emits JSON lines to stdout", () => {
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      logger.info("singleton test");
      expect(writeSpy).toHaveBeenCalledOnce();
      const line = writeSpy.mock.calls[0][0] as string;
      const parsed = JSON.parse(line.trim());
      expect(parsed).toHaveProperty("level", "info");
      expect(parsed).toHaveProperty("message", "singleton test");
    } finally {
      writeSpy.mockRestore();
    }
  });
});
