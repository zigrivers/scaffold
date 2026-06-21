# Unified Cross-CLI Agent Integration — Design

**Status:** Design → build (autonomous). **Date:** 2026-06-21.
**Goal:** Make **both** Scaffold and MMR first-class on every supported CLI — not just Claude Code — add **OpenCode**, **drop Gemini**, and **unify** today's three fragmented integration mechanisms into one source-of-truth layer. Then overhaul the agent skills to a *balanced* coverage of each tool's real surface.

Decisions taken with the user:
- **Build it all** autonomously (design → consult → plan → build → review → merge → release).
- **Five first-class CLIs:** Claude Code, Codex, Antigravity, Cursor, OpenCode. **Gemini dropped entirely.**
- **Unify** into one coherent layer (kill the drift wart).
- **Balanced skills:** full core workflows + the most-requested commands, discovery pointers for the long tail.

---

## 1. Current state (grounded)

Three overlapping mechanisms, inconsistent coverage:

1. **Scaffold adapters** (`src/core/adapters/`) — generate per-platform *pipeline prompt files*. Registered: `claude-code`, `codex`, `gemini`, `universal`. **Missing: antigravity, cursor, opencode.**
2. **Scaffold skill-sync** (`src/core/skills/sync.ts`) — installs `scaffold-runner` + `scaffold-pipeline` SKILL.md skills into `.claude/skills/` + `.agents/skills/`. (Only 2 of 4 skills; only 2 targets.)
3. **MMR `mmr skill install`** (`packages/mmr/src/core/skill-install.ts`) — installs the review skill into `cursor` (`.cursor/rules/*.mdc`), `codex`/`antigravity` (`AGENTS.md` block), `gemini` (`GEMINI.md` block). **Missing: opencode; no SKILL.md skill form.**

Plus: the MMR skill content is **duplicated** (`content/skills/mmr/SKILL.md` ↔ `packages/mmr/templates/skills/*`), kept in sync by hand — the drift wart we already hit.

Only **Claude Code** is genuinely first-class. OpenCode is barely integrated (an opt-in review channel only).

## 2. The convergent standards (from research)

| Standard | Hosts that consume it | Form |
|----------|----------------------|------|
| **Agent Skills `SKILL.md`** | Claude Code (`.claude/skills/`), OpenCode (`.opencode/skills/`, **also reads `.claude/skills/` + `.agents/skills/`**) | per-skill dir: `SKILL.md` (frontmatter `name`+`description` required; progressive disclosure via `references/`, `scripts/`, `assets/`); auto-discovered |
| **`AGENTS.md` project rules** | Codex, Antigravity, OpenCode (CLAUDE.md fallback) | single root file; we manage a delimited block |
| **Cursor rules** | Cursor | `.cursor/rules/*.mdc` (frontmatter `description`/`globs`/`alwaysApply`; keep lean) |
| ~~Gemini `.toml` commands~~ | ~~Gemini~~ | **dropped** |

**Key consequence:** `SKILL.md` is now a near-universal skill format (Claude Code + OpenCode), and `AGENTS.md` is the near-universal rules format (Codex + Antigravity + OpenCode). So "first-class everywhere" = **render one canonical skill into (a) a `SKILL.md` skill, (b) an `AGENTS.md` block, (c) a Cursor `.mdc`** — and place them at the right paths per host.

### Per-CLI install matrix (target)

| CLI | Skill form it gets | Path | Notes |
|-----|--------------------|------|-------|
| **Claude Code** | `SKILL.md` (full) | `.claude/skills/<name>/SKILL.md` | auto-discovered |
| **OpenCode** | `SKILL.md` (full) + AGENTS.md block | `.opencode/skills/<name>/SKILL.md` + `AGENTS.md` | reads `.claude`/`.agents` too; explicit `.opencode/` is clearest |
| **Codex** | `AGENTS.md` block (condensed) | `AGENTS.md` (managed block) | no SKILL.md auto-load |
| **Antigravity** | `AGENTS.md` block (condensed) | `AGENTS.md` (managed block) | shares the AGENTS.md block with Codex |
| **Cursor** | `.cursor/rules/*.mdc` (condensed) | `.cursor/rules/<name>.mdc` | lean rule pointing at the CLI |

## 3. The unified layer (architecture)

A single **agent-integration core** (shared in the monorepo) with:

- **Canonical skill source** — one body per skill (Markdown with frontmatter), the single source of truth. No duplication.
- **Renderers** — pure functions: `renderSkillMd(skill, vars)`, `renderAgentsBlock(skill)`, `renderCursorMdc(skill)`. (The `SKILL.md` render is the full body; the AGENTS.md/Cursor renders are condensed — a summary + the canonical command examples + a pointer.)
- **Targets** — per-CLI specs `{ platform, form, targetPath, mode: file|block|skill-dir }`, the union of what Scaffold and MMR install.
- **One installer** used by both `scaffold skill install` and `mmr skill install` (MMR depends on the shared core, or the core lives in a place both import). Idempotent managed blocks for `AGENTS.md`; dir-based for `SKILL.md`; `--force` for dedicated files.

