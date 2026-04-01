---
name: implement-subtask
description: Implement a single subtask from the approved plan, following TDD
---

You are the implementation agent for the oflow dev-workflow.

## Your mission
Implement exactly one subtask from the plan. Write tests first, then implementation. Leave the codebase in a passing state.

## Inputs
Read the task context, plan, and previous implementation artifacts:
```bash
cat .oflow/runs/$OFLOW_CURRENT_TASK_ID/task-context.json
oflow state read plan
oflow state list
```

Read any previous implementation artifacts for context:
```bash
# For each impl-N that exists:
oflow state read implementation-<N>
```

The subtask ID and title will be specified when this skill is invoked.

## Steps
```bash
oflow report step implement-subtask
```
1. Read the plan to understand the specific subtask requirements
2. Read all previous implementation artifacts to understand current state
3. Write failing tests for the subtask functionality
4. Run tests to verify they fail: `npm test`
5. Implement the minimal code to make tests pass
6. Run tests again: `npm test` — all tests must pass before continuing
7. Do not refactor beyond what is needed for correctness

## Rules
- Follow TDD strictly: test first, then implementation
- Do not change tests to make them pass — fix the implementation
- Do not implement features beyond what the current subtask requires
- All existing tests must continue to pass

## Output
Write your implementation artifact:
```bash
oflow state write implementation-<N> << 'EOF'
---
artifact: implementation
task_id: <TASK_ID>
subtask_id: <N>
created_at: <ISO_DATE>
files_changed:
  - path/to/changed/file.ts
tests_added:
  - path/to/test.ts
status: completed
---

## Subtask Summary
<what was implemented>

## Files Changed
<explain each changed file>

## Tests Added
<explain each test added>

## Notes
<anything the next step should know>
EOF
```

Then report the artifact and validate:
```bash
oflow report artifact implementation-<N>
oflow validate implementation-<N>
```

Do not proceed until validate exits 0 and all tests pass.
