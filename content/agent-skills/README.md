# Canonical agent skills (single source of truth)

Each `content/agent-skills/<name>/SKILL.md` here is the **one** source for that
skill. A build step renders it into every per-platform form, so the installed
files can no longer drift apart.

## How it works

`scripts/generate-agent-skills.mjs` uses the renderers in
`packages/agent-integration` to fan each canonical source out to its targets:

| Target | Form | Consumed by |
|--------|------|-------------|
| `content/skills/<name>/SKILL.md` | full `SKILL.md` (frontmatter + body) | Scaffold install → Claude Code / OpenCode |
| `packages/mmr/templates/skills/agents/<name>.md` | the lean body | `mmr skill install` → `AGENTS.md` block (Codex/Antigravity) |
| `packages/mmr/templates/skills/cursor/<name>.mdc` | lean `.mdc` (frontmatter + body) | `mmr skill install` → Cursor |

The **lean** form (for `AGENTS.md` / Cursor standing instructions) is the region between `<!-- lean:start -->` and `<!-- lean:end -->`
in the canonical source; the **full** form is the whole body.

## Editing

1. Edit the canonical `content/agent-skills/<name>/SKILL.md` — **never** the
   generated files (the drift gate will reject a hand-edited target).
2. Run `npm run gen:skills` (or `node scripts/generate-agent-skills.mjs`).
3. Commit the canonical source **and** the regenerated targets together.

`make agent-skills-check` (part of `make check-all`, run in CI) fails if any
generated target is out of date.

## On-demand reference pages

Keep the trigger description concise and the entry file a task or phase router.
Store operational detail in `content/agent-skills/<name>/references/*.md` (flat
Markdown files); the same generator copies these into `content/skills` and checks
for drift. Full skill installations and plugin bundles include these pages and
resolve `{{INSTRUCTIONS_FILE}}` inside them. Link from the entry using
`references/<page>.md`, and between reference pages using `<page>.md`.

Codex, Antigravity, and Cursor native installs also place the full skill and its
references in `.agents/skills/<name>/`; their lean rules point there. OpenCode
uses `.opencode/skills/<name>/`. Existing dedicated skill/reference files are
preserved unless `--force` is requested. Review local customizations before a
forced upgrade; automatic sync does not replace existing skill bundles.
