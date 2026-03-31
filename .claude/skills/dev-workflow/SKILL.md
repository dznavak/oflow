---
name: dev-workflow
description: Full development workflow from task pickup to PR — explore, plan, implement, validate, review, open PR
---

You are executing the oflow dev-workflow for a GitHub issue.

## Setup
First, confirm you have the task context:
```bash
cat .oflow/runs/$OFLOW_CURRENT_TASK_ID/task-context.json
```

## Workflow Steps

Execute each step by spawning a subagent using the Agent tool.
After each step, verify the artifact was written and validated before proceeding.

### Step 1: Exploration
Use Agent tool with prompt: "Follow the exploration skill at .claude/skills/steps/exploration/SKILL.md"
Wait for completion. Verify: `oflow validate exploration` exits 0.

### Step 2: Planning
Use Agent tool with prompt: "Follow the plan skill at .claude/skills/steps/plan/SKILL.md"
Wait for completion. Verify: `oflow validate plan` exits 0.

### Step 3: Plan Review (loop until PASS)
Use Agent tool with prompt: "Follow the review-plan skill at .claude/skills/steps/review-plan/SKILL.md"
Read the verdict:
```bash
oflow state read plan-review | head -20
```
If verdict is FAIL: return to Step 2 with the review feedback.
If verdict is PASS: proceed to Step 4.
Maximum 3 iterations. If still failing after 3: stop, update task status to failed, report blocker.

### Step 3.5: Create a branch for this task
Before any code changes, create a dedicated branch:
```bash
TASK_NUMBER=$(cat .oflow/runs/$OFLOW_CURRENT_TASK_ID/task-context.json | grep '"number"' | grep -o '[0-9]*')
TASK_TITLE=$(cat .oflow/runs/$OFLOW_CURRENT_TASK_ID/task-context.json | grep '"title"' | sed 's/.*"title": *"//;s/".*//' | sed 's/[^a-zA-Z0-9]/-/g' | tr '[:upper:]' '[:lower:]' | sed 's/--*/-/g;s/^-//;s/-$//' | cut -c1-40)
git checkout -b "task/${TASK_NUMBER}-${TASK_TITLE}"
```
If the branch already exists, check it out: `git checkout "task/${TASK_NUMBER}-${TASK_TITLE}"`

### Step 4: Implementation (one subtask at a time)
Read the plan to get subtask list:
```bash
oflow state read plan
```
For each subtask in order:
  Use Agent tool with prompt: "Follow the implement-subtask skill at .claude/skills/steps/implement-subtask/SKILL.md for subtask <N>: <title>"
  Verify: `oflow validate implementation-<N>` exits 0 and tests pass.
  If tests fail: do NOT proceed to next subtask. Report the failure and stop.

### Step 5: Final Validation
Use Agent tool with prompt: "Follow the final-validation skill at .claude/skills/steps/final-validation/SKILL.md"
Verify: `oflow validate validation` exits 0 and verdict is PASS.
If FAIL: report which tests failed and stop.

### Step 6: E2E Verification
Use Agent tool with prompt: "Follow the e2e-verification skill at .claude/skills/steps/e2e-verification/SKILL.md"
If the script exits non-zero: stop, update task status to failed, report the failure reason. Do NOT proceed.

### Step 7: Code Review
Use Agent tool with prompt: "Follow the code-review skill at .claude/skills/steps/code-review/SKILL.md"
Verify: `oflow validate review` exits 0 and verdict is PASS (no blockers).

### Step 8: Open PR
Use Agent tool with prompt: "Follow the open-pr skill at .claude/skills/steps/open-pr/SKILL.md"

## Error handling
If any step fails or produces an invalid artifact:
1. Update task status: `oflow board update <TASK_ID> --status failed --message "Failed at step: <STEP_NAME>. <details>"`
2. Report the exact failure to the user.
3. Stop.
