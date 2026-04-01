---
name: multiagent-code-review
description: Multi-agent parallel code review — fans out to three specialist agents then assembles one final report
---

# Multi-Agent Code Review

You are orchestrating a parallel code review across three specialist agents.

## Step 1: Resolve base ref

If the user passed a ref when invoking this skill (e.g., `/multiagent-code-review main`), use it as `BASE`.

Otherwise auto-detect:
```bash
git branch -r | grep -oE 'origin/(main|develop|master)' | sed 's/origin\///' | head -1
```

If auto-detection finds nothing, stop and ask the user to provide a base ref explicitly.

## Step 2: Get branch name and generate diff

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
FORK_POINT=$(git merge-base --fork-point "$BASE" HEAD 2>/dev/null) || FORK_POINT=$(git merge-base "$BASE" HEAD)
git --no-pager diff --no-prefix --unified=100000 --minimal \
  "${FORK_POINT}...HEAD" \
  > "${BRANCH}-review-diff.txt"
echo "Diff written to ${BRANCH}-review-diff.txt"
wc -c "${BRANCH}-review-diff.txt"
```

If `wc -c` reports 0 bytes, stop — there is nothing to review.

## Step 3: Discover context files

```bash
find . \( -name "CLAUDE.md" -o -name "AGENTS.md" -o -name "README.md" \) \
  -not -path '*/node_modules/*' -not -path '*/.git/*' | sort
find . -type f \( \
  -path '*/docs/architecture/*' \
  -o -path '*/docs/decisions/*' \
  -o -path '*/adr/*' \
  -o -path '*/decisions/*' \
\) -not -path '*/node_modules/*' -not -path '*/.git/*' | sort
```

Collect the resulting paths as `CONTEXT_FILES`.

## Step 4: Dispatch three specialist agents in parallel

Use the Agent tool to launch all three agents simultaneously — do NOT wait for one to finish before starting the others.

Each agent receives its input via the prompt. Substitute the actual values of `BRANCH` and `CONTEXT_FILES` before dispatching.

**Agent: `review-logical`**
```
DIFF_FILE: {BRANCH}-review-diff.txt
CONTEXT_FILES: {CONTEXT_FILES}
OUTPUT_FILE: {BRANCH}-review-logical.md
```

**Agent: `review-smells`**
```
DIFF_FILE: {BRANCH}-review-diff.txt
CONTEXT_FILES: {CONTEXT_FILES}
OUTPUT_FILE: {BRANCH}-review-smells.md
```

**Agent: `review-tests`**
```
DIFF_FILE: {BRANCH}-review-diff.txt
CONTEXT_FILES: {CONTEXT_FILES}
OUTPUT_FILE: {BRANCH}-review-tests.md
```

## Step 5: Assemble final report

After all three agents have completed, dispatch the assembly agent:

**Agent: `review-assembly`**
```
LOGICAL_FILE: {BRANCH}-review-logical.md
SMELLS_FILE: {BRANCH}-review-smells.md
TESTS_FILE: {BRANCH}-review-tests.md
DIFF_FILE: {BRANCH}-review-diff.txt
OUTPUT_FILE: {BRANCH}-review.md
```

## Step 6: Cleanup

After `{BRANCH}-review.md` exists:

```bash
rm -f "${BRANCH}-review-diff.txt"
rm -f "${BRANCH}-review-logical.md"
rm -f "${BRANCH}-review-smells.md"
rm -f "${BRANCH}-review-tests.md"
```

Report to the user: `Review complete. Report saved to ${BRANCH}-review.md`
