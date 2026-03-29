---
description: "Create a versioned release with changelog and GitHub release"
long-description: "Create a versioned release with changelog and GitHub release. Analyzes"
---

## Purpose

Create a versioned release with changelog and GitHub release. Analyzes
conventional commits to suggest version bumps, generates changelogs from commit
history and Beads tasks, runs quality gates, and publishes a GitHub release.
Supports dry-run mode and rollback.

## Inputs

$ARGUMENTS — parsed as:

| Argument | Mode |
|----------|------|
| _(empty)_ | **Standard** — auto-suggest bump, confirm, execute |
| `major`, `minor`, or `patch` | **Explicit** — use specified bump, skip suggestion |
| `current` | **Current** — tag and release the version already in files, no bump |
| `--dry-run` | **Dry Run** — all analysis, zero mutations |
| `rollback` | **Rollback** — jump directly to the Rollback section |

Combine flags freely (e.g., `minor --dry-run`).

## Expected Outputs

- Version files updated to new version
- `CHANGELOG.md` updated with grouped commit entries
- Annotated git tag `vX.Y.Z`
- GitHub release (if `gh` CLI is available)
- Single commit with message `chore(release): vX.Y.Z`

## Instructions

### Phase 0: Project Detection

Gather project context before proceeding. Check each item and record findings:

#### 0.1 Git State

1. Confirm the working tree is clean (`git status --porcelain`). If there are uncommitted changes, **stop** and tell the user: "Working tree has uncommitted changes. Commit or stash them before releasing."
2. Record the current branch name (`git branch --show-current`).
3. Check if `gh` CLI is available (`which gh`). If not available, warn: "GitHub CLI (`gh`) not found. Will create tag only — no GitHub release. Install with `brew install gh` for full functionality."
4. Fetch tags: `git fetch --tags`.

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

If **no** version files are found, note this — a tag-only release will be created.

#### 0.3 Project Context

- Check for `.beads/` directory — enables Beads integration in release notes.
- Check for existing `CHANGELOG.md`.
- List existing `v*` tags: `git tag -l 'v*' --sort=-v:refname | head -5`.

#### 0.4 Mode Selection

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

#### 0.5 First-Release Detection

If **no** `v*` tags exist:

1. Tell the user: "No previous releases found. This will be your first release."
2. Ask: "What should the initial version be?" Suggest `0.1.0` (pre-release) or `1.0.0` (stable).
3. Record the chosen version. Skip Phase 1 (version analysis) — go directly to Phase 2.

#### 0.6 Version Mismatch Detection

**Skip if:** First-release mode (Phase 0.5) or `current` mode.

If `current` mode was specified: use the version from files as the release version, skip Phase 1 and Phase 4 (version bump) — proceed directly to Phase 2 (quality gates).

Otherwise, compare the version in files against the last tag:

- If the version in files **is greater than** the version from the last tag (e.g., files say `0.2.0`, last tag is `v0.1.0`):
  1. Ask: "Version files show `<file-version>` but the last tag is `<last-tag>`. It looks like the version was already bumped (perhaps via `/scaffold:version-bump`). Release `<file-version>` as-is, or analyze commits for a further bump?"
  2. **"Release as-is"**: Use `<file-version>` as the release version. Skip Phase 1 and Phase 4 — proceed to Phase 2.
  3. **"Bump further"**: Proceed normally through Phase 1, bumping from the current file version.

- If the versions match or files are less than/equal to the last tag: proceed normally.

---

### Phase 1: Version Analysis

**Skip this phase if:** First-release mode (Phase 0.5) or Explicit mode.

#### 1.1 Collect Commits

Get commits since the last tag:

```
git log <last-tag>..HEAD --oneline --no-merges
```

#### 1.2 Parse Conventional Commits

Categorize each commit:

| Pattern | Bump |
|---------|------|
| `feat:` or `feat(scope):` | minor |
| `fix:` or `fix(scope):` | patch |
| `BREAKING CHANGE:` in body or `!:` suffix | major |
| `perf:`, `refactor:`, `docs:`, `chore:`, `style:`, `test:`, `build:`, `ci:` | patch (non-feature change) |

Apply the **highest-wins** rule: if any commit triggers major, the suggestion is major; otherwise if any triggers minor, the suggestion is minor; otherwise patch.

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

### Phase 2: Pre-Release Validation

#### 2.1 Detect Quality Gates

Look for quality gate commands in this order (use the first match):

1. `Makefile` with `check` target — `make check`
2. `Makefile` with `test` target — `make test`
3. `package.json` with `test` script — `npm test`
4. `Cargo.toml` exists — `cargo test`
5. `pyproject.toml` or `setup.cfg` — `pytest`
6. None found — warn and skip

#### 2.2 Run Quality Gates

**In dry-run mode:** Show which command would run but do not execute. Skip to Phase 3.

