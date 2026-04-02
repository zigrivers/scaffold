# Beads Contributor-Surface Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove repo-local Beads workflow cues that make agents think the Scaffold repository itself uses Beads, while preserving Beads as an optional feature for downstream user projects.

**Architecture:** This is a documentation-and-instructions cleanup with three boundaries. Contributor entrypoints (`AGENTS.md`, `CLAUDE.md`) become explicit that Scaffold does not use Beads for repo task tracking. Maintainer docs (`docs/v2/operations-runbook.md`, `docs/v2/security-practices.md`) are rewritten to use the actual repo workflow. Product-facing docs (`README.md`, `docs/v2/reference/scaffold-overview.md`) keep Beads feature references but add a short disambiguation so agents do not confuse downstream project workflows with Scaffold’s own maintainer workflow.

**Tech Stack:** Markdown docs, repo instruction files, ripgrep, git, npm scripts (`npm run check`)

---

## File Map

| File | Change |
|------|--------|
| `AGENTS.md` | Remove `bd` onboarding/quick-reference/push workflow instructions; replace with actual Scaffold contributor workflow |
| `CLAUDE.md` | Add one explicit sentence that Beads is a downstream-project feature, not Scaffold’s repo task-tracking workflow |
| `docs/v2/operations-runbook.md` | Remove maintainer-facing Beads requirements, release checks, env vars, quick-start commands, and repo-local `.beads/` references |
| `docs/v2/security-practices.md` | Replace Beads-specific follow-up guidance with issue-based follow-up language; remove repo-local `.beads/` packaging reference |
| `README.md` | Add brief contributor-vs-product Beads disambiguation near the `beads` step |
| `docs/v2/reference/scaffold-overview.md` | Add explicit disambiguation and soften Beads wording so it is clearly optional product behavior, not Scaffold’s own maintainer workflow |

## Guardrails

These files are intentionally **read-only for this plan** unless a specific line is discovered to describe Scaffold’s own maintainer workflow:

- `pipeline/**`
- `knowledge/**`
- `methodology/**`
- `tools/release.md`
- `tools/version-bump.md`
- `src/**`
- Beads feature tests such as `src/e2e/rework.test.ts`

Rationale: those are product surfaces for downstream user projects. The goal here is contributor-surface cleanup, not feature removal.

---

### Task 1: Fix Primary Agent Entry Points

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Capture the current failing contributor state**

Run:

```bash
rg -n -i "beads|\\bbd\\b|\\.beads/|\\[BD-|BD_ACTOR" AGENTS.md CLAUDE.md
```

Expected: `AGENTS.md` reports Beads/`bd` matches. `CLAUDE.md` may report no hits yet.

- [ ] **Step 2: Replace the Beads-driven content in `AGENTS.md`**

Patch `AGENTS.md` so the top section becomes:

~~~md
# Agent Instructions

This repository does not use Beads for repo task tracking. Do not run `bd`
commands when working on Scaffold itself.

## Quick Reference

```bash
npm run check         # Run lint + type-check + tests
npm run build         # Compile TypeScript to dist/
git status -sb        # Inspect local state quickly
git pull --rebase     # Rebase onto latest remote state
git push              # Publish local commits
```
~~~

Also replace the push block in the "Landing the Plane" section with:

~~~md
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
~~~

And replace the issue-related bullets with tracker-neutral language:

```md
1. **File follow-up work** - Create GitHub issues or leave explicit handoff notes for anything that still needs work
3. **Update follow-up status** - Make sure remaining work is reflected in issues, PR comments, or the handoff
```

- [ ] **Step 3: Add one explicit disambiguation line to `CLAUDE.md`**

Insert this paragraph directly after the `## Project Overview` paragraph:

```md
Beads is an optional workflow Scaffold can generate for downstream projects. It
is not the task-tracking workflow used to develop the Scaffold repository
itself.
```

- [ ] **Step 4: Verify the entrypoint cleanup**

Run:

```bash
rg -n -i "\\bbd\\b|\\.beads/|\\[BD-|BD_ACTOR" AGENTS.md CLAUDE.md
rg -n "Beads is an optional workflow Scaffold can generate for downstream projects" CLAUDE.md
```

Expected:
- first command prints no matches
- second command prints the new disambiguation line from `CLAUDE.md`

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md CLAUDE.md
git commit -m "docs: remove beads workflow from repo agent instructions"
```

---

### Task 2: Scrub Maintainer Docs

**Files:**
- Modify: `docs/v2/operations-runbook.md`
- Modify: `docs/v2/security-practices.md`

- [ ] **Step 1: Confirm the maintainer-doc hotspots before editing**

Run:

```bash
rg -n -i "beads|\\bbd\\b|\\.beads/|\\[BD-|BD_ACTOR" \
  docs/v2/operations-runbook.md \
  docs/v2/security-practices.md
