---
description: "Bump version and update changelog without tagging or releasing"
long-description: "Lightweight version checkpoint for development milestones. Detects version files, optionally analyzes conventional commits to suggest a bump level, updates version numbers and CHANGELOG.md, and commits. No tags, no push, no GitHub release — use /scaffold:release for formal releases."
argument-hint: "<major|minor|patch or --dry-run>"
---

Bump the project version and update the changelog without tagging, pushing, or creating a GitHub release. A lightweight companion to `/scaffold:release` for marking development milestones — like completing a set of user stories or reaching a pre-release checkpoint.

## The Request

$ARGUMENTS

---

## Phase 0: Project Detection

Gather project context before proceeding.

### 0.1 Git State

1. Record the current branch name (`git branch --show-current`).
2. Check if the working tree is clean (`git status --porcelain`). If dirty, **warn** (do not block): "Working tree has uncommitted changes. They will not be included in the version bump."
3. Fetch tags: `git fetch --tags`.

### 0.2 Version File Detection

Scan the project root for version files. For each found file, record the current version:

| File | How to Read Version |
|------|-------------------|
| `package.json` | `.version` field |
| `pyproject.toml` | `[project].version` or `[tool.poetry].version` |
| `Cargo.toml` | `[package].version` |
| `.claude-plugin/plugin.json` | `.version` field |
| `pubspec.yaml` | `version:` field |
| `setup.cfg` | `[metadata].version` |
| `version.txt` | Entire file contents (trimmed) |

### 0.3 Project Context

- Check for `.beads/` directory → enables Beads integration in changelog.
- Check for existing `CHANGELOG.md`.
- List existing `v*` tags: `git tag -l 'v*' --sort=-v:refname | head -5`.

### 0.4 Mode Selection

Parse `$ARGUMENTS` to determine the mode:

| Argument | Mode |
|----------|------|
| _(empty)_ | **Auto** — analyze commits, suggest bump |
| `major`, `minor`, or `patch` | **Explicit** — skip analysis, use specified bump |
| `--dry-run` | **Dry Run** — preview only, zero mutations |

If `--dry-run` is combined with a bump type (e.g., `minor --dry-run`), use both: explicit bump + dry-run mode.

### 0.5 First-Bump Detection

If **no** version files are found **and** no `v*` tags exist:

1. Detect project type from manifest files (`package.json`, `Cargo.toml`, `pyproject.toml`, etc.).
2. Offer to create the appropriate version file:
   - `package.json` exists but has no `"version"` → add `"version": "0.1.0"` field.
   - Python project → create `version.txt` with `0.1.0`.
   - No manifest → create `version.txt` with `0.1.0`.
3. Ask the user: "No version files found. Create `<file>` with version `0.1.0`?" Confirm before proceeding.

If **no** `v*` tags exist but version files **do** exist, note the current version — commit analysis will use all commits.

---

## Phase 1: Version Analysis

**Skip this phase if:** Explicit mode or first-bump mode (Phase 0.5 just created the version file).

### 1.1 Collect Commits

Get commits since the last tag (or all commits if no tags):

```
git log <last-tag>..HEAD --oneline --no-merges
```

If no tags exist, use all commits: `git log --oneline --no-merges`.

### 1.2 Parse Conventional Commits

Categorize each commit:

| Pattern | Bump |
|---------|------|
| `feat:` or `feat(scope):` | minor |
| `fix:` or `fix(scope):` | patch |
| `BREAKING CHANGE:` in body or `!:` suffix | major |
| `perf:`, `refactor:`, `docs:`, `chore:`, `style:`, `test:`, `build:`, `ci:` | patch (non-feature change) |

Apply the **highest-wins** rule.

### 1.3 Present Analysis

Show the user:

```
Commits since <last-tag>: <count>
  feat:  <count> commits
  fix:   <count> commits
  other: <count> commits
  BREAKING: <yes/no>

Suggested bump: <major|minor|patch>
  <current-version> → <new-version>
```

Ask: "Confirm this bump, or override? (major / minor / patch / confirm)"

If **no conventional commits** were found, fall back: "No conventional commits found. What type of bump? (major / minor / patch)"

Record the confirmed version.

---

## Phase 2: Changelog

**In dry-run mode:** Display the changelog preview but do not write to disk. Skip to Phase 4 (summary).

### 2.1 Group Commits

Group commits since the last tag (or all commits for first bump) by type:

```markdown
## [vX.Y.Z] - YYYY-MM-DD

### Added
- feat: description (commit-hash)

### Fixed
- fix: description (commit-hash)

### Changed
- refactor: description (commit-hash)
- perf: description (commit-hash)

### Other
- chore: description (commit-hash)
```

Omit empty sections. Use the commit's first line (without the type prefix) as the description.

### 2.2 Beads Integration (conditional)

If `.beads/` exists:

1. Run `bd list --status closed` (or parse `.beads/issues.jsonl` for closed issues).
2. Cross-reference closed tasks with the commit range (match task IDs like `BD-xxx` or `scaffold-xxx` in commit messages).
3. If matches found, append a section:

```markdown
### Completed Tasks
- [BD-xxx] Task title
- [BD-yyy] Task title
```

If `.beads/` does not exist or no tasks match, silently skip.

### 2.3 Write Changelog

- If `CHANGELOG.md` exists: prepend the new entry after the `# Changelog` heading (or after any header block).
- If `CHANGELOG.md` does not exist: create it with:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [vX.Y.Z] - YYYY-MM-DD
...
```

---

## Phase 3: Version Bump & Commit

**In dry-run mode:** Show which files would change and the commit message. Skip to Phase 4.

### 3.1 Update Version Files

For each version file detected in Phase 0.2, update the version to the new value.

### 3.2 Sync Lock Files

If applicable:
- `package-lock.json` exists → run `npm install --package-lock-only`
- `Cargo.lock` exists → run `cargo update -w`

### 3.3 Commit

Stage all changed files and commit:

```
git add <changed-files>
git commit -m "chore(version): vX.Y.Z"
```

If a Beads task is active, include the task ID: `[BD-xxx] chore(version): vX.Y.Z`.

---

## Phase 4: Summary

Show the final summary:

```
Version bump complete!

  <current-version> → <new-version>
  Version files updated: <list>
  Changelog: CHANGELOG.md updated

  This was a version bump only — no tags, no push, no GitHub release.
  When ready for a formal release: /scaffold:release current
```

In dry-run mode:

```
Dry-run complete — no changes were made.

  Would bump: <current> → <new>
  Would update: <version-files>
  Would create/update: CHANGELOG.md entry

Run /scaffold:version-bump to execute.
```

---

## Process Rules

1. **No quality gates** — this is a lightweight milestone marker.
2. **No tags, no push, no GitHub release** — use `/scaffold:release` for the full ceremony.
3. **Dry-run: zero mutations** — no file writes, no git operations.
4. **Beads integration is optional** — silently skip if `.beads/` doesn't exist.
5. **Dirty working tree: warn only** — do not block.
6. **Commit prefix is `chore(version):`** — distinct from release's `chore(release):`.

## After This Step

When this step is complete, tell the user:

---
**Version bump complete** — version files updated, changelog written, commit created.

**Next (if applicable):**
- When ready for a formal release: Run `/scaffold:release current` — Tag, publish, and create a GitHub release for the version already in files.
- If follow-up tasks are needed: Run `/scaffold:quick-task` — Create a focused task for post-bump work.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
