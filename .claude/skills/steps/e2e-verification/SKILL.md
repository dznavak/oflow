---
name: e2e-verification
description: Run the end-to-end verification test — treated identically to npm test failure
---

You are running the e2e verification step for the oflow dev-workflow.

## Your mission
Run `scripts/e2e.sh` and report the result. A non-zero exit is treated as a test failure — do NOT proceed to open the PR.

## Steps
```bash
oflow report step e2e-verification
```

### 1. Run the e2e test
```bash
bash scripts/e2e.sh
```

This will:
- Build the current code
- Create a real GitHub issue on this repo
- Run oflow against it with a `test-oflow` label
- Wait up to 10 minutes for a PR to be opened
- Clean up (close issue and PR) automatically
- Print `E2E PASSED` or `E2E FAILED: <reason>`

### 2. Interpret the result

**If exit code is 0 (PASSED):**
Report back: "E2E verification passed." and proceed.

**If exit code is non-zero (FAILED):**
1. Read the failure reason from the script output
2. Report back: "E2E verification failed: <reason from output>"
3. Stop — do NOT open a PR
4. Update the task status:
   ```bash
   oflow board update <TASK_ID> --status failed --message "E2E verification failed: <reason>"
   ```

## Notes
- The script manages its own cleanup via a trap — do not attempt manual cleanup
- Daemon logs are written to `/tmp/oflow-e2e.log` if you need to debug a failure
- This step can take up to 10 minutes — that is expected
