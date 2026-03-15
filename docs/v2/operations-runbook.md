<!-- scaffold:operations-runbook v1 2026-03-14 -->

# Scaffold v2 — Operations & Deployment Runbook

## 1. Overview

This document covers the operational lifecycle of the Scaffold v2 TypeScript CLI: development environment setup, CI/CD pipeline configuration, release process, rollback procedures, security practices, and ongoing maintenance. It is written for contributors, CI systems, and release managers.

**Scope**: from cloning the repo to publishing a release and maintaining the package post-launch.

**Related documents**:
- [testing-strategy.md](testing-strategy.md) §10 — quality gate definitions (pre-commit, CI, pre-merge, periodic)
- [git-workflow.md](../../docs/git-workflow.md) — branching model, PR workflow, worktree setup
- [CLAUDE.md](../../CLAUDE.md) — Beads task tracking, commit message format, autonomous agent conventions

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
| Beads (`bd`) | Latest | Task tracking | `brew install beads` |

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
| `npm run check` | `npm run lint && npm run type-check && npm test` | All quality gates (local equivalent of CI) |

### 2.4 Project Layout for Development

Source and tests are co-located for unit tests:

```
src/
  core/
    assembly-engine.ts
    assembly-engine.test.ts       # Unit test — co-located
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

Scaffold v2 requires **no environment variables** for normal development or runtime operation. The CLI makes no network requests (except `scaffold update`) and stores no credentials.

The only env var relevant to development:

| Variable | Required | Purpose |
|----------|----------|---------|
| `BD_ACTOR` | Only in parallel agent workflows | Beads attribution — identifies which agent claimed a task |

No `.env` file, no `.env.example`, no secrets management. This is intentional (PRD §18: no credential storage, no API keys).

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

Recommended extensions:
- `vitest.explorer` — test runner integration with inline results
- `dbaeumer.vscode-eslint` — inline lint warnings
- `esbenp.prettier-vscode` — consistent formatting

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
Check the Node version matrix — CI runs Node 18 and 22. A test using a Node 22 API will fail on 18. Use feature detection or polyfills for cross-version compatibility.

---

## 3. CI/CD Pipeline

### 3.1 Workflow Files

```
.github/workflows/
  ci.yml              # PR checks and main branch pushes
  release.yml          # npm publish on version tag push
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

### 3.3 Release Workflow (`release.yml`)

**Trigger**: push of a version tag (`v*`).

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  ci:
    uses: ./.github/workflows/ci.yml

  publish:
    needs: ci
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
```

The release workflow:
1. Runs the full CI suite first (lint, test, e2e, build, audit)
2. Builds and publishes to npm with provenance attestation
3. Creates a GitHub Release with auto-generated release notes

After a successful npm publish, update the Homebrew formula (see §4.7).

### 3.4 Branch Protection

Configure on the `main` branch:
- Require status checks to pass (all CI jobs)
- Require PR review (at least 1 approval)
- Require branches to be up to date before merging
- No direct pushes to main (except tags)

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

1. **Verify all work is complete**: `bd list` shows no in-progress tasks for this release
2. **Run local quality gates**: `npm run check` passes (lint + type-check + test)
3. **Update CHANGELOG.md**: follow [keep-a-changelog](https://keepachangelog.com) format
   ```markdown
   ## [1.2.0] - 2026-03-15
   ### Added
   - `scaffold validate` command for cross-artifact consistency checks
   ### Fixed
   - State.json atomic write race on NFS mounts
   ```
4. **Bump version**: `npm version <major|minor|patch>` — this updates `package.json`, creates a git commit, and creates a `v<version>` tag
5. **Push tag**: `git push origin main --tags` — triggers the release workflow
6. **Verify release**:
   - Release workflow succeeds in GitHub Actions
   - `npm info @scaffold-cli/scaffold version` returns the new version
   - `npx @scaffold-cli/scaffold --version` returns the new version (from a clean directory)
7. **Update Homebrew formula** (see §4.7)

### 4.3 Pre-Release Versions

For testing before a stable release:

```bash
npm version prerelease --preid=beta    # e.g., 1.2.0-beta.0
git push origin main --tags
```

Pre-release versions are published to npm but not installed by default (`npm install` gets the latest stable). Users opt in: `npm install @scaffold-cli/scaffold@beta`.

### 4.4 Package Contents

What `npm pack` **includes** (configured via `files` in `package.json`):

| Directory | Content |
|-----------|---------|
| `dist/` | Compiled JavaScript (from `src/`) |
| `pipeline/` | Meta-prompt markdown files (32 files) |
| `knowledge/` | Knowledge base markdown files (32 files) |
| `methodology/` | Methodology preset YAML files (3 files) |
| `package.json` | Package manifest with `bin.scaffold` entry |
| `README.md` | npm landing page |
| `LICENSE` | License file |

What `npm pack` **excludes** (via `.npmignore`):

| Excluded | Reason |
|----------|--------|
| `src/` | TypeScript source — consumers use compiled `dist/` |
| `tests/` | Test files are development-only |
| `docs/` | Documentation lives in the repo, not the package |
| `*.ts` (root) | Config files (`tsconfig.json`, `vitest.config.ts`) |
| `.scaffold/` | Project-specific scaffold state |
| `.beads/` | Task tracking database |
| `.github/` | CI workflows |

### 4.5 Verifying the Package Before Publish

```bash
# Dry-run to see what would be published
npm pack --dry-run