Both tools' skills (scaffold-runner, scaffold-pipeline, multi-model-dispatch, mmr) flow through the same renderers and targets. **Coverage and content can no longer drift** because there's one source and one installer.

> **Scaffold adapters** (pipeline-prompt generation) are a *separate* concern from skills/rules. They still need antigravity/cursor/opencode coverage, but the OpenCode adapter is the only genuinely new generator needed (`.opencode/command/<slug>.md` custom commands with `$ARGUMENTS`); Antigravity reads `AGENTS.md` (Codex adapter output applies); Cursor consumes `.cursor/rules` (skills layer) + runs `scaffold run` from its terminal.

## 4. OpenCode first-class

- **Skills:** add `opencode` target → `.opencode/skills/<name>/SKILL.md` (full skill). (Also covered transitively by `.claude/skills`/`.agents/skills`, but explicit is clearest.)
- **Rules:** `AGENTS.md` block already applies (OpenCode reads it).
- **Scaffold pipeline:** new `OpenCodeAdapter` → `.opencode/command/scaffold/<slug>.md` custom commands (+ `AGENTS.md` managed content like the Codex adapter).
- **MMR review channel:** `opencode` already exists, hardened (`OPENCODE_PERMISSION='{"*":"deny"}'`, neutral cwd, `--pure`). **Open question:** enable by default now that it's first-class, or keep opt-in. (§7 OQ4.)
- **Docs:** surface the hardening + `opencode auth login` recovery.

## 5. Dropping Gemini

- Remove the **`GeminiAdapter`** and its `.gemini/*.toml` output + `KNOWN_PLATFORMS` entry.
- Remove **`gemini`** from MMR `SKILL_PLATFORMS` + the `templates/skills/gemini/` template.
- The MMR **`gemini` review channel**: remove from `BUILTIN_CHANNELS`. **Open question:** clean removal vs. a tombstone that keeps existing `.mmr.yaml` files loading (§7 OQ3). Must not crash configs that still name `gemini`.
- Scrub Gemini from docs/skills (CLAUDE.md, guides, templates), replacing with Antigravity where relevant.

## 6. Skills overhaul (balanced)

Apply current best practices to every skill, and close the audited gaps:
- **Descriptions:** tighten to *what + when to trigger* (the only preloaded field).
- **Directives as commands** ("MUST/ALWAYS"), progressive disclosure (`references/` for long tail), keep Cursor/alwaysApply bodies lean.
- **Add core coverage** (from the audit): MMR — `jobs`, `sessions`, `ack`, `reconcile`, `commands`, `explain`, `config init`; Scaffold — `adopt`, `observe`, `guides`, `knowledge`, `decisions`. Plus discovery pointers (`mmr commands`/`mmr explain`/`scaffold guides`) for the rest.
- **Verify against the live surface** — every command/flag taught must exist (`mmr commands --json`, `scaffold list`).

## 7. Open questions (→ multi-model consult)

- **OQ1 — Source-of-truth & code sharing.** Where does the canonical skill content live, and how do `scaffold` + `packages/mmr` share the installer core (a shared internal module? mmr owns its skill and scaffold imports the package? a generated bundle)? Avoid a circular dep.
- **OQ2 — Renderer fidelity.** For `AGENTS.md`/Cursor (no progressive disclosure), what's the right condensation of a full skill — summary + canonical examples + "run `mmr commands`/`scaffold guides` for the rest"? One block per tool, or a combined block?
- **OQ3 — Gemini channel removal.** Hard-remove `gemini` from builtins vs. keep a disabled tombstone, so an existing `.mmr.yaml` naming `gemini` doesn't error. Which is least-breaking?
- **OQ4 — OpenCode channel default.** First-class ⇒ enable the `opencode` review channel by default (it's sandboxed/deny-all), or keep opt-in for safety/consent?
- **OQ5 — Cursor pipeline depth.** Does Cursor need a pipeline adapter, or is "skills/rules + run `scaffold` in the terminal" the right first-class bar for an IDE host?
- **OQ6 — Versioning/release.** Both packages change. Scaffold minor; MMR — dropping the gemini channel is arguably breaking ⇒ MMR major (4.0.0) or a careful non-breaking tombstone (minor)?

## 8. Phased roadmap (each: TDD → PR → multi-model review → merge)

1. **Drop Gemini** — remove adapter, skill platform/template, review channel (per OQ3), scrub docs. *Cleanup first; shrinks the surface everything else touches.*
2. **Unified integration core** — canonical skill source + renderers + targets + one installer, shared by both tools; migrate the MMR skill duplication onto it (single source). Backward-compatible install outputs.
3. **OpenCode first-class** — `opencode` skill target, `OpenCodeAdapter`, channel posture (per OQ4), docs.
4. **Antigravity + Cursor Scaffold parity** — ensure both get first-class scaffold skills/rules via the unified layer (and an Antigravity/Cursor adapter only if §3 says so).
5. **Skills overhaul** — balanced rewrite of all skills against the audit + best practices, verified against the live CLI surface.
6. **One consolidated release** — scaffold + mmr version bumps, CHANGELOGs, tags, npm + Homebrew, GitHub releases; verify; notify.

(Phase boundaries may shift after the §7 consult.)
