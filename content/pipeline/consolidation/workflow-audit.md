---
name: workflow-audit
description: Verify workflow consistency across all documentation files
summary: "Audits every document that mentions workflow (CLAUDE.md, AGENTS.md, git-workflow, coding-standards, dev-setup) and fixes inconsistencies in commit format, branch naming, PR steps, key commands, retired conventions, and the AGENTS.md/CLAUDE.md instruction-file split."
phase: "consolidation"
order: 1120
dependencies: [claude-md-optimization]
outputs: [CLAUDE.md, AGENTS.md, docs/git-workflow.md, docs/coding-standards.md, tasks/lessons.md]
conditional: null
reads: [operations, beads, git-workflow]
knowledge-base: [cross-phase-consistency, claude-md-patterns, git-workflow-patterns]
---

## Purpose
Cross-reference all documentation to ensure the canonical ship loop and the
AGENTS.md/CLAUDE.md instruction-file split are consistently documented.
Check every document that touches workflow (CLAUDE.md, AGENTS.md,
git-workflow.md, coding-standards.md, dev-setup.md, operations-runbook.md,
Makefile/package.json, agent-ops.mk) for contradictions, stale references,
retired conventions, missing steps, and inconsistent command formats. Fix
all issues found.

## Inputs
- CLAUDE.md (required) — Key Commands and error-recovery table to audit
- AGENTS.md (required) — binding Operations core section to audit
- docs/git-workflow.md (required) — git workflow to verify alignment; the
  8-step + 5.5 enumeration AGENTS.md's ship-loop summary must not contradict
- docs/coding-standards.md (required) — commit format to verify
- docs/dev-setup.md (required) — commands to verify match Key Commands
- docs/beads-workflow.md (optional) — Beads reference AGENTS.md's Beads
  rules must point to, when Beads is configured
- Makefile or package.json (required) — actual commands to match against
- agent-ops.mk (optional) — installed agent-ops targets to verify against
  the Key Commands table
