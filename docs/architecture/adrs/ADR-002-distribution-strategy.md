# ADR-002: Distribution Strategy — npm Primary, Homebrew Secondary

**Status**: accepted
**Date**: 2026-03-13
**Deciders**: v2 spec
**Domain(s)**: 09
**Phase**: 2 — Architecture Decision Records

---

## Context

Scaffold v2 needs a distribution mechanism that gets the CLI into developers' hands with minimal friction. The target user base includes solo AI-first developers using Claude Code or Codex, team leads standardizing AI workflows, and methodology authors extending the pipeline. These users span macOS and Linux (Windows via WSL), and many already have Node.js installed because Codex requires it.

Key distribution requirements:
- Zero-install trial experience (try before committing)
- Global install for regular users
- Version pinning for teams
- Update mechanism (`scaffold update`)
- Must include all built-in methodologies and prompt files in the distributed package

The v1 distribution model (git clone + `make install` to copy command files) does not scale to a broader user base.

## Decision

Use **npm/npx as the primary distribution channel**. Provide a **Homebrew formula as the secondary channel** for macOS/Linux users who prefer native package management or do not have Node.js installed for other reasons. Maintain **manual source install via git clone** for development and contribution workflows.

Distribution channels:
1. **npx** (zero-install): `npx scaffold init` — runs without prior installation
2. **npm global** (persistent install): `npm install -g <package-name>` — installs the `scaffold` binary globally
3. **Homebrew** (native macOS/Linux): `brew install scaffold` — installs without requiring Node.js to be user-managed
4. **Source** (development): `git clone` + `npm install` + `npm link`

## Rationale

- **npx zero-install**: The most frictionless onboarding path. A developer can run `npx scaffold init` to try the tool without committing to a global install. This is critical for the "Solo AI-First Developer" persona (Alex) who wants to scaffold a project quickly.
- **Node already required for Codex**: Codex CLI requires Node.js 22+. Users targeting Codex already have Node and npm available, making npm distribution zero-cost for this primary user segment.
- **Mature ecosystem**: npm handles versioning, dependency resolution, binary linking (`bin` field in package.json), and platform-specific post-install scripts. These are solved problems.
- **Homebrew for Node-free users**: Some developers use Claude Code without Codex and may not have Node installed. A Homebrew formula provides a native-feeling installation path that manages the Node runtime dependency transparently (Homebrew handles installing Node as a dependency of the formula).
- **Source install for contributors**: Methodology authors and contributors need to work from source. The standard `git clone` + `npm install` + `npm link` workflow is well-understood.

## Alternatives Considered

### Homebrew-only

- **Description**: Distribute exclusively through Homebrew. No npm package.
- **Pros**: Native macOS/Linux feel. Single distribution channel to maintain. No npm namespace research needed.
- **Cons**: No Windows support (even via WSL, Homebrew is uncommon). No npx zero-install trial experience. Misses the Node/Codex synergy — users who already have npm would need to use a separate package manager. Homebrew is macOS-centric; Linux Homebrew (Linuxbrew) has lower adoption.

### Docker

- **Description**: Distribute as a Docker image. Users run `docker run scaffold init`.
- **Pros**: Fully isolated environment. No host dependencies. Reproducible across platforms.
- **Cons**: Docker is heavyweight for a CLI tool (image size, startup time). Poor interactive terminal support — the init wizard's adaptive prompts require a TTY, which Docker provides inconsistently across platforms. Users must mount project directories as volumes, adding friction. Docker Desktop licensing costs for commercial use.

### Single-binary (pkg/nexe/vercel pkg)

- **Description**: Compile the Node.js application into a standalone binary with bundled runtime. Distribute via GitHub releases.
- **Pros**: No runtime dependency for end users. Single file to download. Fast distribution for CI/CD environments.
- **Cons**: Large binary size (50-80MB with bundled Node runtime). Harder to debug (no source access in production). Loses npm ecosystem integration (no npx, no npm scripts). pkg/nexe have maintenance concerns (pkg is archived). Would still need a separate distribution mechanism (GitHub releases, Homebrew) for discovery and updates.

### pip (Python package)

- **Description**: Distribute as a Python package via PyPI.
- **Pros**: Large developer install base. Familiar `pip install` workflow.
- **Cons**: Contradicts ADR-001 (Node.js implementation). Python version and virtual environment management is a known pain point. No equivalent to npx zero-install.

## Consequences

### Positive
- npx zero-install enables frictionless trial — developers can evaluate scaffold without committing to installation
- npm global install is familiar to Node developers and automatically handles PATH setup
- Homebrew provides a native-feeling alternative for macOS/Linux users
- Version pinning via `package.json` devDependencies enables team-wide consistency
- `scaffold update` can check npm registry for newer versions and suggest upgrade commands

### Negative
- Users without Node.js who are not on macOS/Linux (i.e., Windows without WSL) have no straightforward install path — they must install Node first
- Two distribution channels (npm + Homebrew) must be kept in version sync — release process must update both
- npm namespace must be researched and secured before Phase 1 implementation can begin

### Neutral
- Package name: `@scaffold-cli/scaffold`
- Homebrew formula maintenance is an ongoing but low-effort task (update formula on each release)

## Constraints and Compliance

- The npm package MUST include all built-in methodologies, base prompts, and mixin files — users must not need to download additional content after installation
- The Homebrew formula MUST pin to the same version as the npm package — version drift between channels is not acceptable
- `scaffold update` MUST work for both npm and Homebrew installations, detecting the install channel and providing the appropriate upgrade command
- The npm package name MUST be resolved before Phase 1 implementation begins (spec Resolved Design Question #5)
- The `bin` field in package.json MUST register the `scaffold` command name
- See domain 09, Section 7 (External Dependencies) for the complete dependency list that must be included in the npm package

## Related Decisions

- [ADR-001](ADR-001-cli-implementation-language.md) — Node.js as implementation language (prerequisite for npm distribution)
- [ADR-003](ADR-003-standalone-cli-source-of-truth.md) — CLI as source of truth (the distributed package IS the product)
- Domain 09 ([09-cli-architecture.md](../domain-models/09-cli-architecture.md)) — CLI architecture including package structure
