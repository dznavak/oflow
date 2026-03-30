#!/usr/bin/env node
import { config as dotenvConfig } from "dotenv";
dotenvConfig();
import { Command } from "commander";
import { resolve } from "path";

const program = new Command();

program
  .name("oflow")
  .description("Workflow automation layer connecting GitHub issue boards to AI coding agents")
  .version("0.1.0");

// board subcommands
const boardCmd = program.command("board").description("Board management commands");

boardCmd
  .command("list")
  .description("List available tasks from the board")
  .action(async () => {
    const { loadConfig } = await import("../config/loader.js");
    const { GitHubBoardAdapter } = await import("../adapters/board/github.js");
    const { listTasks } = await import("./commands/board.js");
    const config = loadConfig();
    const adapter = new GitHubBoardAdapter(config);
    await listTasks(adapter);
  });

boardCmd
  .command("pick")
  .description("Claim the next available task")
  .action(async () => {
    const { loadConfig } = await import("../config/loader.js");
    const { GitHubBoardAdapter } = await import("../adapters/board/github.js");
    const { StateManager } = await import("../state/manager.js");
    const { pickTask } = await import("./commands/board.js");
    const config = loadConfig();
    const adapter = new GitHubBoardAdapter(config);
    const repoPath = resolve(".");
    const stateManager = new StateManager(repoPath);
    await pickTask(adapter, stateManager, repoPath);
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
    await validateArtifactCmd(artifactName, resolve("."));
  });

// run command
program
  .command("run")
  .description("Start the oflow daemon (poll board and spawn agents)")
  .action(async () => {
    const { runDaemon } = await import("./commands/run.js");
    await runDaemon(resolve("."));
  });

// status command
program
  .command("status")
  .description("Show active agent sessions")
  .action(async () => {
    const { showStatus } = await import("./commands/status.js");
    await showStatus(resolve("."));
  });

program.parse(process.argv);
