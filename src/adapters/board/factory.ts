import type { Config } from "../../config/types.js";
import type { BoardAdapter } from "./index.js";
import { GitHubBoardAdapter } from "./github.js";
import { GitLabBoardAdapter } from "./gitlab.js";
import { JiraBoardAdapter } from "./jira.js";

export function createBoardAdapter(config: Config): BoardAdapter {
  switch (config.board) {
    case "github":
      return new GitHubBoardAdapter(config);
    case "gitlab":
      return new GitLabBoardAdapter(config);
    case "jira":
      return new JiraBoardAdapter(config);
    default: {
      const board: never = config.board;
      throw new Error(`Unsupported board type: "${String(board)}". Valid values: github, gitlab, jira.`);
    }
  }
}