```

Expected: matches in the related-docs section, prerequisites table, env var table, release checklist, contributor quick reference, and security follow-up guidance.

- [ ] **Step 2: Rewrite `docs/v2/operations-runbook.md` to use the actual repo workflow**

Apply these exact content changes:

**Related documents bullet**

```md
- [CLAUDE.md](../../CLAUDE.md) — contributor workflow, quality gates, and autonomous agent conventions
```

**Prerequisites table**

Delete the Beads row entirely:

```md
| Beads (`bd`) | Latest | Task tracking | `brew install beads` |
```

**Environment variables section**

Replace the table row with a no-env-var statement:

```md
Scaffold v2 requires **no environment variables** for normal development,
release, or runtime operation.
```

Delete this row:

```md
| `BD_ACTOR` | Only in parallel agent workflows | Beads attribution — identifies which agent claimed a task |
```

**Release checklist**

Replace step 1 with:

```md
1. **Verify release scope is complete**: merged PRs, open follow-up issues, and release notes all agree on what is included in this release
```

**Release health tracking table**

Replace:

```md
| Feature requests | GitHub Discussions or Beads | Weekly review |
```

With:

```md
| Feature requests | GitHub Discussions or GitHub Issues | Weekly review |
```

**Contributor quick-start**

Replace the Beads-based command block with:

~~~md
```bash
git clone <repo-url> && cd scaffold
npm install && npm test              # Install + verify
# Pick work from GitHub issues, PR follow-ups, or the session scope
# Implement with TDD: write test -> red -> green -> refactor
npm run check                        # All quality gates
git commit -m "type(scope): description"
```
~~~

And replace the follow-up sentence with:

```md
See CLAUDE.md for the full contributor workflow and repository-specific instructions.
```

**Packaging exclusions**

Delete `.beads/` from the "must NEVER be published" list.

- [ ] **Step 3: Rewrite `docs/v2/security-practices.md` to remove Scaffold-maintainer Beads follow-up language**

Make these exact replacements:

**Severity table**

Replace:

```md
| Medium | Warning | Within sprint | Track in Beads, fix when touching the affected module |
```

With:

```md
| Medium | Warning | Within sprint | Track in a GitHub issue or release follow-up list, fix when touching the affected module |
```

**Exception process**

Replace the last clause:

```md
(4) file a Beads task to remove the override when an upstream fix ships.
```

With:

```md
(4) file a follow-up GitHub issue to remove the override when an upstream fix ships.
```

**npm/package security list**

Delete:

```md
- `.beads/` — task tracking database
```

- [ ] **Step 4: Verify the maintainer-doc scrub**

Run:

```bash
rg -n -i "\\bbd\\b|\\.beads/|\\[BD-|BD_ACTOR" \
  docs/v2/operations-runbook.md \
  docs/v2/security-practices.md
```

Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add docs/v2/operations-runbook.md docs/v2/security-practices.md
git commit -m "docs: remove beads workflow from maintainer docs"
```

---

### Task 3: Add Product-vs-Contributor Disambiguation

**Files:**
- Modify: `README.md`
- Modify: `docs/v2/reference/scaffold-overview.md`

- [ ] **Step 1: Confirm the current product-doc ambiguity**

Run:

```bash
rg -n -i "beads|\\bbd\\b|\\.beads/|\\[BD-|BD_ACTOR" README.md docs/v2/reference/scaffold-overview.md
```

Expected: both files mention Beads as if it is central or required, with no explicit distinction between downstream-project workflows and Scaffold’s own maintainer workflow.

- [ ] **Step 2: Add a short note to `README.md`**

Insert this callout immediately after the Phase 2 introductory paragraph and before the step table:

```md
> Beads is an optional workflow Scaffold can generate for user projects. It is
> not the task-tracking workflow used to develop Scaffold itself.
```

Do not remove the `beads` row from the step table.

- [ ] **Step 3: Clarify the same distinction in `docs/v2/reference/scaffold-overview.md`**

Make these concrete edits:

**Add a note near the top of the document** after the "How It Works" introduction:

```md
> Beads references in this document describe an optional workflow Scaffold can
> generate for downstream projects. They do not describe the workflow used to
> maintain the Scaffold repository itself.
```

**Soften mandatory wording** in the overview so it reads as optional product behavior:

Replace:

```md
The pipeline culminates in an implementation plan broken into Beads tasks, which agents then execute — either single-agent or multi-agent via git worktrees.
```

With:

