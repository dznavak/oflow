import { createReadStream, stat } from "fs";
import { join } from "path";
import { spawn } from "child_process";

export function logsCommand(
  taskId: string,
  opts: { follow?: boolean }
): Promise<void> {
  const runDir = join(process.cwd(), ".oflow", "runs", taskId);
  const logPath = join(runDir, "run.log");

  if (opts.follow) {
    return new Promise<void>((resolve, reject) => {
      stat(logPath, (err) => {
        if (err) {
          console.error(
            `Log file not yet created for task ${taskId} — task may not have started`
          );
          try {
            process.exit(1);
          } catch (e) {
            reject(e);
            return;
          }
        }
        spawn("tail", ["-f", logPath], { stdio: "inherit" });
        resolve();
      });
    });
  }

  // Without --follow: stream the file to stdout
  return new Promise<void>((resolve, reject) => {
    const stream = createReadStream(logPath);
    stream.pipe(process.stdout);
    stream.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        console.error(`No log found for task ${taskId}`);
      }
      try {
        process.exit(1);
      } catch (e) {
        reject(e);
        return;
      }
    });
    stream.on("close", () => {
      resolve();
    });
  });
}