# Create actual tarball and inspect
npm pack
tar tzf scaffold-cli-scaffold-*.tgz

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
npx @scaffold-cli/scaffold --version     # Should print version
npx @scaffold-cli/scaffold init --help   # Should print init help
```

This is the first experience for new users — it must work without errors.

### 4.7 Dual-Channel Version Sync

npm and Homebrew must publish the same version. Version drift between channels is not acceptable (ADR-002).

**Homebrew formula update** (after npm publish):
- If using a GitHub release tarball: update the formula's `url` and `sha256` to point to the new release
- If using npm as source: update the formula's version and checksum
- Verify: `brew install scaffold && scaffold --version` matches the npm version

Homebrew formula maintenance is a manual step per release. Consider automating via a GitHub Action that creates a PR to the Homebrew tap repository after each release.

---

## 5. Rollback & Recovery

### 5.1 Bad npm Release

**Within 72 hours of publish**:
```bash
npm unpublish @scaffold-cli/scaffold@<bad-version>
```
Then fix the issue and publish a new patch version.

**After 72 hours** (npm prevents unpublish):
```bash
npm deprecate @scaffold-cli/scaffold@<bad-version> "Known issue: <description>. Use <good-version> instead."
```
Deprecated versions show a warning on install but remain available.

### 5.2 Homebrew Rollback

Revert the Homebrew formula PR in the tap repository. Users receive the previous version on their next `brew update && brew upgrade`.

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
npm pack @scaffold-cli/scaffold@<version>         # Download published tarball
diff <(tar tzf local.tgz | sort) <(tar tzf published.tgz | sort)
```

Fix `.npmignore` or `files` in `package.json`, then publish a patch.

### 5.5 Security Vulnerability Discovered

1. Run `npm audit` to identify the vulnerable dependency
2. If a fix is available: `npm audit fix`, run tests, publish a patch
3. If no fix is available: evaluate the impact. For high/critical vulnerabilities, consider replacing the dependency or pinning a non-vulnerable version
4. For vulnerabilities in scaffold itself: fix, patch release, and file an npm security advisory if the vulnerability affects end users

---

## 6. Security Practices

### 6.1 No Credentials in Code

Scaffold stores no API keys, tokens, or credentials (PRD §18). The CLI makes no authenticated requests. There is no `.env` file and no secrets manager integration.

### 6.2 No Network Access

The CLI makes no network requests except `scaffold update` (which checks the npm registry for newer versions). All operations are local filesystem reads and writes.

### 6.3 CI Security

- `npm audit --audit-level=high` runs in CI — fails the build on high or critical vulnerabilities
- `npm ci` (not `npm install`) ensures deterministic builds from the lockfile
- npm publish requires **2FA** enabled on the publishing npm account
- npm provenance attestation (`--provenance`) links published packages to their source commit

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
| npm download stats | `npm info @scaffold-cli/scaffold` or [npmjs.com](https://npmjs.com) dashboard | Weekly |
| Bug reports | GitHub Issues | Daily triage |
| Feature requests | GitHub Discussions or Beads | Weekly review |
| npm audit advisories | `npm audit` locally or Dependabot alerts | Continuous (CI) |

### 7.2 Dependency Updates

- Run `npm outdated` monthly to identify available updates
- Configure **Dependabot** or **Renovate** for automated dependency update PRs
- Group minor/patch updates into single PRs to reduce noise
- Test thoroughly before merging major dependency updates (especially yargs, vitest, TypeScript)

### 7.3 Node.js Version Lifecycle

Track the [Node.js release schedule](https://nodejs.org/en/about/releases/):

| Action | When |
|--------|------|
| Add new LTS to CI matrix | When a new even-numbered version enters LTS |
| Remove EOL version from CI matrix | When a version reaches End of Life |
| Update `engines.node` minimum | When the oldest supported LTS reaches EOL |
| Update `.nvmrc` | When the recommended development version changes |

As of 2026: Node 18 is the minimum, Node 22 is the Codex target. When Node 18 reaches EOL (April 2025 — already EOL), update `engines.node` to `>=20` and drop Node 18 from the CI matrix.

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

### 7.5 Documentation Drift

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
git clone <repo-url>
cd scaffold
npm install                                       # Install dependencies
npm test                                          # Verify setup works
bd ready                                          # Find available work
bd update <id> --claim                            # Claim a task
# ... implement with TDD (write test → red → green → refactor) ...
npm run check                                     # All quality gates
git commit -m "[BD-<id>] type(scope): description"
bd close <id>                                     # Mark task complete
```

See CLAUDE.md for the full Beads workflow and commit message format.

### 8.2 Common Workflows

**Adding a new CLI command**:
1. Create `src/cli/commands/<name>.ts` with yargs command module structure
2. Create co-located test `src/cli/commands/<name>.test.ts`
3. Register command in `src/cli/commands/index.ts`
4. Write failing test → implement → verify

**Modifying the assembly engine**:
1. Read `src/core/assembly-engine.ts` and its test file
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