```md
The pipeline culminates in an implementation plan and, when a project opts into
the `beads` step, a Beads-backed task workflow that agents can execute in
single-agent or multi-agent mode via git worktrees.
```

Replace:

```md
- **Beads task tracking** — integrated task management with `@beads/bd` throughout the pipeline
```

With:

```md
- **Optional Beads task tracking** — a task-management workflow Scaffold can set up for projects that choose the `beads` step
```

Replace:

```md
| Install Beads (`npm install -g @beads/bd` or `brew install beads`) | Required for task tracking |
```

With:

```md
| Install Beads (`npm install -g @beads/bd` or `brew install beads`) | Optional — only needed for projects that use the `beads` step |
```

Replace the glossary row:

```md
| **Beads** | Task tracking tool (`@beads/bd`) used throughout the pipeline for creating, managing, and executing implementation tasks |
```

With:

```md
| **Beads** | Optional task tracking tool (`@beads/bd`) that Scaffold can configure for downstream projects that choose the `beads` step |
```

- [ ] **Step 4: Verify the disambiguation edits**

Run:

```bash
rg -n "optional workflow Scaffold can generate for user projects|do not describe the workflow used to maintain the Scaffold repository itself|Optional Beads task tracking" \
  README.md \
  docs/v2/reference/scaffold-overview.md
```

Expected: matches in both files showing the new distinction.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/v2/reference/scaffold-overview.md
git commit -m "docs: clarify beads as a downstream project feature"
```

---

### Task 4: Final Verification And Publish

**Files:**
- Modify: none
- Verify: `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/v2/operations-runbook.md`, `docs/v2/security-practices.md`, `docs/v2/reference/scaffold-overview.md`

- [ ] **Step 1: Run the targeted contributor-surface check**

Run:

```bash
rg -n -i "\\bbd\\b|\\.beads/|\\[BD-|BD_ACTOR" \
  AGENTS.md \
  CLAUDE.md \
  docs/v2/operations-runbook.md \
  docs/v2/security-practices.md
```

Expected: no matches.

- [ ] **Step 2: Run the disambiguation check**

Run:

```bash
rg -n "Beads is an optional workflow Scaffold can generate for downstream projects|Beads is an optional workflow Scaffold can generate for user projects|do not describe the workflow used to maintain the Scaffold repository itself" \
  CLAUDE.md \
  README.md \
  docs/v2/reference/scaffold-overview.md
```

Expected: explicit clarification appears in the contributor and product-facing files that are most likely to be read by agents.

- [ ] **Step 3: Run one broader inspection search**

Run:

```bash
rg -n -i "beads|\\bbd\\b|\\.beads/|\\[BD-|BD_ACTOR" \
  AGENTS.md \
  CLAUDE.md \
  README.md \
  docs/v2/operations-runbook.md \
  docs/v2/security-practices.md \
  docs/v2/reference/scaffold-overview.md
```

Expected: only intentional product-facing Beads references remain in `README.md` and `docs/v2/reference/scaffold-overview.md`.

- [ ] **Step 4: Run repository quality gates**

Run:

```bash
npm run check
```

Expected: lint, type-check, and test suites all pass.

- [ ] **Step 5: Commit, push, and confirm branch state**

```bash
git add AGENTS.md CLAUDE.md README.md docs/v2/operations-runbook.md docs/v2/security-practices.md docs/v2/reference/scaffold-overview.md
git commit -m "docs: remove beads confusion from contributor surfaces"
git pull --rebase
git push
git status -sb
```

Expected:
- commit succeeds
- push succeeds
- final status shows `main...origin/main` with no ahead/behind marker

---

## Spec Coverage Check

- **Preserve user-facing Beads support:** covered by guardrails and Task 3 wording updates that preserve `beads` as an optional product feature.
- **Remove repo-local Beads workflow guidance:** covered by Task 1 and Task 2.
- **Add explicit disambiguation where needed:** covered by Task 1 (`CLAUDE.md`) and Task 3 (`README.md`, `docs/v2/reference/scaffold-overview.md`).
- **Verification is semantic, not zero-string:** covered by Task 4’s split checks and the broad inspection search.

## Placeholder Scan

No `TODO`, `TBD`, “similar to”, or undefined follow-up steps remain. Every task lists exact files, replacement content, commands, and expected outcomes.

## Type / Naming Consistency Check

Terminology is consistent throughout the plan:

- "contributor surface" means repo-local agent entrypoints and maintainer docs
- "product surface" means downstream-user-facing Scaffold docs/features
- "Beads disambiguation" uses the same downstream-project wording across `CLAUDE.md`, `README.md`, and `docs/v2/reference/scaffold-overview.md`
