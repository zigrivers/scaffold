---
description: "Create a versioned release with changelog and GitHub release"
long-description: "Analyzes conventional commits to suggest version bumps, generates changelogs from commit history and Beads tasks, runs quality gates, and publishes a GitHub release. Supports dry-run mode and rollback."
argument-hint: "<version or --dry-run or rollback>"
---

Create a versioned release with changelog and GitHub release. Analyzes conventional commits to suggest version bumps, generates changelogs from commit history and Beads tasks, runs quality gates, and publishes a GitHub release. Supports dry-run mode and rollback.

## The Request

$ARGUMENTS

---

## Phase 0: Project Detection

Gather project context before proceeding. Check each item and record findings:

### 0.1 Git State

1. Confirm the working tree is clean (`git status --porcelain`). If there are uncommitted changes, **stop** and tell the user: "Working tree has uncommitted changes. Commit or stash them before releasing."
2. Record the current branch name (`git branch --show-current`).
3. Check if `gh` CLI is available (`which gh`). If not available, warn: "GitHub CLI (`gh`) not found. Will create tag only — no GitHub release. Install with `brew install gh` for full functionality."
4. Fetch tags: `git fetch --tags`.

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

If **no** version files are found, note this — a tag-only release will be created.

### 0.3 Project Context

- Check for `.beads/` directory → enables Beads integration in release notes.
- Check for existing `CHANGELOG.md`.
- List existing `v*` tags: `git tag -l 'v*' --sort=-v:refname | head -5`.

### 0.4 Mode Selection

Parse `$ARGUMENTS` to determine the mode:

| Argument | Mode |
|----------|------|
| _(empty)_ | **Standard** — auto-suggest bump, confirm, execute |
| `major`, `minor`, or `patch` | **Explicit** — use specified bump, skip suggestion |
| `current` | **Current** — tag and release the version already in files, no bump |
| `--dry-run` | **Dry Run** — all analysis, zero mutations |
| `rollback` | **Rollback** — jump directly to the Rollback section |

If `--dry-run` is combined with a bump type (e.g., `minor --dry-run`), use both: explicit bump + dry-run mode.

If the mode is **Rollback**, skip to the **Rollback** section below.

### 0.5 First-Release Detection

If **no** `v*` tags exist:

1. Tell the user: "No previous releases found. This will be your first release."
2. Ask: "What should the initial version be?" Suggest `0.1.0` (pre-release) or `1.0.0` (stable).
3. Record the chosen version. Skip Phase 1 (version analysis) — go directly to Phase 2.

### 0.6 Version Mismatch Detection

**Skip if:** First-release mode (Phase 0.5) or `current` mode.

If `current` mode was specified: use the version from files as the release version, skip Phase 1 and Phase 4 (version bump) — proceed directly to Phase 2 (quality gates).

Otherwise, compare the version in files against the last tag:

- If the version in files **is greater than** the version from the last tag (e.g., files say `0.2.0`, last tag is `v0.1.0`):
  1. Ask: "Version files show `<file-version>` but the last tag is `<last-tag>`. It looks like the version was already bumped (perhaps via `/scaffold:version-bump`). Release `<file-version>` as-is, or analyze commits for a further bump?"
  2. **"Release as-is"**: Use `<file-version>` as the release version. Skip Phase 1 and Phase 4 — proceed to Phase 2.
  3. **"Bump further"**: Proceed normally through Phase 1, bumping from the current file version.

- If the versions match or files are less than/equal to the last tag: proceed normally.

---

## Phase 1: Version Analysis

**Skip this phase if:** First-release mode (Phase 0.5) or Explicit mode.

### 1.1 Collect Commits

Get commits since the last tag:

```
git log <last-tag>..HEAD --oneline --no-merges
```

### 1.2 Parse Conventional Commits

Categorize each commit:

| Pattern | Bump |
|---------|------|
| `feat:` or `feat(scope):` | minor |
| `fix:` or `fix(scope):` | patch |
| `BREAKING CHANGE:` in body or `!:` suffix | major |
| `perf:`, `refactor:`, `docs:`, `chore:`, `style:`, `test:`, `build:`, `ci:` | patch (non-feature change) |

Apply the **highest-wins** rule: if any commit triggers major, the suggestion is major; otherwise if any triggers minor, the suggestion is minor; otherwise patch.

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

## Phase 2: Pre-Release Validation

### 2.1 Detect Quality Gates

Look for quality gate commands in this order (use the first match):

1. `Makefile` with `check` target → `make check`
2. `Makefile` with `test` target → `make test`
3. `package.json` with `test` script → `npm test`
4. `Cargo.toml` exists → `cargo test`
5. `pyproject.toml` or `setup.cfg` → `pytest`
6. None found → warn and skip

### 2.2 Run Quality Gates

**In dry-run mode:** Show which command would run but do not execute. Skip to Phase 3.

Run the detected quality gate command. Report the result.

- **If it passes:** "Quality gates passed. Proceeding."
- **If it fails:** "Quality gates failed. Fix the issues and re-run `/scaffold:release`. To force release despite failures, re-run with the `--force` flag." **Stop here** unless `--force` was passed.

---

## Phase 3: Changelog & Release Notes

### 3.1 Group Commits

Group commits since the last tag (or all commits for first release) by type:

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

### 3.2 Beads Integration (conditional)

If `.beads/` exists:

1. Run `bd list --status closed` (or parse `.beads/issues.jsonl` for closed issues).
2. Cross-reference closed tasks with the commit range (match task IDs like `BD-xxx` or `scaffold-xxx` in commit messages).
3. If matches found, append a section:

