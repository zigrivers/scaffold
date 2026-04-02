<!-- scaffold:operations-runbook v4 2026-03-14 -->

# Scaffold v2 — Operations & Deployment Runbook

## 1. Overview

This document covers the operational lifecycle of the Scaffold v2 TypeScript CLI: development environment setup, CI/CD pipeline configuration, release process, rollback procedures, security practices, and ongoing maintenance. It is written for contributors, CI systems, and release managers.

**Scope**: from cloning the repo to publishing a release and maintaining the package post-launch.

**Related documents**:
- [testing-strategy.md](testing-strategy.md) §10 — quality gate definitions (pre-commit, CI, pre-merge, periodic)
- [git-workflow.md](../../docs/git-workflow.md) — branching model, PR workflow, worktree setup
- [CLAUDE.md](../../CLAUDE.md) — contributor workflow, quality gates, and autonomous agent conventions

**Important context**: Scaffold v2 is a CLI tool distributed as an npm package. It has no server, no database, no runtime monitoring, and makes no network requests (except `scaffold update`). Operations concepts are adapted accordingly — "deployment" means npm publish, "monitoring" means download and issue tracking, "rollback" means npm version revert.

---

## 2. Dev Environment Setup

### 2.1 Prerequisites

| Dependency | Version | Why | Install |
|------------|---------|-----|---------|
| Node.js | 18+ (22+ for Codex users) | Runtime and build toolchain | `nvm install` (reads `.nvmrc`) |
| npm | 9+ | Package management | Ships with Node.js |
| TypeScript | 5.x | Compile-time type checking | `npm install` (devDependency) |
| Git | 2.x+ | Version control, worktrees | Pre-installed on macOS/Linux |

A `.nvmrc` (or `.node-version`) file is checked into the repo root so `nvm use` and `fnm` auto-select the correct Node.js version. CI also reads this file (see §3).

### 2.2 One-Command Setup

```bash
git clone <repo-url>
cd scaffold
npm install          # Install all dependencies
npm run build        # Compile TypeScript to dist/
npm test             # Run vitest — verify setup
```

This replaces v1's `make setup` (which installed Bash tools via Homebrew). The v2 setup requires only Node.js and npm — all other dependencies are npm packages.

The setup is idempotent — running `npm install` again after a `git pull` picks up any new or changed dependencies.

### 2.3 npm Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `npm test` | `vitest run` | Run all unit + integration tests |
| `npm run test:watch` | `vitest` | Watch mode — re-runs on file change |
| `npm run test:coverage` | `vitest run --coverage` | Tests with v8 coverage report |
| `npm run test:e2e` | `vitest run --config vitest.e2e.config.ts` | End-to-end tests (separate config) |
| `npm run test:bench` | `vitest bench` | Performance benchmarks |
| `npm run build` | `tsc` | Compile TypeScript to `dist/` |
| `npm run lint` | `eslint src/` | Lint source and test files |
| `npm run type-check` | `tsc --noEmit` | Type-check without emitting |
| `npm run check` | `npm run lint && npm run type-check && npm test` | TypeScript quality gates (used by `make check-all`) |

### 2.4 Project Layout for Development

Source and tests are co-located for unit tests:

```
src/
  core/
    assembly/
      engine.ts
      engine.test.ts              # Unit test — co-located
  state/
    state-manager.ts
    state-manager.test.ts
  cli/
    commands/
      run.ts
      run.test.ts
tests/
  integration/                    # Cross-module integration tests
  e2e/                            # End-to-end CLI tests
  performance/                    # Benchmark tests (vitest bench)
  helpers/
    test-utils.ts                 # Shared test factories and utilities
    no-network.ts                 # Global hook blocking network access
```

Vitest configuration:
- **Default config** (`vitest.config.ts`): runs unit + integration tests, coverage thresholds per module group (see testing-strategy.md §9)
- **E2E config** (`vitest.e2e.config.ts`): longer timeout, runs against compiled `dist/` output
- **Benchmark mode**: `vitest bench` uses vitest's built-in benchmark support

### 2.5 Environment Variables

Scaffold v2 requires **no environment variables** for normal development,
release, or runtime operation. The CLI makes no network requests (except
`scaffold update`) and stores no credentials.

