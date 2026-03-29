#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("oflow")
  .description("Workflow automation layer connecting GitHub issue boards to AI coding agents")
  .version("0.1.0");

program.parse(process.argv);
