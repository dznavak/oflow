# oflow

oflow is a workflow automation layer that connects GitHub issue boards to AI coding agents. It watches your GitHub project for issues labeled `oflow-ready`, spawns [Claude Code](https://claude.ai/code) sessions to implement each task using a configurable skill workflow, and opens pull requests automatically when the work is done.

## Prerequisites

- **Node.js 18+** and **npm**
- **[Claude Code CLI](https://claude.ai/code)** — `claude` must be on your PATH
- **[gh CLI](https://cli.github.com/)** — authenticated with your GitHub account
- **GitHub personal access token** with `repo` scope (set as `GITHUB_TOKEN` in your environment or `.env`)

## Installation

Install from source:

```bash
git clone https://github.com/dznavak/oflow.git
cd oflow
npm install
npm run build
npm link
```

After `npm link`, the `oflow` command will be available globally.

To verify the installation:

```bash
oflow --version
```

## Configuration

oflow is configured through a `.env` file in the root of the oflow directory. Copy the example file and fill in the required values:

```bash
cp .env.example .env
```

Then open `.env` and set at minimum `OFLOW_GITHUB_TOKEN` and `OFLOW_GITHUB_REPO`.

### Environment variables

#### General

| Variable | Required | Default | Description |
|---|---|---|---|
| `OFLOW_BOARD` | No | `github` | Board adapter to use. Supported values: `github`, `gitlab`, `jira`. Defaults to `github` when not set. |
| `OFLOW_AGENT` | No | `claude-code` | Agent adapter to use for executing tasks. |
| `OFLOW_MAX_CONCURRENT_TASKS` | No | `1` | Maximum number of tasks that can run in parallel. |
| `OFLOW_DEFAULT_WORKFLOW` | No | `dev-workflow` | Skill workflow name invoked at the start of each Claude Code session. |
| `OFLOW_POLL_INTERVAL_SECONDS` | No | `60` | How often (in seconds) the daemon polls the board for new ready tasks. |

#### GitHub (`OFLOW_BOARD=github`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `OFLOW_GITHUB_TOKEN` | Yes | — | GitHub personal access token with `repo` scope. |
| `OFLOW_GITHUB_REPO` | Yes | — | Target repository in `owner/repo` format (e.g. `acme/my-app`). |
| `OFLOW_TASK_LABEL` | No | `oflow-ready` | GitHub label that marks an issue as ready for oflow to pick up. |
| `OFLOW_TASK_IN_PROGRESS_LABEL` | No | `oflow-in-progress` | Label applied to an issue while a session is running. |
| `OFLOW_TASK_DONE_LABEL` | No | `oflow-done` | Label applied to an issue after the session completes. |

#### GitLab (`OFLOW_BOARD=gitlab`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `OFLOW_GITLAB_TOKEN` | Yes | — | GitLab personal access token with `api` scope. |
| `OFLOW_GITLAB_PROJECT_ID` | Yes | — | Target project in `owner/repo` format (e.g. `acme/my-app`). |
| `OFLOW_GITLAB_URL` | No | `https://gitlab.com/api/v4` | GitLab API base URL. Override for self-hosted GitLab instances. |

#### Jira (`OFLOW_BOARD=jira`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `OFLOW_JIRA_URL` | Yes | — | Jira instance base URL (e.g. `https://mycompany.atlassian.net`). |
| `OFLOW_JIRA_EMAIL` | Yes | — | Atlassian account email used to authenticate API requests. |
| `OFLOW_JIRA_TOKEN` | Yes | — | Jira API token. See [Jira Setup](#jira-setup) below. |
| `OFLOW_JIRA_PROJECT_KEY` | Yes | — | Jira project key (e.g. `DEV`). |
| `OFLOW_JIRA_BOARD_ID` | No | — | Jira board ID. Accepted in config but reserved for future sprint-based filtering — currently has no effect. |
| `OFLOW_JIRA_READY_STATUS` | No | `To Do` | Issue status name that marks a task as ready for oflow to pick up. |
| `OFLOW_JIRA_IN_PROGRESS_STATUS` | No | `In Progress` | Issue status applied while a session is running. |
| `OFLOW_JIRA_DONE_STATUS` | No | `Done` | Issue status applied after the session completes. |

### Agents

oflow supports two agent adapters, selected via the `OFLOW_AGENT` environment variable:

- **`claude-code`** (default) — spawns a Claude Code (`claude`) session for each task. Each skill step dispatches a native subagent, so steps run in isolated contexts with full tool access.
- **`opencode`** — spawns an `opencode` session for each task. Because opencode does not support native subagent dispatch, all skill steps execute sequentially within a single session context. This means the entire dev-workflow runs in one continuous conversation rather than per-step subagents.

Set `OFLOW_AGENT=opencode` in your `.env` file to use the opencode adapter.

Model selection is not managed by oflow — it is delegated to each agent's own configuration:

- **`claude-code`**: the model is controlled via Claude Code's own configuration. Use `claude model set <model>` or set the `model` field in `~/.claude/settings.json`.
- **`opencode`**: model selection is opencode's own concern, configured in opencode's settings.

### Jira Setup

To connect oflow to Jira, you need a Jira API token:

1. Go to your [Atlassian account security page](https://id.atlassian.com/manage-profile/security/api-tokens) and create a new API token.
2. Store the token in your environment. You can either:

   **Option A — environment variable** (add to your `.env` file):
   ```bash
   OFLOW_JIRA_TOKEN=<your-api-token>
   ```

   **Option B — macOS keychain** (oflow will read it automatically at startup):
   ```bash
   security add-generic-password -s oflow-jira -a <your-atlassian-email> -w <your-api-token>
   ```

3. Set the remaining required Jira variables in your `.env`:
   ```bash
   OFLOW_BOARD=jira
   OFLOW_JIRA_URL=https://mycompany.atlassian.net
   OFLOW_JIRA_EMAIL=you@example.com
   OFLOW_JIRA_PROJECT_KEY=DEV
   ```

Note: `OFLOW_JIRA_BOARD_ID` is accepted in config but is reserved for future sprint-based filtering and currently has no effect.

## Usage

### Daemon mode

Run the oflow daemon to automatically process tasks from your GitHub board:

```bash
oflow run
```

The daemon polls GitHub every `OFLOW_POLL_INTERVAL_SECONDS` seconds (default: 60) looking for issues labeled `oflow-ready`. When it finds one, it:

1. Applies the `oflow-in-progress` label to the issue.
2. Spawns a Claude Code session in the repository directory.
3. Invokes the configured workflow skill (default: `dev-workflow`) inside that session.
4. Applies the `oflow-done` label when the session completes.

The daemon runs until interrupted (`Ctrl+C`). Use `OFLOW_MAX_CONCURRENT_TASKS` to allow multiple tasks to run in parallel.

### Manual mode

To run the workflow for a single task without the daemon, open a Claude Code session in your repository and invoke the skill directly:

```
/dev-workflow
```

Before running, set the task ID so the skill can find the task context:

```bash
export OFLOW_CURRENT_TASK_ID=<issue-number>
claude
```

Then inside the Claude Code session type `/dev-workflow`. This is useful for one-off tasks, debugging a specific issue, or running the workflow interactively without the polling daemon.

## CLI Reference

All commands are available via the `oflow` binary.

### User-facing commands

These are intended for humans operating oflow directly.

| Command | Description |
|---|---|
| `oflow run [--label <label>]` | Start the daemon — polls GitHub and spawns Claude Code sessions for ready tasks. `--label` overrides `OFLOW_TASK_LABEL`. |
| `oflow status` | Show currently active agent sessions. |
| `oflow board list [--label <label>]` | List tasks from the board. `--label` filters by GitHub label. |
| `oflow board pick [--label <label>]` | Claim the next available task and initialize its run directory. |
| `oflow board update <id> [--status <status>] [--message <msg>]` | Update a task's status label (`in-progress`, `done`, or `failed`) and/or post a comment on the issue. |

### Agent-internal commands

These are used by Claude Code skill workflows during task execution, not typically invoked by hand.

| Command | Description |
|---|---|
| `oflow state init <task-id>` | Initialize the run directory (`.oflow/runs/<task-id>/`) for a task. |
| `oflow state write <artifact-name>` | Write an artifact from stdin into the current run directory. |
| `oflow state read <artifact-name>` | Print an artifact from the current run directory to stdout. |
| `oflow state list` | List all artifact names in the current run directory. |
| `oflow validate <artifact-name>` | Validate an artifact against its schema. Exits `0` on success, `1` on failure. |

## Skills Installation

oflow drives Claude Code sessions through a set of workflow skills stored in `.claude/skills/` inside this repo. For oflow to invoke these skills in your host project, you need to copy the skills directory into the host project once.

From inside the oflow repo, run:

```bash
cp -r .claude/skills/ /path/to/your/project/.claude/skills/
```

Or if you are already inside your host project:

```bash
cp -r /path/to/oflow/.claude/skills/ .claude/skills/
```

After copying, your host project should have a `.claude/skills/dev-workflow/` directory (and the supporting `steps/` sub-skills). Claude Code automatically discovers skills placed in `.claude/skills/` and makes them available as slash commands (e.g. `/dev-workflow`).

You only need to do this once per host project. Re-copy whenever you upgrade oflow and want the latest skill logic.

### Gitignoring run state

oflow stores per-task run state in `.oflow/runs/` inside the host project. This directory contains intermediate artifacts generated during task execution and does not need to be committed. Add it to your `.gitignore`:

```
.oflow/runs/
```

