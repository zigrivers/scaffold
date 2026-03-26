---
name: workflow-audit
description: Verify workflow consistency across all documentation files
phase: "consolidation"
order: 71
dependencies: [claude-md-optimization]
outputs: [CLAUDE.md, docs/git-workflow.md]
conditional: null
knowledge-base: [cross-phase-consistency]
---

## Purpose
Cross-reference all documentation to ensure the canonical feature workflow is
consistently documented. Check every document that touches workflow (CLAUDE.md,
git-workflow.md, coding-standards.md, dev-setup.md, Makefile/package.json) for
contradictions, stale references, missing steps, and inconsistent command formats.
Fix all issues found.

## Inputs
- CLAUDE.md (required) — primary workflow document to audit
- docs/git-workflow.md (required) — git workflow to verify alignment
- docs/coding-standards.md (required) — commit format to verify
- docs/dev-setup.md (required) — commands to verify match Key Commands
- Makefile or package.json (required) — actual commands to match against
- .github/ (optional) — PR templates and CI workflows to verify
- tasks/lessons.md (optional) — verify it exists and is referenced

## Expected Outputs
- CLAUDE.md — corrected workflow section with all 9 steps + step 4.5
- docs/git-workflow.md — any contradictions fixed
- docs/coding-standards.md — commit format aligned
- Makefile/package.json — missing targets added (if needed)
- tasks/lessons.md — created if missing

## Quality Criteria
- CLAUDE.md contains complete workflow (9 steps + AI review step 4.5)
- Commit format [BD-<id>] type(scope): description is consistent everywhere
- Branch naming bd-<task-id>/<short-desc> from origin/main is consistent everywhere
- PR workflow includes all 8 sub-steps with --delete-branch flag
- Task closure uses bd close (not bd update --status completed)
- Key Commands table matches actual Makefile/package.json commands
- Worktree cleanup between tasks documented (cannot checkout main)
- Agent crash recovery documented
- No document contradicts the canonical workflow
- Tracking comment added: <!-- scaffold:workflow-audit v1 YYYY-MM-DD -->

## Methodology Scaling
- **deep**: Full six-phase audit (inventory, completeness check with all
  sub-checklists, consistency check, gap analysis, recommendations, execution).
  Every workflow step verified in every document.
- **mvp**: Quick consistency check of commit format, branch naming, and PR
  workflow across CLAUDE.md and git-workflow.md. Fix obvious contradictions.
- **custom:depth(1-5)**: Depth 1-2: CLAUDE.md workflow check only. Depth 3: add
  cross-doc consistency. Depth 4: add gap analysis. Depth 5: full six-phase audit.

## Mode Detection
Always operates in update mode (all documents exist by this point). The canonical
workflow is the source of truth — documents align to it, not vice versa.