No `.env` file, no `.env.example`, no secrets management. This is intentional
(PRD §18: no credential storage, no API keys).

### 2.6 IDE Setup

**VS Code** (recommended):

```jsonc
// .vscode/settings.json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "vitest.enable": true,
  "vitest.commandLine": "npx vitest"
}
```

Recommended extensions: `vitest.explorer` (test runner), `dbaeumer.vscode-eslint` (lint), `esbenp.prettier-vscode` (format).

### 2.7 Troubleshooting

**`tsc` reports errors after `git pull`:**
```bash
rm -rf node_modules dist && npm install && npm run build
```
This clears stale compiled output and reinstalls dependencies matching the updated `package-lock.json`.

**Vitest cannot find config:**
Ensure you are running from the repo root. Vitest resolves `vitest.config.ts` from `cwd`.

**Node.js version mismatch:**
```bash
nvm use          # Reads .nvmrc
node --version   # Should print 18.x or 22.x
```
If you don't have `nvm`, install it or use `fnm`. The minimum version is enforced by `package.json` `engines.node`.

**Tests pass locally but fail in CI:**
Check the Node version matrix — CI runs Node 18 and 22. A test using a Node 22 API will fail on 18. Use feature detection or polyfills for cross-version compatibility. To test both versions locally: `nvm install 18 && nvm use 18 && npm test`, then repeat for 22. For full CI parity, run `make check-all` (not just `npm test`) under each Node version. To fully reproduce CI conditions: use `npm ci` (not `npm install`), delete `dist/` before building, and run with `--no-cache` if vitest caching is suspected. For filesystem case-sensitivity issues on macOS, create a case-sensitive disk image: `hdiutil create -size 2g -fs 'Case-sensitive APFS' -volname CaseSensitive cs.dmg && open cs.dmg`.

**Platform differences (macOS local vs Ubuntu CI):**
CI runs on `ubuntu-latest`. Known divergences:
- **Filesystem**: macOS is case-insensitive by default; Ubuntu is case-sensitive. Import paths with wrong casing pass locally but fail in CI.
- **Path separators**: Node's `path.sep` is `/` on both, but tools that shell out may behave differently.
- **Shell**: CI uses `bash`; macOS defaults to `zsh`. Scripts should use `#!/usr/bin/env bash` and avoid zsh-isms.
- **npm ci** vs **npm install**: CI always uses `npm ci` (lockfile only). If you see dependency errors in CI, run `npm ci` locally to reproduce.

---

## 3. CI/CD Pipeline

### 3.1 Workflow Files

```
.github/workflows/
  ci.yml              # PR checks and main branch pushes
  publish.yml          # npm publish on version tag push
  update-homebrew.yml  # Homebrew tap update on version tag push
```

### 3.2 CI Workflow (`ci.yml`)

**Triggers**: push to PR branches, push to `main`.

