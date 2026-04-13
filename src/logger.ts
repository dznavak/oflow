// stdout is intentional: the daemon captures stdout → run.log via process redirect

export type LogLevel = "debug" | "info" | "warn" | "error";

export const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(opts?: {
  level?: LogLevel;
  taskId?: string;
}): Logger {
  const threshold: LogLevel =
    opts?.level ??
    (process.env["OFLOW_LOG_LEVEL"] as LogLevel | undefined) ??
    "info";
  const taskId = opts?.taskId;

  function write(level: LogLevel, message: string): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[threshold]) return;
    const entry: Record<string, string> = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(taskId ? { taskId } : {}),
    };
    process.stdout.write(JSON.stringify(entry) + "\n");
  }

  return {
    debug: (message) => write("debug", message),
    info: (message) => write("info", message),
    warn: (message) => write("warn", message),
    error: (message) => write("error", message),
  };
}

export const logger = createLogger();
