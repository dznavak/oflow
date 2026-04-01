# Design: Multi-Agent Code Review Skills

**Date:** 2026-04-01
**Status:** Approved

---

## Overview

Two deliverables:

1. **Update** `.claude/skills/steps/code-review/SKILL.md` — replace basic `git diff` with a proper merge-base diff; add shared review principles (Smart Brevity, >80% confidence threshold, skip low-value). Keep the existing oflow PASS/FAIL artifact format unchanged.

2. **New skill** `.claude/skills/multiagent-code-review/SKILL.md` — standalone `/multiagent-code-review [ref]` skill that fans out to three parallel specialist agents and assembles one final markdown report.

---

## Diff Generation

Both skills generate the diff the same way.

**Base ref resolution:**
- If the user passes a ref explicitly (e.g., `/multiagent-code-review main`), use it.
- Otherwise auto-detect: check for `main`, then `develop`, then `master` on the remote.

**Command:**
```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
BASE=<resolved ref>
git --no-pager diff --no-prefix --unified=100000 --minimal \
  $(git merge-base $BASE --fork-point)...HEAD \
  > ${BRANCH}-review-diff.txt
```

---

## Context Discovery

Both skills auto-discover project context by reading (all that exist):

- `CLAUDE.md` (repo root)
- `AGENTS.md` (repo root)
- All `README.md` files in the repository (root + subdirectories)
- Any files under `docs/architecture/`, `docs/decisions/`, `**/adr/`, `**/decisions/`

Agents receive the list of discovered files and read the ones relevant to the code being reviewed.

---

## Shared Review Principles

Applied by every agent (specialist and assembly):

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

---

## Multi-Agent Skill Architecture (Approach B: shared diff file + per-agent output files)

### Artifacts on disk during a run

| File | Purpose | Kept after run? |
|------|---------|-----------------|
| `{branch}-review-diff.txt` | Full diff, read by all 3 agents | Deleted after assembly |
| `{branch}-review-logical.md` | Logical correctness findings | Deleted after assembly |
| `{branch}-review-smells.md` | Code smells findings | Deleted after assembly |
| `{branch}-review-tests.md` | Test review findings | Deleted after assembly |
| `{branch}-review.md` | Final assembled report | **Kept** |

### Parallel agents

Three agents run in parallel. Each reads `{branch}-review-diff.txt` and the discovered context files.

**Agent 1 — Logical Correctness** → `{branch}-review-logical.md`

Focus: follow the logical chain of changes.
- Bugs and incorrect assumptions
- Broken contracts between components
- Missed edge cases
- Logic that diverges from what the context says the code should do

**Agent 2 — Code Smells & Duplications** → `{branch}-review-smells.md`

Focus: structural quality of the changed code.
- Duplicated logic
- Violations of single responsibility
- Unnecessary complexity
- Abstractions that obscure rather than clarify
- Naming that hides intent

**Agent 3 — Test Review** → `{branch}-review-tests.md`

Two questions only:
1. Is all business logic covered by meaningful assertions?
2. Are the tests verifying real scenarios, or written only for coverage?

### Assembly step

After all three agents complete:

1. Read all three findings files.
2. Deduplicate — if two agents flag the same issue, keep the most precise description.
3. Apply skip rules one final time — drop anything below the confidence bar.
4. Write `{branch}-review.md` to the repo root.
5. Delete temp files: `{branch}-review-diff.txt`, `{branch}-review-logical.md`, `{branch}-review-smells.md`, `{branch}-review-tests.md`.

### Final report format

```markdown
# Code Review: {branch}

## Summary
{What this PR does. For complex PRs: how the main changes interact.}

## Findings

### {Finding title}
{Problem in 1 sentence.} {Why it matters — 1 sentence, only if not obvious.}
[`src/foo/bar.ts:42`](src/foo/bar.ts)
```

- If a category has no findings, it is omitted — no "Looks good!" filler.
- Local links use relative paths so they work from any machine.

---

## Updated dev-workflow Code Review Agent

The existing `.claude/skills/steps/code-review/SKILL.md` is updated as follows:

- **Diff:** replace `git diff main...HEAD` with the merge-base diff command above (using `main` as the fixed base, since this runs inside the dev-workflow after branch creation).
- **Context:** add auto-discovery of `CLAUDE.md`, `AGENTS.md`, all `README.md` files, and architecture/ADR directories.
- **Review principles:** add the shared principles section (confidence bar, Smart Brevity, skip low-value).
- **Artifact format:** unchanged — still writes `oflow state write review` with PASS/FAIL verdict, blockers, and suggestions.
