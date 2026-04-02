---
name: release-management
description: Release engineering patterns for semantic versioning and changelog management
topics: [release, versioning, changelog, git]
---

# Release Management

Expert knowledge for release engineering including semantic versioning,
conventional commit parsing, changelog generation, quality gates, release
artifact selection, and rollback procedures.

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

### Project-Specific Release Ceremony

`/scaffold:release` is intentionally project-specific. Determine the target
project's release artifacts from its docs, manifests, CI workflows, and release
scripts before publishing anything. Some projects only create a tag; others may
also create hosted releases, publish to registries, deploy services, or update
secondary channels like Homebrew.

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

### Hosted Releases And Distribution Artifacts

Choose release artifacts based on the target project's documented workflow.
GitHub release creation is one common example, not the universal default.

**Example: GitHub-hosted release:**

```bash
# Create an annotated tag
git tag -a v1.2.0 -m "Release v1.2.0"

# Push the tag
git push origin v1.2.0

# Create a GitHub release with changelog as body
gh release create v1.2.0 --title "v1.2.0" --notes-file CHANGELOG_EXCERPT.md
```

**Other common artifacts:**
- npm publish: `npm publish`
- PyPI publish: `python -m build && twine upload dist/*`
- crates.io publish: `cargo publish`
- deployment or registry update: follow the repo's documented release/deploy command

Only run an artifact step when the repository clearly defines it.

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

4. **Undo other release artifacts only if the project documents them**:
   - Hosted release page deletion
   - Registry deprecation or unpublish
   - Deployment rollback

5. **Create a new patch release** with the rollback:
   ```bash
   git tag -a v1.1.1 -m "Rollback: revert v1.2.0"
   git push origin v1.1.1
   ```

6. **Update the changelog** with a note explaining the rollback

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
