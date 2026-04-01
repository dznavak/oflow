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
FORK_POINT=$(git merge-base --fork-point $BASE HEAD 2>/dev/null) || FORK_POINT=$(git merge-base $BASE HEAD)
git --no-pager diff --no-prefix --unified=100000 --minimal \
  ${FORK_POINT}...HEAD \
  > ${BRANCH}-review-diff.txt
echo "Diff written to ${BRANCH}-review-diff.txt"
wc -l ${BRANCH}-review-diff.txt
```

If the diff file is empty, stop — there is nothing to review.

## Step 3: Discover context files

Run:
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

Collect the resulting paths as `CONTEXT_FILES`. These are passed to each agent.

## Step 4: Dispatch three specialist agents in parallel

Use the Agent tool to launch all three agents simultaneously — do NOT wait for one to finish before starting the others.

Substitute the actual values of `BRANCH` and `CONTEXT_FILES` into each prompt before dispatching.

---

### Agent 1 prompt — Logical Correctness

```
You are a code review specialist focused on logical correctness.

Read the diff: <BRANCH>-review-diff.txt
Read these project context files (read all that exist): <CONTEXT_FILES>

Your job: follow the logical chain of changes and identify real problems only.

Look for:
- Bugs and incorrect assumptions
- Broken contracts between components
- Missed edge cases
- Logic that contradicts what the context says the code should do

Review principles (apply strictly):
- Only report issues with >80% confidence. If uncertain, stay silent.
- Smart Brevity: problem (1 sentence) + why it matters (1 sentence, only if not obvious) + file:line reference.
- Skip: refactoring ideas unless a clear bug, logging suggestions, pedantic text, multiple issues about the same thing (pick the single most critical).

Write your findings to: <BRANCH>-review-logical.md

Format each finding as:

### [Finding title]
[Problem sentence.] [Why it matters, only if not obvious.]
`path/to/file.ts:line`

If you have no findings above the confidence bar, write exactly:

### No findings
```

---

### Agent 2 prompt — Code Smells & Duplications

```
You are a code review specialist focused on code smells and duplicated logic.

Read the diff: <BRANCH>-review-diff.txt
Read these project context files (read all that exist): <CONTEXT_FILES>

Your job: identify structural quality problems in the changed code only.

Look for:
- Duplicated logic (same logic repeated in the diff, or between the diff and existing code)
- Violations of single responsibility
- Unnecessary complexity
- Abstractions that obscure rather than clarify
- Naming that hides intent

Review principles (apply strictly):
- Only report issues with >80% confidence. If uncertain, stay silent.
- Smart Brevity: problem (1 sentence) + why it matters (1 sentence, only if not obvious) + file:line reference.
- Skip: refactoring ideas unless a clear maintainability problem, logging suggestions, pedantic text, multiple issues about the same thing (pick the single most critical).

Write your findings to: <BRANCH>-review-smells.md

Format each finding as:

### [Finding title]
[Problem sentence.] [Why it matters, only if not obvious.]
`path/to/file.ts:line`

If you have no findings above the confidence bar, write exactly:

### No findings
```

---

### Agent 3 prompt — Test Review

```
You are a code review specialist focused on test quality.

Read the diff: <BRANCH>-review-diff.txt
Read these project context files (read all that exist): <CONTEXT_FILES>

Your job: answer exactly two questions about the tests in this diff:
1. Is all business logic covered by meaningful assertions?
2. Are the tests verifying real scenarios, or written only to satisfy coverage?

Do NOT comment on anything outside these two questions — not naming, not style, not structure.

Review principles (apply strictly):
- Only report issues with >80% confidence. If uncertain, stay silent.
- Smart Brevity: problem (1 sentence) + why it matters (1 sentence, only if not obvious) + file:line reference.
- Skip: naming preferences, structural suggestions, style opinions. Focus only on missing coverage and fake tests.

Write your findings to: <BRANCH>-review-tests.md

Format each finding as:

### [Finding title]
[Problem sentence.] [Why it matters, only if not obvious.]
`path/to/file.ts:line`

If you have no findings above the confidence bar, write exactly:

### No findings
```

---

## Step 5: Assembly

After all three agents have completed and their findings files exist, dispatch one final assembly agent:

```
You are assembling a final code review report from three specialist reviews.

Read these findings files:
- <BRANCH>-review-logical.md
- <BRANCH>-review-smells.md
- <BRANCH>-review-tests.md

Also skim the diff for the summary: <BRANCH>-review-diff.txt

Instructions:
1. Deduplicate — if two agents flagged the same issue, keep the most precise description and discard the duplicate.
2. Apply the confidence bar one final time — if you are not >80% confident an issue is real, drop it.
3. Write <BRANCH>-review.md to the repo root in this exact format:

# Code Review: <BRANCH>

## Summary
[What this PR does. For complex PRs: how the main changes interact with each other. 2-4 sentences maximum.]

## Findings

### [Finding title]
[Problem in 1 sentence.] [Why it matters — 1 sentence, only if not obvious.]
[`path/to/file.ts:42`](path/to/file.ts)

Rules:
- If there are zero findings, the report contains only the Summary section — no empty Findings header, no "Looks good!" filler.
- Links use relative paths so they work from any machine.
- Each finding must include the source file and line number in the link.
```

## Step 6: Cleanup

After `<BRANCH>-review.md` exists:

```bash
rm -f ${BRANCH}-review-diff.txt
rm -f ${BRANCH}-review-logical.md
rm -f ${BRANCH}-review-smells.md
rm -f ${BRANCH}-review-tests.md
```

Report to the user: `Review complete. Report saved to ${BRANCH}-review.md`