Run the detected quality gate command. Report the result.

- **If it passes:** "Quality gates passed. Proceeding."
- **If it fails:** "Quality gates failed. Fix the issues and re-run `/scaffold:release`. To force release despite failures, re-run with the `--force` flag." **Stop here** unless `--force` was passed.

---

### Phase 3: Changelog & Release Notes

#### 3.1 Group Commits

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

#### 3.2 Beads Integration (conditional)

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

#### 3.3 Write Changelog

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

#### 3.4 Save Release Notes

Store the generated changelog entry (without the file header) for use as the GitHub release body in Phase 5.

---

### Phase 4: Version Bump & Commit

**In dry-run mode:** Show which files would change and the commit message. Skip to Phase 6.

#### 4.1 Update Version Files

For each version file detected in Phase 0.2, update the version to the new value.

#### 4.2 Sync Lock Files

If applicable:
- `package-lock.json` exists — run `npm install --package-lock-only`
- `Cargo.lock` exists — run `cargo update -w`

#### 4.3 Commit

Stage all changed files and commit:

```
git add <changed-files>
git commit -m "chore(release): vX.Y.Z"
```

If Beads is configured (`.beads/` exists) and a task is active, include the task ID: `[BD-xxx] chore(release): vX.Y.Z`.

---

### Phase 5: Tag & Publish

**In dry-run mode:** Show what would happen. Skip to Phase 6.

#### 5.1 Determine Flow

Check the current branch:

- **`main` or `master`**: Direct flow (tag — push — release).
- **Any other branch**: PR flow (push — create PR — instructions).

#### 5.2 Direct Flow (main/master)

1. Create annotated tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
2. Push commit and tag: `git push origin HEAD --follow-tags`
3. If push fails (e.g., branch protection), fall back to PR flow (5.3).
4. If `gh` is available: create GitHub release:
   ```
   gh release create vX.Y.Z --title "vX.Y.Z" --notes "<release-notes-from-3.4>"
   ```

#### 5.3 PR Flow (feature branch)

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

### Phase 6: Post-Release Summary

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

### Rollback

Undo the most recent release. This is a **destructive operation** with safety guards.

#### R.1 Identify Latest Release

1. Find the most recent tag: `git tag -l 'v*' --sort=-v:refname | head -1`
2. If no tags exist: "No releases found. Nothing to roll back." **Stop.**

#### R.2 Safety Confirmation

Tell the user: "To confirm rollback of `<tag>`, type the exact tag name (e.g., `v1.3.0`):"

- If the user types the correct tag name — proceed.
- If the user types anything else — "Tag name does not match. Rollback cancelled." **Stop.**

#### R.3 Execute Rollback

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

#### R.4 Report Results

Show what succeeded and what failed:

```
Rollback of <tag>:
  GitHub release: deleted (or failed: <error>)
  Remote tag: deleted
  Local tag: deleted
  Version bump commit: reverted

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

---

## Domain Knowledge

### release-management

*Release engineering patterns for semantic versioning and changelog management*

# Release Management

Expert knowledge for release engineering including semantic versioning, conventional commit parsing, changelog generation, quality gates, and rollback procedures.

## Summary

### Semantic Versioning

- **Major** (`X.0.0`) — breaking changes that require consumer migration
- **Minor** (`0.X.0`) — new features, backward-compatible additions
- **Patch** (`0.0.X`) — bug fixes, documentation, internal refactors

### Conventional Commit Parsing

Parse commits since the last release to determine the version bump:

- `feat:` → minor bump
- `fix:` → patch bump
- `BREAKING CHANGE:` footer or `!:` suffix → major bump
- Highest-wins rule: if any commit is major, the release is major

### Changelog Format

Follow the [Keep a Changelog](https://keepachangelog.com/) format. Group entries by Added, Fixed, Changed, and Other. Write for users, not developers.

### Quality Gates

All quality gates must pass before a release. Stop if gates fail unless `--force` is explicitly used.

## Deep Guidance

### Semantic Versioning — Extended

**Major version (breaking changes):**
- Removing or renaming a public API endpoint, function, or command
- Changing the behavior of an existing API in a way that breaks consumers
- Removing configuration options or changing their meaning
- Incompatible data format or schema changes

**Minor version (new features):**
- Adding a new API endpoint, function, or command
- Adding new optional configuration options
- Adding new fields to API responses (additive, non-breaking)
- New user-facing capabilities

**Patch version (fixes):**
- Bug fixes that restore expected behavior
- Documentation corrections
- Internal refactors that don't affect the public API
- Performance improvements with no API changes
- Dependency updates (non-breaking)

**Pre-release versions:**
- `v1.2.3-rc.1` — release candidate, feature-complete but not fully tested
- `v1.2.3-beta.1` — beta, feature-complete but may have known issues
- `v0.x.y` — initial development, no stability guarantees

### Conventional Commit Parsing — Extended

**Scanning commits:**

```bash
# List commits since last tag
git log $(git describe --tags --abbrev=0 2>/dev/null || echo "$(git rev-list --max-parents=0 HEAD)")..HEAD --oneline
```

**Determining the bump:**

| Commit message | Bump |
|---|---|
| `feat: add export command` | minor |
| `feat!: redesign plugin API` | major |
| `fix: correct timezone handling` | patch |
| `fix: resolve crash\n\nBREAKING CHANGE: config format changed` | major |
| `chore: update dependencies` | patch |
| `docs: update README` | patch |
| `refactor: simplify auth flow` | patch |

**Highest-wins rule:**
If 10 commits include 8 fixes and 2 features, the release is a minor bump.
If any single commit includes a breaking change, the release is a major bump regardless of other commits.

**Edge cases:**
- No conventional commit prefix → treat as patch
- Multiple `feat:` commits → still a single minor bump
- `feat:` + `BREAKING CHANGE:` → major (breaking wins)

### Changelog Generation

**Format (Keep a Changelog):**

```markdown
## [1.2.0] - 2026-03-29