```markdown
### Completed Tasks
- [BD-xxx] Task title
- [BD-yyy] Task title
```

If `.beads/` does not exist or no tasks match, silently skip this section.

### 3.3 Write Changelog

**In dry-run mode:** Display the changelog preview but do not write to disk. Skip to Phase 6.

- If `CHANGELOG.md` exists: prepend the new entry after the `# Changelog` heading (or after any header block).
- If `CHANGELOG.md` does not exist: create it with:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [vX.Y.Z] - YYYY-MM-DD
...
```

### 3.4 Save Release Notes

Store the generated changelog entry (without the file header) for use as the GitHub release body in Phase 5.

---

## Phase 4: Version Bump & Commit

**In dry-run mode:** Show which files would change and the commit message. Skip to Phase 6.

### 4.1 Update Version Files

For each version file detected in Phase 0.2, update the version to the new value.

### 4.2 Sync Lock Files

If applicable:
- `package-lock.json` exists → run `npm install --package-lock-only`
- `Cargo.lock` exists → run `cargo update -w`

### 4.3 Commit

Stage all changed files and commit:

```
git add <changed-files>
git commit -m "chore(release): vX.Y.Z"
```

If a Beads task is active (e.g., the user created one for the release), include the task ID: `[BD-xxx] chore(release): vX.Y.Z`.

---

## Phase 5: Tag & Publish

**In dry-run mode:** Show what would happen. Skip to Phase 6.

### 5.1 Determine Flow

Check the current branch:

- **`main` or `master`**: Direct flow (tag → push → release).
- **Any other branch**: PR flow (push → create PR → instructions).

### 5.2 Direct Flow (main/master)

1. Create annotated tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
2. Push commit and tag: `git push origin HEAD --follow-tags`
3. If push fails (e.g., branch protection), fall back to PR flow (5.3).
4. If `gh` is available: create GitHub release:
   ```
   gh release create vX.Y.Z --title "vX.Y.Z" --notes "<release-notes-from-3.4>"
   ```

### 5.3 PR Flow (feature branch)

1. Push branch: `git push -u origin HEAD`
2. If `gh` is available: create PR:
   ```
   gh pr create --title "chore(release): vX.Y.Z" --body "<release-notes-from-3.4>"
   ```
3. Tell the user: "Release PR created. After merging to main, run these commands to create the tag and GitHub release:"
   ```
   git checkout main && git pull
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file CHANGELOG.md
   ```

---

## Phase 6: Post-Release Summary

Show the final summary:

```
Release vX.Y.Z complete!

  Version files updated: <list>
  Changelog: CHANGELOG.md updated
  Tag: vX.Y.Z created
  GitHub Release: <URL> (or "PR created: <URL>")

  To undo this release: /scaffold:release rollback
```

In dry-run mode:

```
Dry-run complete — no changes were made.

  Would bump: <current> → <new>
  Would update: <version-files>
  Would create: CHANGELOG.md entry
  Would tag: vX.Y.Z
  Would create: GitHub release

Run /scaffold:release to execute.
```

---

## Rollback

Undo the most recent release. This is a **destructive operation** with safety guards.

### R.1 Identify Latest Release

1. Find the most recent tag: `git tag -l 'v*' --sort=-v:refname | head -1`
2. If no tags exist: "No releases found. Nothing to roll back." **Stop.**

### R.2 Safety Confirmation

Tell the user: "To confirm rollback of `<tag>`, type the exact tag name (e.g., `v1.3.0`):"

- If the user types the correct tag name → proceed.
- If the user types anything else → "Tag name does not match. Rollback cancelled." **Stop.**

### R.3 Execute Rollback

Perform each step. If any step fails, continue with remaining steps and report all results at the end.

1. **Delete GitHub release** (if `gh` is available):
   ```
   gh release delete <tag> --yes
   ```

2. **Delete remote tag:**
   ```
   git push origin :refs/tags/<tag>
   ```

3. **Delete local tag:**
   ```
   git tag -d <tag>
   ```

4. **Revert version bump commit** (if the most recent commit message matches `chore(release): <tag>`):
   ```
   git revert HEAD --no-edit
   git push origin HEAD
   ```

### R.4 Report Results

Show what succeeded and what failed:

```
Rollback of <tag>:
  GitHub release: deleted ✓ (or failed: <error>)
  Remote tag: deleted ✓
  Local tag: deleted ✓
  Version bump commit: reverted ✓

Rollback complete.
```

If any step failed, include manual cleanup instructions for that step.

---

## Process Rules

1. **Never skip quality gates** without explicit user `--force`.
2. **Dry-run: zero mutations** — no file writes, no git operations, no GitHub API calls.
3. **Beads integration is optional** — silently skip if `.beads/` doesn't exist.
4. **Tag format is always `vX.Y.Z`** — no other formats.
5. **Every confirmation must be explicit** — don't assume "yes" from silence.
6. **Rollback requires exact tag name** — not just "yes" or "confirm".

## After This Step

When this step is complete, tell the user:

---
**Release complete** — version bumped, changelog updated, tag created, GitHub release published.

**Next (if applicable):**
- If follow-up tasks are needed: Run `/scaffold:quick-task` — Create a focused task for post-release work.
- If the release needs undoing: Run `/scaffold:release rollback` — Undo the most recent release.
- For development milestone checkpoints without releasing: Run `/scaffold:version-bump` — Bump version and changelog only.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
