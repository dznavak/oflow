#!/usr/bin/env bash
# oflow end-to-end verification test
# Creates a real GitHub issue, runs oflow against it, verifies a PR is opened, then cleans up.
# Exit 0 = PASSED, Exit 1 = FAILED
set -euo pipefail

TIMEOUT=600        # 10 minutes
POLL_INTERVAL=30   # check every 30s
LABEL="test-oflow"
ISSUE_NUMBER=""
PR_NUMBER=""
DAEMON_PID=""

# --- Cleanup (always runs on exit) ---
cleanup() {
  echo ""
  echo "--- Cleanup ---"
  if [ -n "$DAEMON_PID" ] && kill -0 "$DAEMON_PID" 2>/dev/null; then
    echo "Stopping oflow daemon (PID $DAEMON_PID)"
    kill "$DAEMON_PID" 2>/dev/null || true
  fi
  if [ -n "$PR_NUMBER" ]; then
    echo "Closing PR #$PR_NUMBER"
    gh pr close "$PR_NUMBER" --comment "e2e test cleanup - closing automatically" 2>/dev/null || true
  fi
  if [ -n "$ISSUE_NUMBER" ]; then
    echo "Closing issue #$ISSUE_NUMBER"
    gh issue close "$ISSUE_NUMBER" --comment "e2e test cleanup - closing automatically" 2>/dev/null || true
  fi
}
trap cleanup EXIT

fail() {
  echo ""
  echo "E2E FAILED: $1"
  if [ -f /tmp/oflow-e2e.log ]; then
    echo ""
    echo "--- Daemon log (last 50 lines) ---"
    tail -50 /tmp/oflow-e2e.log
  fi
  exit 1
}

# --- Step 1: Build ---
echo "--- Step 1: Build ---"
npm run build || fail "npm run build failed"

# --- Step 2: Ensure labels exist ---
echo ""
echo "--- Step 2: Ensure labels exist ---"
gh label create "$LABEL" --color "#e11d48" --description "oflow e2e test" 2>/dev/null || true
gh label create "workflow:release-notes" --color "#0ea5e9" --description "oflow release-notes workflow" 2>/dev/null || true
gh label create "oflow-ready" --color "#16a34a" --description "oflow task ready to pick up" 2>/dev/null || true

# --- Step 3: Create test issue ---
echo ""
echo "--- Step 3: Create test issue ---"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ISSUE_BODY="This is an automated e2e test issue created by the oflow verification script.

## Task
Summarise the most recent changes in this repository by reading recent git commits,
then open a PR that adds a RELEASE_NOTES.md file at the repo root.

The file should contain a brief markdown summary of what changed and why."

ISSUE_URL=$(gh issue create \
  --title "test: e2e verification [$TIMESTAMP]" \
  --label "$LABEL" \
  --label "oflow-ready" \
  --label "workflow:release-notes" \
  --body "$ISSUE_BODY")

ISSUE_NUMBER=$(echo "$ISSUE_URL" | grep -oE '[0-9]+$')
echo "Created issue #$ISSUE_NUMBER ($ISSUE_URL)"
echo "Waiting 5s for GitHub API to propagate..."
sleep 5

# --- Step 4: Verify board visibility ---
echo ""
echo "--- Step 4: Verify board visibility ---"
BOARD_OUTPUT=$(node dist/cli/index.js board list --label "$LABEL" 2>&1) || fail "board list command failed: $BOARD_OUTPUT"

if ! echo "$BOARD_OUTPUT" | grep -q "\"id\": *\"$ISSUE_NUMBER\""; then
  echo "Board output: $BOARD_OUTPUT"
  fail "Issue #$ISSUE_NUMBER not visible in board list output"
fi
echo "Issue #$ISSUE_NUMBER is visible on the board"

# --- Step 5: Spawn daemon ---
echo ""
echo "--- Step 5: Spawn oflow daemon ---"
node dist/cli/index.js run --label "$LABEL" > /tmp/oflow-e2e.log 2>&1 &
DAEMON_PID=$!
echo "Daemon started (PID $DAEMON_PID), logging to /tmp/oflow-e2e.log"

# --- Step 6: Poll for PR ---
echo ""
echo "--- Step 6: Polling for PR (timeout: ${TIMEOUT}s, interval: ${POLL_INTERVAL}s) ---"
ELAPSED=0

while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
  sleep "$POLL_INTERVAL"
  ELAPSED=$((ELAPSED + POLL_INTERVAL))

  # Check daemon is still alive
  if ! kill -0 "$DAEMON_PID" 2>/dev/null; then
    fail "oflow daemon exited prematurely after ${ELAPSED}s"
  fi

  # Search for an open PR referencing the issue number
  PR_NUMBER=$(gh pr list \
    --state open \
    --search "#$ISSUE_NUMBER" \
    --json number \
    --jq ".[0].number // empty" 2>/dev/null || true)

  if [ -n "$PR_NUMBER" ]; then
    echo ""
    echo "PR #$PR_NUMBER found after ${ELAPSED}s"
    break
  fi

  echo "  [${ELAPSED}s/${TIMEOUT}s] No PR yet..."
done

# --- Step 7: Assert ---
if [ -z "$PR_NUMBER" ]; then
  fail "No PR opened within ${TIMEOUT}s timeout"
fi

echo ""
echo "E2E PASSED: PR #$PR_NUMBER opened for issue #$ISSUE_NUMBER in ${ELAPSED}s"
exit 0
