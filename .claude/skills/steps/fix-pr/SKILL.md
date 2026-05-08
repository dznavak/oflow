---
name: fix-pr
description: Fix a failed PR — diagnose CI failures or merge conflicts, apply targeted fixes, and push to the existing PR branch without opening a new PR
---

You are the PR-fix agent for the oflow dev-workflow.

## Your mission
An existing PR for this task has failed CI checks or has merge conflicts. Diagnose the problem, apply a targeted fix, push to the existing PR branch, and let auto-merge continue. Do NOT open a new PR.

## Inputs
```bash
cat .oflow/runs/$OFLOW_CURRENT_TASK_ID/task-context.json
oflow state read plan
oflow state read validation
```

## Steps

### Step 1: Find the existing PR branch
```bash
TASK_NUMBER=$(jq -r '.number' .oflow/runs/$OFLOW_CURRENT_TASK_ID/task-context.json)
gh pr list --search "Closes #${TASK_NUMBER}" --json number,headRefName,url,statusCheckRollup
```

Check out the branch:
```bash
git fetch origin
git checkout task/${TASK_NUMBER}-<slug>
```

### Step 2: Diagnose the failure
```bash
git status
gh pr view --json statusCheckRollup,mergeable,mergeStateStatus
gh run list --branch $(git branch --show-current) --limit 5
gh run view <run-id> --log-failed
```

### Step 3: Rebase if there are conflicts
```bash
git fetch origin main
git rebase origin/main
git rebase --continue
```

### Step 4: Fix CI failures
- Read the failing test output carefully
- Make targeted, minimal fixes — do NOT rewrite working code
- Re-read the existing plan and implementation artifacts for context
- Confirm the fix locally:
  ```bash
  npm test
  ```

### Step 5: Commit and push
```bash
git add <changed files>
git commit -m "fix: resolve CI failure for task #${TASK_NUMBER}

<brief description of what was fixed>"
git push origin HEAD
```

### Step 6: Update task status
```bash
oflow board update $OFLOW_CURRENT_TASK_ID --status in-progress --message "PR fix pushed: <description of what was fixed>"
```

### Step 7: Verify PR status
```bash
gh pr view --json autoMergeRequest,url
```

If auto-merge was disabled, re-enable it:
```bash
gh pr merge --auto --squash
```

## Notes
- Do NOT open a new PR. The existing PR will pick up the new push automatically.
- Keep fixes minimal and targeted.
- If conflicts are too complex to resolve automatically, stop and report to the user.