- .github/ (optional) — verify `pull_request_template.md` exists and that
  no workflow file or reference reads as present-tense CI setup (CI is
  deliberately deferred — deferral language only; see the "Quality gates
  (CI deferred)" section in docs/git-workflow.md)
- docs/operations-runbook.md (optional) — deployment pipeline to verify
  doesn't contradict CI or dev-setup
- tasks/lessons.md (optional) — verify it exists and is referenced

## Expected Outputs
- CLAUDE.md — corrected Key Commands table and error-recovery table
- AGENTS.md — corrected Operations core section (ship-loop summary, standing
  authorization, parallel-safety rules, Beads rules, `/work-beads` routing)
- docs/git-workflow.md — any contradictions fixed
- docs/coding-standards.md — commit format aligned
- Makefile/package.json — missing targets added (if needed)
- tasks/lessons.md — created if missing

## Quality Criteria
- (mvp) AGENTS.md contains the 8-step ship-loop summary ending in the batch
  report, and docs/git-workflow.md documents all 8 PR-workflow steps plus
  step 5.5 (`mmr review --pr <N> --sync --format json`) — the two
  enumerations agree rather than compete
- (mvp) No `bd-<id>` branch-name or commit-subject-prefix convention appears
  anywhere (CLAUDE.md, AGENTS.md, docs/git-workflow.md,
  docs/coding-standards.md, docs/beads-workflow.md) — a Beads task ID, when
  configured, appears only in the commit/PR body as `Closes <id>`
- (mvp) Branch naming is `<type>/<short-desc>` everywhere (worktree
  workspace branches `agent/<name>`); no document still documents the
  retired convention of a bead ID as the branch's leading path segment
- (mvp) No `.github/workflows/` reference is presented as present-tense
  setup — every mention uses deferral language ("when a launch target is
  chosen…"), never "the CI pipeline runs…" or similar
- (mvp) PR workflow includes all 8 steps plus step 5.5 with the
  `--delete-branch` flag on the merge step
- (mvp) If Beads: task closure uses `bd close` (not
  `bd update --status completed`)
- (mvp) Key Commands table matches actual Makefile/package.json commands,
  and every target `agent-ops.mk` defines has a matching Key Commands row
  using that target's own marker — no row for an uninstalled target, no
  installed target missing a row
- (mvp) `/work-beads` routing ("open `.agents/skills/work-beads/SKILL.md`
  and follow it exactly") is present in AGENTS.md's Operations core section
- (mvp) CLAUDE.md contains the error-recovery table with all seven required
  rows (test failure, Docker contention, pre-commit failure, merge conflict,
  crashed mid-task, detached primary, review-channel auth failure)
- (mvp) AGENTS.md's Beads rules subsection references docs/beads-workflow.md
  when that file exists
- (deep) Worktree cleanup between tasks documented (cannot checkout main)
- (deep) Agent crash recovery documented
- (deep) No document contradicts the canonical ship loop
- (mvp) AGENTS.md's Operations core section and docs/git-workflow.md's
  8-step + 5.5 enumeration are the source of truth for the ship loop;
  CLAUDE.md's Key Commands and error-recovery table must align with them,
  not override them
- (mvp) Tracking comment matches format:
  `<!-- scaffold:workflow-audit v1 YYYY-MM-DD -->`

## Methodology Scaling
- **deep**: Full six-phase audit (inventory, completeness check with all
  sub-checklists, consistency check, gap analysis, recommendations,
  execution). Every workflow step verified in every document, including the
  D7 branch/commit sweep, the D4 CI-deferral language sweep, and the
  agent-ops.mk ↔ Key Commands parity check.
- **mvp**: Quick consistency check of commit format, branch naming, the D7
  sweep (no `bd-<id>` conventions anywhere), the D4 sweep (no present-tense
  CI setup language), and PR workflow across CLAUDE.md, AGENTS.md, and
  git-workflow.md. Verify AGENTS.md carries `/work-beads` routing and
  CLAUDE.md carries the error-recovery table. Fix obvious contradictions.
- **custom:depth(1-5)**:
  - Depth 1: AGENTS.md ship-loop summary and CLAUDE.md error-recovery table
    completeness check only.
  - Depth 2: add commit format and branch naming verification (D7 sweep for
    `bd-<id>` conventions).
  - Depth 3: add cross-doc consistency (git-workflow.md, coding-standards.md
    alignment) and the D4 CI-deferral language sweep.
  - Depth 4: add gap analysis (missing steps, stale references,
    agent-ops.mk ↔ Key Commands target parity).
  - Depth 5: full six-phase audit (inventory, completeness, consistency,
    gap analysis, recommendations, execution).

## Mode Detection
Always operates in update mode (all documents exist by this point). Check
for the tracking comment `<!-- scaffold:workflow-audit v1 YYYY-MM-DD -->` to
detect prior audit. If present, focus on changes since that date — new docs
added, existing docs modified, Makefile/agent-ops.mk targets changed. The
canonical ship loop lives in AGENTS.md's Operations core section and
docs/git-workflow.md's 8-step + 5.5 enumeration — other documents align to
those, not vice versa. Preserve any manually-added workflow steps or custom
CI configurations.

## Update Mode Specifics
- **Detect prior artifact**: tracking comment in CLAUDE.md with audit
  version and date
- **Preserve**: custom CI jobs, user-added workflow steps, project-specific
  branch protection rules, custom PR template fields
- **Triggers for update**: CI configuration changed, git-workflow.md
  updated, new scripts added to Makefile, Makefile or agent-ops.mk targets
  added or renamed, new setup prompts modified workflow docs, or any
  document still documents the retired `bd-<id>` branch/commit-prefix
  convention, a present-tense `.github/workflows/` setup claim, or an
  AGENTS.md missing the Operations core section or `/work-beads` routing
- **Conflict resolution**: if two docs disagree on the ship loop, AGENTS.md's
  Operations core section and docs/git-workflow.md's 8-step + 5.5
  enumeration win; update the conflicting doc to match
