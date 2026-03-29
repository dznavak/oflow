---
name: dev-workflow
description: Full development workflow from task pickup to PR — explore, plan, implement, validate, review, open PR
---

You are executing the oflow dev-workflow for a GitHub issue.

## Setup
First, confirm you have the task context:
```bash
cat .oflow/runs/$(cat .oflow/current)/task-context.json
```

## Workflow Steps

Execute each step by spawning a subagent using the Agent tool.
After each step, verify the artifact was written and validated before proceeding.

### Step 1: Exploration
Use Agent tool with prompt: "Follow the exploration skill at skills/steps/exploration.md"
Wait for completion. Verify: `oflow validate exploration` exits 0.

### Step 2: Planning
Use Agent tool with prompt: "Follow the plan skill at skills/steps/plan.md"
Wait for completion. Verify: `oflow validate plan` exits 0.

### Step 3: Plan Review (loop until PASS)
Use Agent tool with prompt: "Follow the review-plan skill at skills/steps/review-plan.md"
Read the verdict:
```bash
oflow state read plan-review | head -20
```
If verdict is FAIL: return to Step 2 with the review feedback.
If verdict is PASS: proceed to Step 4.
Maximum 3 iterations. If still failing after 3: stop, update task status to failed, report blocker.

### Step 4: Implementation (one subtask at a time)
Read the plan to get subtask list:
```bash
oflow state read plan
```
For each subtask in order:
  Use Agent tool with prompt: "Follow the implement-subtask skill at skills/steps/implement-subtask.md for subtask <N>: <title>"
  Verify: `oflow validate implementation-<N>` exits 0 and tests pass.
  If tests fail: do NOT proceed to next subtask. Report the failure and stop.

### Step 5: Final Validation
Use Agent tool with prompt: "Follow the final-validation skill at skills/steps/final-validation.md"
Verify: `oflow validate validation` exits 0 and verdict is PASS.
If FAIL: report which tests failed and stop.

### Step 6: Code Review
Use Agent tool with prompt: "Follow the code-review skill at skills/steps/code-review.md"
Verify: `oflow validate review` exits 0 and verdict is PASS (no blockers).

### Step 7: Open PR
Use Agent tool with prompt: "Follow the open-pr skill at skills/steps/open-pr.md"

## Error handling
If any step fails or produces an invalid artifact:
1. Update task status: `oflow board update <TASK_ID> --status failed --message "Failed at step: <STEP_NAME>. <details>"`
2. Report the exact failure to the user.
3. Stop.
