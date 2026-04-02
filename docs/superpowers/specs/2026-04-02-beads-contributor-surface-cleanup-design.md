# Design: Beads Contributor-Surface Cleanup

**Date:** 2026-04-02
**Status:** Approved

## Problem

Scaffold still supports Beads as an optional feature for downstream user
projects, but this repository also contains contributor-facing guidance that
implies the Scaffold project itself is managed with Beads. That ambiguity causes
AI agents working on Scaffold bugs and features to infer the wrong maintainer
workflow and reach for `bd`, `.beads/`, and Beads-specific commit/task
conventions that are not actually used to develop Scaffold.

The cleanup target is not "remove Beads from Scaffold." The target is "remove
repo-local cues that make agents think Scaffold itself uses Beads, while keeping
Beads available as a user-facing Scaffold capability."

## Goal

Make the active contributor workflow for the Scaffold repository unambiguous:

- AI agents must not infer that working on Scaffold requires `bd`, `.beads/`,
  Beads task IDs, or Beads-specific maintainer conventions.
- Users must still be able to use the `beads` step and related Beads-aware
  prompts in their own projects.
- Active docs may still mention Beads when they are describing Scaffold's
  product behavior for user projects, but not when they are describing how to
  maintain Scaffold itself.

## Approach: Contributor/Product Boundary Cleanup

Keep Beads where it is part of Scaffold's product surface. Remove Beads where it
describes the workflow for developing Scaffold itself. Add one short
disambiguation line in active docs where agents could reasonably confuse product
capability with repo-maintainer workflow.

Recommended distinction:

> Beads is an optional workflow Scaffold can generate for user projects; it is
> not the task-tracking workflow used to develop Scaffold itself.

## Design

### 1. Preserve User-Facing Beads Support

Do not remove or retire Beads as a Scaffold feature.

Keep Beads references in active product files when they describe:

- the `beads` pipeline step
- methodology entries that enable or disable the `beads` step
- prompts that help Scaffold users initialize or work with Beads in their own
  repositories
- knowledge entries that instruct downstream project agents how to adapt when a
  generated project uses Beads
- tests that verify current Beads-aware product behavior

This means `scaffold run beads` remains a supported command surface after the
cleanup.

### 2. Remove Repo-Local Beads Workflow Guidance

Contributor-facing files must stop telling agents that Scaffold itself uses
Beads.

#### 2a. Primary agent entrypoints

These files must be scrubbed first because they are the highest-leverage source
of agent confusion:

- `AGENTS.md`
- `CLAUDE.md`

Required outcome:

- no instruction to run `bd onboard`, `bd ready`, `bd sync`, or other `bd`
  commands for Scaffold development
- no statement that Scaffold uses Beads for issue tracking
- no requirement to use Beads task IDs or Beads-specific branch naming when
  changing this repository

Replace those instructions with the actual current maintainer workflow for this
repo: git state, tests/quality gates, commits, PRs, push, and documented
handoff expectations.

#### 2b. Repo-maintainer operational docs

Current maintainer docs should stop describing Beads as the way Scaffold itself
is operated.

Examples of active maintainer-oriented surfaces that should be cleaned up:

- current release and versioning docs
- operations/runbook docs
- security practices when they prescribe Beads follow-up work for Scaffold
- any contributor workflow reference that tells the maintainer to use
  `.beads/`, `bd`, `BD_ACTOR`, or `[BD-*]`

The implementation should rewrite those passages to use tracker-neutral language
or the actual current maintainer workflow.

### 3. Add Explicit Disambiguation Where Needed

Some active product/reference docs can legitimately mention Beads and also be
read by contributors or agents. In those files, add a brief clarification when
the surrounding text could blur product behavior and repo workflow.

Use this pattern:

- Beads is an optional feature Scaffold can generate for user projects.
- Scaffold itself is not developed with a Beads-based maintainer workflow.

This clarification should be used sparingly. It is a disambiguation aid, not a
new repeated boilerplate block for every Beads mention.

### 4. Exclusions

The cleanup is intentionally scoped. Do not treat the following as required
removals:

- the `beads` step itself
- product prompts that support Beads in downstream projects
- methodology defaults that refer to the `beads` step
- tests whose purpose is to validate Beads support for users
- historical material such as `CHANGELOG.md`
- archived documentation under `docs/v2/archive/**`

Also, do not use a naive "zero Beads strings in active files" rule. Some active
files should continue to mention Beads because Scaffold still ships that
capability.

### 5. Verification Standard

Verification should answer a semantic question:

> After the cleanup, can an AI agent still reasonably conclude that developing
> the Scaffold repository requires Beads?

The expected answer is no.

Practical verification rules:

- repo-wide searches may still show Beads references in product surfaces and
  historical material
- contributor-facing files must no longer instruct agents to use Beads for
  Scaffold development
- active maintainer docs must not prescribe `bd`, `.beads/`, `BD_ACTOR`, or
  `[BD-*]` as part of the Scaffold repo workflow
- if an active product doc still mentions Beads and could be misread as repo
  workflow, it should include the short disambiguation

## Out of Scope

- Removing Beads as a Scaffold feature
- Renaming or deleting the `beads` pipeline step
- Reworking downstream project prompts to be tracker-neutral everywhere
- Purging Beads from historical changelog or archive material
- Introducing a new task-tracking system for Scaffold

## Files Expected To Change

| File Group | Expected Change |
|-----------|-----------------|
| `AGENTS.md`, `CLAUDE.md` | Remove Beads-based repo workflow instructions; replace with actual Scaffold maintainer guidance |
| Current maintainer docs (`docs/v2/operations-runbook.md`, `docs/v2/security-practices.md`, release/version docs, similar) | Rewrite repo-local Beads assumptions; keep product references only where relevant |
| Selected product/reference docs | Add short contributor-vs-product disambiguation where ambiguity is likely |
| Product prompts, methodology files, and Beads feature tests | Preserve unless a specific line is incorrectly describing Scaffold's own maintainer workflow |