### Added
- Export command for pipeline data (#145)
- Bulk task creation via CSV import (#148)

### Fixed
- Timezone handling in schedule display (#146)
- Dashboard filter state not persisting (#147)

### Changed
- Improved error messages for validation failures (#149)
```

**Writing guidelines:**
- Audience is users, not developers — describe what changed from the user's perspective
- Use past tense ("Added," "Fixed," "Changed")
- Reference PR or issue numbers for traceability
- Group by type: Added (new features), Fixed (bug fixes), Changed (modifications to existing features), Removed, Deprecated, Security
- One line per change — keep it scannable
- Don't include internal refactors, test additions, or CI changes unless they affect users

### Quality Gates — Extended

**Before releasing, verify:**

1. **All tests pass** — `make check`, `make test`, or the project's equivalent
2. **Lint clean** — no linting warnings or errors
3. **Build succeeds** — the project compiles/bundles without errors
4. **No uncommitted changes** — working tree is clean
5. **On the correct branch** — releases come from `main`
6. **Up to date with remote** — `git pull` before tagging

**If gates fail:**
- Stop the release process
- Fix the failing gate
- Re-run all gates from the beginning
- Only proceed with `--force` if explicitly instructed (and document why)

### GitHub Release

**Creating a release:**

```bash
# Create an annotated tag
git tag -a v1.2.0 -m "Release v1.2.0"

# Push the tag
git push origin v1.2.0

# Create a GitHub release with changelog as body
gh release create v1.2.0 --title "v1.2.0" --notes-file CHANGELOG_EXCERPT.md
```

**Pre-release versions:**
- Use `--prerelease` flag for `v0.x` versions or release candidates
- `gh release create v0.5.0 --prerelease --title "v0.5.0 (pre-release)"`

### Rollback Procedures

When a release needs to be reverted:

1. **Revert the tag locally and remotely:**
   ```bash
   git tag -d v1.2.0
   git push origin --delete v1.2.0
   ```

2. **Revert the commits** that were part of the bad release:
   ```bash
   git revert <commit-range> --no-commit
   git commit -m "[ROLLBACK] revert v1.2.0 changes"
   ```

3. **Update version files** back to the previous version

4. **Create a new patch release** with the rollback:
   ```bash
   git tag -a v1.1.1 -m "Rollback: revert v1.2.0"
   git push origin v1.1.1
   ```

5. **Update the changelog** with a note explaining the rollback

**Commit message convention for rollbacks:** prefix with `[ROLLBACK]` for easy identification in history.

### Conditional Beads Integration

When `.beads/` directory exists, enrich the changelog with task completion data:

```markdown
## [1.2.0] - 2026-03-29

### Added
- Export command for pipeline data (#145)

### Completed Tasks
- bd-42: Implement export endpoint
- bd-43: Add export CLI command
- bd-44: Write export integration tests
```

Cross-reference closed Beads tasks by scanning `bd close` entries since the last release tag.

### Version File Detection

Scan the project root for version files and update all that are found:

| File | Field | Ecosystem |
|------|-------|-----------|
| `package.json` | `"version"` | Node.js / npm |
| `pyproject.toml` | `[project] version` | Python |
| `Cargo.toml` | `[package] version` | Rust |
| `.claude-plugin/plugin.json` | `"version"` | Claude Code plugin |
| `pubspec.yaml` | `version` | Flutter / Dart |
| `setup.cfg` | `version` | Python (legacy) |
| `version.txt` | entire file | Generic |

After updating version files, commit them in the same commit as the changelog update, before creating the tag.

## See Also

- [version-strategy](./version-strategy.md) — Version file management across ecosystems
- [git-workflow-patterns](../core/git-workflow-patterns.md) — Branching, tagging, and merge policies

---

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
