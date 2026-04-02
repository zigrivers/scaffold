---
description: "Bump version and update changelog without tagging or releasing"
long-description: "Bump the project version and update the changelog without tagging, pushing, or"
---

## Purpose

Bump the project version and update the changelog without tagging, pushing, or
running the formal release ceremony. A lightweight companion to
`/scaffold:release` for marking development milestones — like completing a set
of user stories or reaching a pre-release checkpoint.

## Inputs

$ARGUMENTS — parsed as:

| Argument | Mode |
|----------|------|
| _(empty)_ | **Auto** — analyze commits, suggest bump |
| `major`, `minor`, or `patch` | **Explicit** — skip analysis, use specified bump |
| `--dry-run` | **Dry Run** — preview only, zero mutations |

Combine flags freely (e.g., `minor --dry-run`).

## Expected Outputs

- Version files updated to new version
- `CHANGELOG.md` updated (or created) with grouped commit entries
- Single commit with message `chore(version): vX.Y.Z`

No tags, no push, no formal release artifacts.

## Instructions

### Phase 0: Project Detection

Gather project context before proceeding.

#### 0.1 Git State

1. Record the current branch name (`git branch --show-current`).
2. Check if the working tree is clean (`git status --porcelain`). If dirty, **warn** (do not block): "Working tree has uncommitted changes. They will not be included in the version bump."
3. Fetch tags: `git fetch --tags`.

#### 0.2 Version File Detection

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

#### 0.3 Project Context

- Check for `.beads/` directory — enables Beads integration in changelog.
- Check for existing `CHANGELOG.md`.
- List existing `v*` tags: `git tag -l 'v*' --sort=-v:refname | head -5`.

#### 0.4 Mode Selection

Parse `$ARGUMENTS` to determine the mode:

| Argument | Mode |
|----------|------|
| _(empty)_ | **Auto** — analyze commits, suggest bump |
| `major`, `minor`, or `patch` | **Explicit** — skip analysis, use specified bump |
| `--dry-run` | **Dry Run** — preview only, zero mutations |

If `--dry-run` is combined with a bump type (e.g., `minor --dry-run`), use both: explicit bump + dry-run mode.

#### 0.5 First-Bump Detection

If **no** version files are found **and** no `v*` tags exist:

1. Detect project type from manifest files (`package.json`, `Cargo.toml`, `pyproject.toml`, etc.).
2. Offer to create the appropriate version file:
   - `package.json` exists but has no `"version"` — add `"version": "0.1.0"` field.
   - Python project — create `version.txt` with `0.1.0`.
   - No manifest — create `version.txt` with `0.1.0`.
3. Ask the user: "No version files found. Create `<file>` with version `0.1.0`?" Confirm before proceeding.

If **no** `v*` tags exist but version files **do** exist, note the current version — commit analysis will use all commits.

---

### Phase 1: Version Analysis

**Skip this phase if:** Explicit mode or first-bump mode (Phase 0.5 just created the version file).

#### 1.1 Collect Commits

Get commits since the last tag (or all commits if no tags):

```
git log <last-tag>..HEAD --oneline --no-merges
```

If no tags exist, use all commits: `git log --oneline --no-merges`.

#### 1.2 Parse Conventional Commits

Categorize each commit:

| Pattern | Bump |
|---------|------|
| `feat:` or `feat(scope):` | minor |
| `fix:` or `fix(scope):` | patch |
| `BREAKING CHANGE:` in body or `!:` suffix | major |
| `perf:`, `refactor:`, `docs:`, `chore:`, `style:`, `test:`, `build:`, `ci:` | patch (non-feature change) |

Apply the **highest-wins** rule.

#### 1.3 Present Analysis

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

### Phase 2: Changelog

**In dry-run mode:** Display the changelog preview but do not write to disk. Skip to Phase 4 (summary).

#### 2.1 Group Commits

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

#### 2.2 Beads Integration (conditional)

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

#### 2.3 Write Changelog

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

### Phase 3: Version Bump & Commit

**In dry-run mode:** Show which files would change and the commit message. Skip to Phase 4.

