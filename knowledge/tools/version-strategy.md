---
name: version-strategy
description: Version file management across language ecosystems
topics: [versioning, packages, ecosystems]
---

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
