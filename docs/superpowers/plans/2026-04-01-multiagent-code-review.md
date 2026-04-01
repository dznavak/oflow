# Multi-Agent Code Review Skills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic git diff in the existing code-review step skill with a proper merge-base diff and add shared review principles; create a new `multiagent-code-review` skill that fans out to three parallel specialist agents and assembles one final markdown report.

**Architecture:** Two skill files. The existing `steps/code-review/SKILL.md` is updated in-place — same oflow artifact format, better diff, same review principles as the new skill. The new `multiagent-code-review/SKILL.md` orchestrates diff generation, parallel agent dispatch, and assembly using Approach B (shared diff file + per-agent output files on disk).

**Tech Stack:** Claude Code skills (markdown instruction files), bash, git.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `.claude/skills/steps/code-review/SKILL.md` | Add merge-base diff, context discovery, review principles |
| Create | `.claude/skills/multiagent-code-review/SKILL.md` | New standalone parallel review skill |

No TypeScript files change. No new tests needed — these are markdown instruction files for Claude Code agents.

---

### Task 1: Update `.claude/skills/steps/code-review/SKILL.md`

Replace the existing file with the improved version: merge-base diff, context discovery, and review principles added. The oflow artifact format (PASS/FAIL verdict, `oflow state write review`, `oflow validate review`) is preserved exactly.

**Files:**
- Modify: `.claude/skills/steps/code-review/SKILL.md`

- [ ] **Step 1: Replace the file content**

Write the following to `.claude/skills/steps/code-review/SKILL.md`:

```markdown
---
name: code-review
description: Review all code changes for correctness, quality, and safety before opening a PR
---

You are the code review agent for the oflow dev-workflow.

## Your mission
Review all code changes made during this task and determine if they are safe to merge.

## Inputs

Read all oflow artifacts:
```bash
cat .oflow/runs/$OFLOW_CURRENT_TASK_ID/task-context.json
oflow state read exploration
oflow state read plan
oflow state read validation
oflow state list
```

Generate the diff:
```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git --no-pager diff --no-prefix --unified=100000 --minimal \
  $(git merge-base main --fork-point)...HEAD \
  > ${BRANCH}-review-diff.txt
```

Read the diff from `${BRANCH}-review-diff.txt`.

Discover and read project context — read all that exist:
- `CLAUDE.md` (repo root)
- `AGENTS.md` (repo root)
- All `README.md` files in the repository: `find . -name README.md -not -path '*/node_modules/*' -not -path '*/.git/*'`
- Any files under `docs/architecture/`, `docs/decisions/`, or directories matching `**/adr/` or `**/decisions/`

## Review principles

**Confidence bar:** Only raise an issue when confidence is >80%. If uncertain, stay silent. False positives erode trust.

**Writing style (Smart Brevity):**
- State the problem — 1 sentence.
- Why it matters — 1 sentence, only if not obvious.
- Link to code — relative path with line number.

**Skip these (low value):**
- Refactoring ideas — unless there is a clear bug or maintainability issue
- Multiple issues in one comment — choose the single most critical
- Logging suggestions — unless for error paths
- Pedantic text accuracy — unless it causes actual confusion

**When to stay silent:** If uncertain whether something is an issue, don't comment.

## Review criteria
- Correctness: does the code do what the plan says it should?
- Tests: are the tests meaningful? Do they cover edge cases?
- Safety: are there any regressions or breaking changes not accounted for?
- Style: does the code follow the patterns identified in exploration?
- Completeness: are all planned subtasks reflected in the diff?

## Steps
1. Read all oflow artifacts for task context
2. Generate the diff and read it from file
3. Discover and read project context files
4. Identify any blockers (must-fix before merge)
5. Identify suggestions (nice-to-have improvements, non-blocking)
6. Verdict: PASS if no blockers, FAIL if any blockers exist

## Output
Write your review:
```bash
oflow state write review << 'EOF'
---
artifact: review
task_id: <TASK_ID>
created_at: <ISO_DATE>
verdict: PASS
blockers: []
suggestions:
  - "<non-blocking suggestion>"
---

## Review Summary
<overall assessment>

## Code Quality
<specific observations about code quality>

## Test Coverage
<assessment of test quality and coverage>

## Blockers
<describe any must-fix issues — empty if verdict is PASS>

## Suggestions
<describe non-blocking improvements>
EOF
```

Then clean up and validate:
```bash
rm -f ${BRANCH}-review-diff.txt
oflow validate review
```

Do not proceed until validate exits 0.
```

- [ ] **Step 2: Verify the file was written correctly**

```bash
head -5 .claude/skills/steps/code-review/SKILL.md
```

Expected output starts with:
```
---
name: code-review
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/steps/code-review/SKILL.md
git commit -m "feat: update code-review step with merge-base diff and review principles"
```

---

### Task 2: Create `.claude/skills/multiagent-code-review/SKILL.md`

Create the new standalone skill directory and file. This skill orchestrates the full parallel review: diff generation, context discovery, three parallel agents, assembly, and cleanup.

**Files:**
- Create: `.claude/skills/multiagent-code-review/SKILL.md`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p .claude/skills/multiagent-code-review
```

- [ ] **Step 2: Write the skill file**

Write the following to `.claude/skills/multiagent-code-review/SKILL.md`:

````markdown
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
git --no-pager diff --no-prefix --unified=100000 --minimal \
  $(git merge-base $BASE --fork-point)...HEAD \
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

Substitute the actual value of `BRANCH` and `CONTEXT_FILES` into each prompt before dispatching.

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

---
# Code Review: <BRANCH>

## Summary
[What this PR does. For complex PRs: how the main changes interact with each other. 2-4 sentences maximum.]

## Findings

### [Finding title]
[Problem in 1 sentence.] [Why it matters — 1 sentence, only if not obvious.]
[`path/to/file.ts:42`](path/to/file.ts)
---

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
````

- [ ] **Step 3: Verify the file exists and has the correct frontmatter**

```bash
head -5 .claude/skills/multiagent-code-review/SKILL.md
```

Expected:
```
---
name: multiagent-code-review
description: Multi-agent parallel code review — fans out to three specialist agents then assembles one final report
---
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/multiagent-code-review/SKILL.md
git commit -m "feat: add multiagent-code-review skill with parallel specialist agents"
```

---

## Self-Review

**Spec coverage:**
- ✅ Update existing `steps/code-review/SKILL.md` with merge-base diff — Task 1
- ✅ Update existing skill with review principles — Task 1
- ✅ Update existing skill with context discovery — Task 1
- ✅ New `multiagent-code-review` skill — Task 2
- ✅ Base ref: explicit arg with auto-detect fallback — Task 2, Step 1
- ✅ Context auto-discovery (CLAUDE.md, AGENTS.md, READMEs, architecture/ADR dirs) — Task 2, Step 3
- ✅ Three parallel agents: logical, smells, tests — Task 2, Step 4
- ✅ Test review limited to two questions only — Agent 3 prompt
- ✅ >80% confidence bar applied by each agent and again at assembly — all agent prompts
- ✅ Assembly deduplicates, applies confidence bar, writes report — Task 2, Step 5
- ✅ Report format: summary + findings with relative local links — assembly prompt
- ✅ Cleanup of temp files — Task 2, Step 6
- ✅ Existing code-review artifact format (PASS/FAIL, oflow validate) unchanged — Task 1

**Placeholder scan:** No TBDs, no TODOs, no "implement later". All agent prompts are complete.

**Type consistency:** No shared types — both files are markdown. Filenames referenced consistently as `${BRANCH}-review-{logical,smells,tests,diff}.md/txt` throughout.