#### 3.1 Update Version Files

For each version file detected in Phase 0.2, update the version to the new value.

#### 3.2 Sync Lock Files

If applicable:
- `package-lock.json` exists — run `npm install --package-lock-only`
- `Cargo.lock` exists — run `cargo update -w`

#### 3.3 Commit

Stage all changed files and commit:

```
git add <changed-files>
git commit -m "chore(version): vX.Y.Z"
```

If Beads is configured (`.beads/` exists) and a task is active, include the task ID: `[BD-xxx] chore(version): vX.Y.Z`.

---

### Phase 4: Summary

Show the final summary:

```
Version bump complete!

  <current-version> → <new-version>
  Version files updated: <list>
  Changelog: CHANGELOG.md updated

  This was a version bump only — no tags, no push, no formal release artifacts.
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
2. **No tags, no push, no formal release artifacts** — use `/scaffold:release` for the full ceremony.
3. **Dry-run: zero mutations** — no file writes, no git operations.
4. **Beads integration is optional** — silently skip if `.beads/` doesn't exist.
5. **Dirty working tree: warn only** — do not block.
6. **Commit prefix is `chore(version):`** — distinct from release's `chore(release):`.

## After This Step

When this step is complete, tell the user:

---
**Version bump complete** — version files updated, changelog written, commit created.

**Next (if applicable):**
- When ready for a formal release: Run `/scaffold:release current` — Use the version already in files and execute the target project's release ceremony.
- If follow-up tasks are needed: Run `/scaffold:quick-task` — Create a focused task for post-bump work.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---

---

## Domain Knowledge

### version-strategy

*Version file management across language ecosystems*

# Version Strategy

Expert knowledge for detecting, updating, and synchronizing version files across language ecosystems. Covers lock file management, first-version bootstrap, mismatch detection, and dry-run workflows.

## Summary

### Version File Detection

Scan the project root for known version files: `package.json`, `pyproject.toml`, `Cargo.toml`, `.claude-plugin/plugin.json`, `pubspec.yaml`, `setup.cfg`, `version.txt`.

### Lock File Sync

After updating a version file, regenerate the associated lock file to keep them in sync. Each ecosystem has its own lock file update command.

### First-Version Bootstrap

If no version file exists, offer to create one. Suggest `0.1.0` for new projects, `1.0.0` for stable projects with existing users.

## Deep Guidance

### Detection — Extended

**Scan order and priority:**

1. `package.json` — Node.js/npm ecosystem
2. `pyproject.toml` — Modern Python projects (PEP 621)
3. `Cargo.toml` — Rust projects
4. `.claude-plugin/plugin.json` — Claude Code plugins
5. `pubspec.yaml` — Flutter/Dart projects
6. `setup.cfg` — Legacy Python projects
7. `version.txt` — Generic fallback

**Detection logic:**

```bash
# Find all version files in the project root
for f in package.json pyproject.toml Cargo.toml .claude-plugin/plugin.json pubspec.yaml setup.cfg version.txt; do
  [ -f "$f" ] && echo "Found: $f"