**Matrix strategy**: Node.js 18 (minimum supported) and Node.js 22 (Codex target). Both must pass.

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run test:coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage-node${{ matrix.node-version }}
          path: coverage/

  e2e:
    runs-on: ubuntu-latest
    needs: [test]
    strategy:
      matrix:
        node-version: [18, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm run test:e2e

  build-verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - run: npm pack --dry-run
      - name: Verify tarball contents
        run: |
          npm pack
          tar tzf *.tgz | grep -E '^package/(dist|pipeline|knowledge|methodology)/' || exit 1
      - name: Verify CLI entry point
        run: node dist/index.js --version

  security-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci
      - run: npm audit --audit-level=high
```

**Key design decisions**:
- `npm ci` (not `npm install`) — deterministic installs from lockfile, faster in CI
- `actions/setup-node` with `cache: 'npm'` — caches `~/.npm` keyed to `package-lock.json` hash
- Coverage threshold enforcement uses vitest's `coverage.thresholds` (see testing-strategy.md §9) — the test job fails automatically if thresholds are not met
- E2E tests run after unit/integration tests pass (`needs: [test]`) — fail fast on cheaper tests first
- Build verification creates a tarball and checks that the required directories are included

**Pipeline budget**: total CI time < 3 minutes. If exceeded, investigate before adding parallelization (see testing-strategy.md §10).

### 3.3 Tag-Push Release Workflows

**Trigger**: push of a version tag (`v*`).

Scaffold uses two tag-triggered workflows:

- **`publish.yml`** — checks out the tagged commit, runs `npm ci`, `npm run build`, `npm test`, and publishes `@zigrivers/scaffold` to npm with provenance.
- **`update-homebrew.yml`** — computes the SHA256 for the tagged GitHub source tarball and updates the `zigrivers/homebrew-scaffold` tap so `brew upgrade scaffold` installs the same version.

Important operational detail:

- **GitHub release creation is not automated by these workflows.** Maintainers still create the GitHub release manually after the tag is pushed.

**Partial release failure**:
- If `publish.yml` succeeds but `update-homebrew.yml` fails, npm users can upgrade immediately but Homebrew users cannot until the tap update is fixed.
- If `update-homebrew.yml` succeeds but `publish.yml` fails, the tap may point at a version that is tagged on GitHub but unavailable on npm. Treat this as a release incident and fix or roll back before announcing the release.
- If both workflows succeed but the GitHub release has not been created yet, the package is still installable; the GitHub release is the remaining maintainer action.

### 3.4 Branch Protection

Configure on the `main` branch:
- Require status checks to pass (all CI jobs)
- Require PR review (at least 1 approval)
- Require branches to be up to date before merging
- No direct pushes to main (except tags)

GitHub sends email notifications to the commit author on workflow failure by default. For team-wide visibility, configure a repository webhook or GitHub Actions notification to a shared channel.

---

## 4. Release Process

### 4.1 Versioning

Scaffold follows [semver](https://semver.org):

| Change type | Version bump | Examples |
|-------------|-------------|----------|
| Breaking CLI contract changes | **Major** | Renamed commands, changed exit codes, removed flags |
| New commands or features | **Minor** | New `scaffold validate` command, new methodology preset |
| Bug fixes | **Patch** | Fix state.json write race, fix depth resolution edge case |

### 4.2 Release Checklist

1. **Verify release scope is complete**: merged PRs, open follow-up issues, and release notes all agree on what is included in this release
2. **Run local quality gates**: `make check-all` passes (bash + TypeScript full pre-submit gate)
3. **Update CHANGELOG.md**: follow [keep-a-changelog](https://keepachangelog.com) format
   ```markdown
   ## [1.2.0] - 2026-03-15
   ### Added
   - `scaffold validate` command for cross-artifact consistency checks
   ### Fixed
   - State.json atomic write race on NFS mounts
   ```
4. **Update `README.md` when applicable**: if user-facing behavior, install or upgrade commands, migration steps, release semantics, or feature availability changed, update the README in the same release-prep change
5. **Bump version without tagging yet**: update `package.json` and `package-lock.json` for the release version, commit the release-prep change, and merge it to `main`
6. **Tag merged `main`**: from an up-to-date `main`, create and push `v<version>` — this triggers `publish.yml` and `update-homebrew.yml`
7. **Create the GitHub release**: create the release manually after pushing the tag, using the changelog entry or curated release notes
8. **Verify release**:
   - `publish.yml` succeeds in GitHub Actions
   - `update-homebrew.yml` succeeds in GitHub Actions
   - `npm info @zigrivers/scaffold version` returns the new version (npm registry propagation can take 1-5 minutes — retry after a short delay if the version doesn't appear immediately)
   - `npx @zigrivers/scaffold --version` returns the new version from a clean directory
   - `brew update && brew upgrade scaffold && scaffold --version` returns the new version

### 4.3 Pre-Release Versions

For testing before a stable release:

```bash
npm version prerelease --preid=beta    # e.g., 1.2.0-beta.0
git push origin main --tags
```

Pre-release versions are published to npm but not installed by default (`npm install` gets the latest stable). Users opt in: `npm install @zigrivers/scaffold@beta`.

### 4.4 Package Contents

What `npm pack` **includes** (configured via `files` in `package.json`):

| Directory | Content |
|-----------|---------|
| `dist/` | Compiled JavaScript (from `src/`) |
| `pipeline/` | Meta-prompt markdown files (36 files) |
| `knowledge/` | Knowledge base markdown files (37 files) |
| `methodology/` | Methodology preset YAML files (3 files) |
| `package.json` | Package manifest with `bin.scaffold` entry |
| `README.md` | npm landing page |
| `LICENSE` | License file |

What `npm pack` **excludes** (via `.npmignore`): `src/`, `tests/`, `docs/`, root `*.ts` configs, `.scaffold/`, `.github/` — anything that is development-only or project-specific.

### 4.5 Verifying the Package Before Publish

```bash
# Dry-run to see what would be published
npm pack --dry-run

# Create actual tarball and inspect
npm pack
tar tzf zigrivers-scaffold-*.tgz

# Verify required content is present
tar tzf *.tgz | grep -c '^package/dist/'         # Should be > 0
tar tzf *.tgz | grep -c '^package/pipeline/'     # Should be > 0
tar tzf *.tgz | grep -c '^package/knowledge/'    # Should be > 0

# Verify excluded content is absent
tar tzf *.tgz | grep '^package/src/' && echo "FAIL: src/ included" || echo "OK"
tar tzf *.tgz | grep '^package/tests/' && echo "FAIL: tests/ included" || echo "OK"
```

### 4.6 npx Zero-Install Testing

After publishing, verify the zero-install experience:

```bash
# From a directory with no scaffold installation
cd $(mktemp -d)
npx @zigrivers/scaffold --version     # Should print version
npx @zigrivers/scaffold init --help   # Should print init help
```

This is the first experience for new users — it must work without errors.

### 4.7 Dual-Channel Version Sync

npm and Homebrew must publish the same version. Version drift between channels is not acceptable (ADR-002).

Scaffold now handles the Homebrew tap update automatically via
`update-homebrew.yml` on tag push. Maintainers should:

1. Verify `publish.yml` succeeded for the tagged version
2. Verify `update-homebrew.yml` succeeded for the same tag
3. Verify `brew update && brew upgrade scaffold && scaffold --version` matches the npm version

If the Homebrew workflow fails, fix the tap update immediately or treat it as a release incident before announcing the release.

---

## 5. Rollback & Recovery

### 5.1 Bad npm Release

**Within 72 hours of publish** (and the package has fewer than 300 weekly downloads and no dependents):
```bash
npm unpublish @zigrivers/scaffold@<bad-version>
```
If the package exceeds 300 weekly downloads or has dependents, npm blocks unpublish even within 72 hours. In that case, use deprecation (below). Unpublish takes effect within minutes of running the command.

**After 72 hours or when unpublish is blocked**:
```bash
npm deprecate @zigrivers/scaffold@<bad-version> "Known issue: <description>. Use <good-version> instead."
```
Deprecated versions show a warning on install but remain available. Deprecation propagates within minutes.

**Git tags for bad releases**: Do NOT delete the git tag — it documents release history and the GitHub Release (even if edited with a warning) provides context. Only delete tags for releases that were never actually published to npm.

### 5.2 Dual-Channel Rollback Sequencing

**Order**: Roll back Homebrew **first**, then npm/GitHub tag artifacts. Rationale: the Homebrew formula points at the tagged GitHub source tarball, so fix the tap before deleting or moving tagged release artifacts.

1. Revert or manually fix the Homebrew formula change in `zigrivers/homebrew-scaffold` — users receive the previous version on their next `brew update && brew upgrade` (not instant; depends on when users update)
2. Unpublish or deprecate the npm version (see §5.1)
3. Verify both channels serve the correct version

### 5.3 Breaking Change Shipped Accidentally

If a patch or minor release contains a breaking change (semver violation):

1. Publish a new patch that **reverts** the breaking change — this restores compatibility for users on the previous minor
2. Publish the breaking change as the next **major** version
3. Update CHANGELOG.md documenting both the accidental break and the recovery

### 5.4 Corrupted Package

If the published tarball is missing files or has wrong content:

```bash
# Compare local tarball to published version
npm pack                                          # Create local tarball
npm pack @zigrivers/scaffold@<version>         # Download published tarball
diff <(tar tzf local.tgz | sort) <(tar tzf published.tgz | sort)
```

Fix `.npmignore` or `files` in `package.json`, then publish a patch.

### 5.5 Security Vulnerability Discovered

1. Run `npm audit` to identify the vulnerable dependency
2. If a fix is available: `npm audit fix`, run tests, publish a patch
3. If no fix is available: evaluate the impact. For high/critical vulnerabilities, consider replacing the dependency or pinning a non-vulnerable version
4. For vulnerabilities in scaffold itself: fix, patch release, and file an npm security advisory if the vulnerability affects end users

### 5.6 User Communication for Bad Releases

When a bad release is identified:
1. **Deprecate immediately** with a descriptive message (see §5.1) — users see the warning on next install
2. **Update the GitHub Release** notes to add a warning banner at the top
3. **File a GitHub Issue** labeled `release-incident` with details and the fix timeline
4. For security issues, use `npm audit advisory` and GitHub Security Advisories

### 5.7 Failure Scenario Runbook

Each scenario follows: **Symptoms** → **Diagnosis** → **Resolution** → **Verification**.

**Scenario A: `npm publish` fails mid-stream**
- *Symptoms*: Release workflow `publish` job fails. npm may or may not show the version.
- *Diagnosis*: Check workflow logs for the error (auth failure, validation, network). Run `npm info @zigrivers/scaffold versions` to see if the version landed.
- *Resolution*: If the version didn't land — fix the issue (usually `NPM_TOKEN` expired or `package.json` validation) and re-run the workflow. If the version partially landed (corrupt), unpublish and re-publish. `npm publish` is idempotent for the same content — re-running is safe if the version didn't land.
- *Verification*: `npm info @zigrivers/scaffold version` returns expected version.

**Scenario B: Release tag pushed but workflow doesn't trigger**
- *Symptoms*: Tag visible in `git tag`, pushed to origin, but no GitHub Actions run appears.
- *Diagnosis*: Check `.github/workflows/publish.yml` and `.github/workflows/update-homebrew.yml` syntax with `act` or the Actions UI. Check Actions quota (Settings → Billing). Verify tag matches the `v*` pattern.
- *Resolution*: Fix the workflow file if there's a syntax error, then delete and re-push the tag: `git tag -d v<ver> && git push origin :refs/tags/v<ver> && git tag v<ver> && git push origin v<ver>`. If quota exceeded, wait or contact GitHub support.
- *Verification*: Actions tab shows the tag-push release workflows running.

**Scenario C: CI passes but package broken on a specific platform or Node version**
- *Symptoms*: User-reported bug that doesn't reproduce in CI. Typically macOS vs Linux or Node 18 vs 22 behavior.
- *Diagnosis*: Reproduce locally on the reported platform/Node version. Check for case-sensitive imports, platform-specific `path` behavior, or Node API differences.
- *Resolution*: Write a test that catches the platform-specific failure, fix the code, publish a patch.
- *Verification*: Test passes on both platforms/versions. Ask the reporting user to verify with the patched version.

**Scenario D: `update-homebrew.yml` fails**
- *Symptoms*: The tag push succeeds and npm publish may be live, but the Homebrew workflow fails or the tap does not update.
- *Diagnosis*: Check the `update-homebrew.yml` logs. Common causes: bad tap credentials, SHA mismatch, or a formula/install regression in `zigrivers/homebrew-scaffold`.
- *Resolution*: Fix the failing workflow or tap formula, rerun the workflow if possible, and verify the tap points at the correct `v<version>` source tarball.
- *Verification*: `brew update && brew upgrade scaffold && scaffold --version` returns the expected version.

---

## 6. Security Practices

### 6.1 No Credentials in Code

Scaffold stores no API keys, tokens, or credentials (PRD §18). The CLI makes no authenticated requests. There is no `.env` file and no secrets manager integration.

### 6.2 No Network Access

The CLI makes no network requests except `scaffold update` (which checks the npm registry for newer versions). All operations are local filesystem reads and writes.

### 6.3 CI Security & Publish Access

- `npm audit --audit-level=high` runs in CI — fails the build on high or critical vulnerabilities
- `npm ci` (not `npm install`) ensures deterministic builds from the lockfile
- npm publish requires **2FA** enabled on the publishing npm account
- npm provenance attestation (`--provenance`) links published packages to their source commit

**npm token management**:
- The `NPM_TOKEN` GitHub secret is a granular access token scoped to publish `@zigrivers/scaffold` only
- Token is created by the npm org owner with `Automation` type (bypasses 2FA for CI while requiring 2FA for interactive use)
- Rotate the token at least annually or immediately if a security incident is suspected
- Limit npm org membership to maintainers who need publish access — use the `developer` role for contributors who don't

**npm account compromise recovery**: If the token is leaked or the account is compromised: (1) revoke all tokens immediately on npmjs.com, (2) rotate the `NPM_TOKEN` GitHub secret, (3) run `npm audit signatures` on the last published version to verify package integrity, (4) contact npm support at security@npmjs.com if unauthorized versions were published

### 6.4 Package Hygiene

- `.npmignore` excludes test fixtures, local config, `.env` patterns, and any files that could contain sensitive data
- Review `package-lock.json` changes in PRs — new dependencies should be intentional
- Minimize dependencies: prefer Node built-ins over external packages where functionality is equivalent

### 6.5 Supply Chain

- Use `npm ci` in CI (installs from lockfile only)
- Verify npm provenance when consuming scaffold as a dependency
- Pin major versions of dependencies in `package.json` (e.g., `"yargs": "^17"` not `"yargs": "*"`)
- Review transitive dependency additions — a new direct dependency may pull in dozens of transitives

---

## 7. Maintenance & Monitoring

### 7.1 Release Health Tracking

Scaffold is a CLI tool — there is no runtime to monitor. Release health is tracked through:

| Signal | How to check | Frequency |
|--------|-------------|-----------|
| npm download stats | `npm info @zigrivers/scaffold` or [npmjs.com](https://npmjs.com) dashboard | Weekly |
| Bug reports | GitHub Issues | Daily triage |
| Feature requests | GitHub Discussions or GitHub Issues | Weekly review |
| npm audit advisories | `npm audit` locally or Dependabot alerts | Continuous (CI) |
| CI workflow health | GitHub Actions tab — check for failures on `main` | After each push to main |

**Post-release verification** (within 48 hours of a release):
1. Verify `npx @zigrivers/scaffold --version` from a clean temp directory returns the new version
2. Run `scaffold init --help` to confirm the CLI loads without errors
3. Check GitHub Issues for reports tagged with the new version
4. Monitor npm download stats — a sudden drop may indicate a broken release
5. If a platform-specific issue is suspected, test on macOS and Linux (or ask a contributor to verify)

For major releases, repeat verification at 1 week to catch issues that only appear with broader adoption.

### 7.2 Dependency Updates

- Run `npm outdated` monthly to identify available updates
- Configure **Dependabot** for automated dependency update PRs:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      minor-and-patch:
        update-types: [minor, patch]
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

- Group minor/patch updates into single PRs to reduce noise (configured via `groups` above)
- Test thoroughly before merging major dependency updates (especially yargs, vitest, TypeScript)

### 7.3 Node.js Version Lifecycle

Track the [Node.js release schedule](https://nodejs.org/en/about/releases/):

| Action | When |
|--------|------|
| Add new LTS to CI matrix | When a new even-numbered version enters LTS |
| Remove EOL version from CI matrix | When a version reaches End of Life |
| Update `engines.node` minimum | When the oldest supported LTS reaches EOL |
| Update `.nvmrc` | When the recommended development version changes |

As of 2026: Node 18 is the minimum, Node 22 is the Codex target. Node 18 reached EOL in April 2025. The CI matrix retains Node 18 for the initial v2 release to support users who haven't upgraded. After v2 launches, update `engines.node` to `>=20` and drop Node 18 from the CI matrix.

### 7.4 Performance Regression Tracking

Periodic benchmark runs against `main` validate that performance stays within PRD §18 budgets:

| Metric | Budget | Benchmark file |
|--------|--------|----------------|
| Assembly (9-step) | < 500ms p95 | `tests/performance/assembly-benchmark.test.ts` |
| Step listing | < 200ms p95 | `tests/performance/assembly-benchmark.test.ts` |
| State I/O | < 100ms p95 | `tests/performance/state-io-benchmark.test.ts` |
| Dependency resolution | < 10ms p95 | `tests/performance/state-io-benchmark.test.ts` |
| Build | < 2s p95 | `tests/performance/build-benchmark.test.ts` |

Benchmarks are **not** in CI (environment-dependent timing). Run manually or on a scheduled CI job with a dedicated runner for consistent results. See testing-strategy.md §8 for benchmark methodology and §10 for Phase 7+ CI integration plans.

### 7.5 Disaster Recovery

Scaffold has no database, no persistent user data, and no server. Recovery concerns are limited to **source code** and **published packages**.

- **Git repository**: GitHub is the single host. Maintainers should keep local clones current. For critical redundancy, mirror to a second Git host (e.g., `git push --mirror` to a GitLab or Codeberg remote on each release).
- **npm registry**: If the npm package is removed (policy violation, legal claim, or account issue), the package can be re-published from a local build of any tagged commit. Provenance attestation would need to be re-established.
- **Homebrew tap**: The tap repository is a small Git repo. If lost, recreate the formula from the npm package URL and SHA. Keep a local clone.
- **GitHub Actions secrets**: If `NPM_TOKEN` is lost, generate a new one from npmjs.com and update the GitHub secret. No other secrets exist.

### 7.6 Documentation Drift

When CLI behavior changes, verify that these documents remain accurate:
- `docs/v2/operations-runbook.md` (this file)
- `docs/v2/testing-strategy.md`
- `CLAUDE.md`
- `README.md`
- Meta-prompt and knowledge base files that reference CLI behavior

---

## 8. Contributor Quick Reference

### 8.1 Quick-Start

```bash
git clone <repo-url> && cd scaffold
npm install && npm test              # Install + verify
# Pick work from GitHub issues, PR follow-ups, or the session scope
# Implement with TDD: write test -> red -> green -> refactor
make check                           # Bash quality gates
make check-all                       # Full pre-submit gate
git commit -m "type(scope): description"
```

See CLAUDE.md for the full contributor workflow and repository-specific instructions.

### 8.2 Common Workflows

**Adding a new CLI command**:
1. Create `src/cli/commands/<name>.ts` with yargs command module structure
2. Create co-located test `src/cli/commands/<name>.test.ts`
3. Register command in `src/cli/index.ts` (the yargs setup file)
4. Write failing test → implement → verify

**Modifying the assembly engine**:
1. Read `src/core/assembly/engine.ts` and its test file
2. Write a failing test for the new behavior
3. Implement the change
4. Run `npm run test:e2e` — assembly changes often affect E2E tests

**Updating a knowledge base entry**:
1. Edit the relevant file in `knowledge/<category>/<topic>.md`
2. No TypeScript rebuild needed — knowledge base files are read at runtime
3. Test by running `scaffold run <step-that-uses-this-kb-entry>`

**Adding a test**:
1. Co-locate unit tests with source: `src/module/file.test.ts`
2. Use test factories from `tests/helpers/test-utils.ts`: `createTestConfig()`, `createTestState()`, `createTestProject()`
3. Each test creates its own temp directory — no shared state between tests
4. See testing-strategy.md §11 for AI agent testing rules

### 8.3 Where to Find Things

| What | Where |
|------|-------|
| TypeScript source | `src/` (organized by module: `core/`, `state/`, `cli/`, `config/`, `wizard/`) |
| Unit tests | Co-located with source (`*.test.ts`) |
| Integration tests | `tests/integration/` |
| E2E tests | `tests/e2e/` |
| Performance benchmarks | `tests/performance/` |
| Test helpers and factories | `tests/helpers/` |
| Meta-prompt files | `pipeline/` |
| Knowledge base entries | `knowledge/` |
| Methodology presets | `methodology/` |
| ADRs | `docs/v2/adrs/` |
| Domain models | `docs/v2/domain-models/` |
| CI workflows | `.github/workflows/` |
| Type definitions | `src/types/` |
| Error codes and messages | `src/utils/errors.ts` |
