#!/usr/bin/env node
import { config as dotenvConfig } from "dotenv";
dotenvConfig();
import { Command } from "commander";
import { resolve } from "path";
import { createRequire } from "module";
const { version } = createRequire(import.meta.url)("../../package.json") as {
  version: string;
};

const program = new Command();

program
  .name("oflow")
  .description("Workflow automation layer connecting GitHub issue boards to AI coding agents")
  .version(version);

// board subcommands
const boardCmd = program.command("board").description("Board management commands");

boardCmd
  .command("list")
  .description("List available tasks from the board")
  .option("--label <label>", "Filter tasks by label")
  .action(async (options: { label?: string }) => {
    const { loadConfig } = await import("../config/loader.js");
    const { GitHubBoardAdapter } = await import("../adapters/board/github.js");
    const { listTasks } = await import("./commands/board.js");
    const config = loadConfig();
    const adapter = new GitHubBoardAdapter(config);
    await listTasks(adapter, options.label);
  });

boardCmd
  .command("pick")
  .description("Claim the next available task")
  .option("--label <label>", "Filter tasks by label")
  .action(async (options: { label?: string }) => {
    const { loadConfig } = await import("../config/loader.js");
    const { GitHubBoardAdapter } = await import("../adapters/board/github.js");
    const { StateManager } = await import("../state/manager.js");
    const { pickTask } = await import("./commands/board.js");
    const config = loadConfig();
    const adapter = new GitHubBoardAdapter(config);
    const repoPath = resolve(".");
    const stateManager = new StateManager(repoPath);
    await pickTask(adapter, stateManager, repoPath, options.label);
  });

boardCmd
  .command("update <id>")
  .description("Update a task status and/or post a comment")
  .option("--status <status>", "Task status: in-progress, done, failed")
  .option("--message <msg>", "Comment message to post")
  .action(async (id: string, options: { status?: string; message?: string }) => {
    const { loadConfig } = await import("../config/loader.js");
    const { GitHubBoardAdapter } = await import("../adapters/board/github.js");
    const { updateTask } = await import("./commands/board.js");
    const config = loadConfig();
    const adapter = new GitHubBoardAdapter(config);
    await updateTask(adapter, id, {
      status: options.status as "in-progress" | "done" | "failed" | undefined,
      comment: options.message,
    });
  });

// state subcommands
const stateCmd = program.command("state").description("State management commands");

stateCmd
  .command("init <task-id>")
  .description("Initialize a run directory for a task")
  .action(async (taskId: string) => {
    const { stateInit } = await import("./commands/state.js");
    await stateInit(taskId, resolve("."));
  });

stateCmd
  .command("write <artifact-name>")
  .description("Write an artifact from stdin")
  .action(async (artifactName: string) => {
    const { stateWrite } = await import("./commands/state.js");
    await stateWrite(artifactName, resolve("."));
  });

stateCmd
  .command("read <artifact-name>")
  .description("Read an artifact to stdout")
  .action(async (artifactName: string) => {
    const { stateRead } = await import("./commands/state.js");
    await stateRead(artifactName, resolve("."));
  });

stateCmd
  .command("list")
  .description("List all artifacts in the current run")
  .action(async () => {
    const { stateList } = await import("./commands/state.js");
    await stateList(resolve("."));
  });

// validate command
program
  .command("validate <artifact-name>")
  .description("Validate an artifact against its schema (exits 0/1)")
  .action(async (artifactName: string) => {
    const { validateArtifactCmd } = await import("./commands/validate.js");
    try {
      await validateArtifactCmd(artifactName, resolve("."));
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

// run command
program
  .command("run")
  .description("Start the oflow daemon (poll board and spawn agents)")
  .option("--label <label>", "Filter tasks by label")
  .action(async (options: { label?: string }) => {
    const { runDaemon } = await import("./commands/run.js");
    await runDaemon(resolve("."), options.label);
  });

// report subcommand
const reportCmd = program.command("report").description("Emit events to the run event stream");

reportCmd
  .command("step <step-name>")
  .description("Emit a step event")
  .action(async (stepName: string) => {
    const { reportCmd: report } = await import("./commands/report.js");
    await report("step", [stepName], {}, resolve("."));
  });

reportCmd
  .command("artifact <artifact-name>")
  .description("Emit an artifact event")
  .action(async (artifactName: string) => {
    const { reportCmd: report } = await import("./commands/report.js");
    await report("artifact", [artifactName], {}, resolve("."));
  });

reportCmd
  .command("status")
  .description("Emit a status event")
  .option("--tokens <n>", "Token count to include", (v) => parseInt(v, 10))
  .action(async (options: { tokens?: number }) => {
    const { reportCmd: report } = await import("./commands/report.js");
    await report("status", [], { tokens: options.tokens }, resolve("."));
  });

reportCmd
  .command("estimate")
  .description("Emit a complexity estimate event")
  .option("--score <n>", "Complexity score (1-100)", (v) => parseInt(v, 10))
  .option("--seconds <n>", "Estimated duration in seconds", (v) => parseInt(v, 10))
  .action(async (options: { score?: number; seconds?: number }) => {
    const { reportCmd: report } = await import("./commands/report.js");
    await report("estimate", [], { score: options.score, seconds: options.seconds }, resolve("."));
  });

// status command
program
  .command("status")
  .description("Show active agent sessions")
  .action(async () => {
    const { showStatus } = await import("./commands/status.js");
    await showStatus(resolve("."));
  });

// logs command
program
  .command("logs <taskId>")
  .description("Print or follow the run log for a task")
  .option("--follow", "tail the log file")
  .action(async (taskId, opts) => {
    const { logsCommand } = await import("./commands/logs.js");
    await logsCommand(taskId, opts);
  });

program.parse(process.argv);