done
```

A project may have multiple version files (e.g., a Claude Code plugin with both `package.json` and `.claude-plugin/plugin.json`). All detected files must be updated together.

### Update Patterns Per Ecosystem

#### Node.js (package.json)

**Version field:** `"version": "1.2.3"` at the top level of the JSON object.

**Update procedure:**
1. Edit `package.json` to set the new version
2. Regenerate the lock file: `npm install --package-lock-only`
3. If `yarn.lock` exists instead: `yarn install --mode update-lockfile`
4. Commit both `package.json` and the lock file together

**Caveat:** `npm version` exists but modifies files and creates git tags automatically — prefer manual editing for more control.

#### Rust (Cargo.toml)

**Version field:** `version = "1.2.3"` under `[package]`.

**Update procedure:**
1. Edit `Cargo.toml` to set the new version
2. Update the lock file: `cargo update -w` (workspace only, avoids updating all dependencies)
3. Commit both `Cargo.toml` and `Cargo.lock` together

#### Python — pyproject.toml

**Version field:** `version = "1.2.3"` under `[project]`.

**Update procedure:**
1. Edit `pyproject.toml` directly
2. No separate lock file regeneration needed (unless using `poetry` or `pip-tools`)
3. If using Poetry: `poetry lock --no-update` after version change
4. If using pip-tools: `pip-compile` to regenerate `requirements.txt`

#### Python — setup.cfg (Legacy)

**Version field:** `version = 1.2.3` under `[metadata]`.

**Update procedure:**
1. Edit `setup.cfg` directly
2. No lock file regeneration needed

#### Flutter / Dart (pubspec.yaml)

**Version field:** `version: 1.2.3+4` (the `+4` is the build number).

**Update procedure:**
1. Edit `pubspec.yaml` to set the new version
2. Run `flutter pub get` to update `pubspec.lock`
3. Commit both files together

#### Claude Code Plugin (plugin.json)

**Version field:** `"version": "1.2.3"` in `.claude-plugin/plugin.json`.

**Update procedure:**
1. Edit `.claude-plugin/plugin.json` to set the new version
2. No lock file needed
3. Commit the file

#### Generic (version.txt)

**Format:** The entire file content is the version string, e.g., `1.2.3\n`.

**Update procedure:**
1. Write the new version to the file: `echo "1.2.3" > version.txt`
2. Commit the file

### First-Version Bootstrap

When no version file is detected and a release is requested:

1. Ask which ecosystem the project targets (or infer from existing files like `src/`, `lib/`, `Cargo.toml`, etc.)
2. Create the appropriate version file
3. Set the initial version:
   - `0.1.0` for new projects under active development
   - `1.0.0` for projects with existing users or stable APIs
4. Commit the new version file with message: `chore: bootstrap version file at <version>`

**Why 0.1.0 vs 1.0.0:**
- `0.x.y` signals "initial development, expect breaking changes"
- `1.0.0` signals "stable public API, semver guarantees apply"
- Most projects should start at `0.1.0` and reach `1.0.0` when the API stabilizes

### Version Mismatch Detection

Before bumping, check for mismatches between the version in files and the latest git tag:

```bash
# Get version from package.json (example)
FILE_VERSION=$(jq -r '.version' package.json)

# Get latest git tag version
TAG_VERSION=$(git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//')

# Compare
if [ "$FILE_VERSION" != "$TAG_VERSION" ]; then
  echo "Mismatch: file says $FILE_VERSION, last tag says $TAG_VERSION"
fi
```

**When a mismatch is found:**

| Scenario | Action |
|----------|--------|
| File version > tag version | Ask: "Release as $FILE_VERSION, or bump further?" |
| File version < tag version | Warning: files are behind the last release — update files first |
| File version = tag version | Normal case — bump from this version |
| No tag exists | First release — use file version as-is or suggest a version |

### Dry-Run Mode

Preview all version mutations without writing to disk:

```
[DRY RUN] Would update package.json: 1.1.0 → 1.2.0
[DRY RUN] Would update .claude-plugin/plugin.json: 1.1.0 → 1.2.0
[DRY RUN] Would regenerate package-lock.json
[DRY RUN] Would create git tag: v1.2.0
[DRY RUN] Would update CHANGELOG.md with new section
```

Dry-run mode is useful for:
- Verifying the correct version bump before committing
- Reviewing which files would change
- Testing the release process in CI without side effects

### Multiple Version Files — Synchronization

When a project has multiple version files, all must show the same version at all times.

**Rules:**
- Update all detected version files in the same commit
- Regenerate all associated lock files in the same commit
- Verify consistency after updating: read back each file and confirm they match
- If a version file was missed, the pre-commit hook or CI should catch the mismatch

**Example commit for a multi-file project:**

```
release: v1.2.0

Updated version in:
- package.json (1.1.0 → 1.2.0)
- .claude-plugin/plugin.json (1.1.0 → 1.2.0)
- package-lock.json (regenerated)
```

## See Also

- [release-management](./release-management.md) — Semantic versioning rules, changelog format, quality gates
- [git-workflow-patterns](../core/git-workflow-patterns.md) — Tagging and release workflow
