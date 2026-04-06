---
name: library-versioning
description: Semver discipline, breaking change detection, release automation, and changelog management for published libraries
topics: [library, versioning, semver, breaking-changes, release-automation, changelog, changesets]
---

Library versioning is a communication protocol with consumers. Semver (Semantic Versioning) is not merely a numbering scheme — it is a contract about backward compatibility. Breaking that contract without a major version bump is one of the most damaging things a library can do. Consumers set version ranges expecting that minor updates are safe to take automatically. Violating that expectation causes production incidents for real applications. Versioning discipline must be enforced by tooling, not willpower.

## Summary

Enforce semver through tooling: use changesets or semantic-release to automate versioning based on change metadata. Use automated breaking change detection (API Extractor or type-coverage checks) to catch accidental breaking changes before publish. Every release requires a CHANGELOG entry with migration guidance for breaking changes. Pre-releases (`alpha`, `beta`, `rc`) allow consumers to opt into early testing without affecting stable installs. Tag releases in git to enable diff-based changelog generation.

Versioning workflow:
1. Author creates changeset file describing the change type (patch/minor/major)
2. CI aggregates changesets and proposes a version bump PR
3. Version bump PR merges, triggering publish to npm
4. Git tag pushed matching the published version
5. GitHub Release created from changelog content

## Deep Guidance

### Changesets Workflow

Changesets is the recommended tool for managing versioning in library projects. It decouples the decision of "what version bump does this change require" from "when do we publish."

**Setup:**
```bash
npm install --save-dev @changesets/cli
npx changeset init
```

This creates a `.changeset/` directory at the project root.

**Creating a changeset (run for every PR that changes behavior):**
```bash
npx changeset add
# Interactive prompt:
# ? Which packages would you like to include? my-library
# ? What type of change is this for my-library?
#   major (Breaking change)
#   minor (New feature)
# > patch (Bug fix)
# ? Please enter a summary for this change:
# Fix parseConfig() incorrectly ignoring the encoding option
```

This creates a markdown file in `.changeset/`:
```markdown
<!-- .changeset/silver-wolves-grin.md -->
---
"my-library": patch
---

Fix parseConfig() incorrectly ignoring the encoding option when parsing file input.
```

**Version bump and publish:**
```bash
# Update package.json version and CHANGELOG.md
npx changeset version

# Publish to npm
npx changeset publish
```

In CI, automate this with the Changesets GitHub Action:
```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main]

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - uses: changesets/action@v1
        with:
          publish: npm run release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

The action opens a "Version Packages" PR when changesets are present and publishes when that PR merges.

### Breaking Change Detection with API Extractor

Microsoft's API Extractor catches breaking changes by comparing the current API surface against a committed baseline:

**Setup:**
```bash
npm install --save-dev @microsoft/api-extractor
npx api-extractor init
```

```json
// api-extractor.json (key settings)
{
  "mainEntryPointFilePath": "<projectFolder>/dist/types/index.d.ts",
  "apiReport": {
    "enabled": true,
    "reportFolder": "<projectFolder>/etc/"
  },
  "docModel": {
    "enabled": true
  }
}
```

```bash
# Generate initial API report (commit this file)
npx api-extractor run --local

# In CI: compare against committed report
npx api-extractor run
# Fails if the API surface changed in ways not reflected in the committed report
```

The generated `etc/my-library.api.md` file shows the complete public API surface in a reviewable format. When a PR changes it, reviewers can see exactly what changed. If the change is intentional, update the committed report; if not, fix the breaking change.

**API report excerpt:**
```markdown
// @public
export function parseConfig(input: string, options?: ParseOptions): Config;

// @public
export interface ParseOptions {
  encoding?: BufferEncoding;
  strict?: boolean;
}

// @public
export class ParseError extends Error {
  constructor(message: string, line: number, column: number);
  readonly column: number;
  readonly line: number;
}
```

This format makes breaking changes immediately visible in code review.

### Pre-Release Channels

Pre-releases allow consumers to test upcoming changes without affecting stable installs:

**With changesets:**
```bash
# Enter pre-release mode
npx changeset pre enter alpha
# Or: beta, rc

# Create changesets and version as normal
npx changeset add
npx changeset version
# Produces: 2.0.0-alpha.1

# Exit pre-release mode
npx changeset pre exit
```

**Manual pre-release versioning:**
```json
// package.json
"version": "2.0.0-alpha.1"
```

```bash
npm publish --tag alpha
# Consumers opt-in: npm install my-library@alpha
# Stable consumers (npm install my-library) are unaffected
```

**Pre-release channel strategy:**
- `alpha` — internal testing only, may change drastically, no API stability
- `beta` — public testing, API reasonably stable, looking for feedback
- `rc` (release candidate) — API frozen, looking for final integration issues
- Stable — semver protected, change policy enforced

### Release Automation with GitHub Actions

Full release workflow with provenance and attestation:

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write
  id-token: write  # For npm provenance

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Test
        run: npm test

      - name: Publish to npm
        run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          draft: false
```

The `--provenance` flag publishes npm provenance attestation — a cryptographic link between the published package and the GitHub Actions run that built it. This allows consumers to verify the package was built from the expected source.

### CHANGELOG Generation

Keep a Changelog format, managed automatically:

```bash
# With conventional commits, generate changelog automatically:
npx conventional-changelog-cli -p angular -i CHANGELOG.md -s

# Or with changesets:
npx changeset version  # Updates CHANGELOG.md automatically
```

**Manual CHANGELOG structure:**
```markdown
# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html)

## [Unreleased]

## [2.1.0] - 2024-03-15

### Added
- `parseConfigFile(path)` for file-based parsing
- `ParseOptions.maxSize` to limit input size

### Fixed
- `parseConfig()` no longer ignores `encoding` option for buffer inputs

## [2.0.0] - 2024-01-10

### Breaking Changes
- Removed `parse()` (deprecated in 1.5.0). Replacement: `parseConfig()`.
- `Config.timeout` is now milliseconds (was seconds). Multiply existing values × 1000.
- Dropped Node 16 support. Minimum: Node 18.

### Migration Guide
See: https://my-library.dev/guides/migration-v2

[Unreleased]: https://github.com/org/my-library/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/org/my-library/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/org/my-library/releases/tag/v2.0.0
```

### Git Tag Strategy

Tag every release:
```bash
# After publishing to npm
git tag v2.1.0
git push origin v2.1.0

# Or use npm version (updates package.json, commits, and tags)
npm version minor -m "chore(release): v%s"
git push && git push --tags
```

Tags are the source of truth for "what was published when." They enable:
- Reproducible builds from any historical version
- `git diff v2.0.0 v2.1.0` to review what changed between releases
- Automated changelog generation tools
- GitHub Release creation linked to the exact commit
