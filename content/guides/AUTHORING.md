# Authoring Scaffold Guides

This is the single source of truth for the **guides markdown dialect** — the
frontmatter, directives, and citation syntax used by every guide under
`content/guides/<topic>/index.md`. Markdown is the source of truth; the HTML is
generated. Agents read the markdown, so everything here must degrade to readable
prose.

> **Where guides live.** A guide is a directory `content/guides/<topic>/` with an
> `index.md`. The directory name **must** equal the frontmatter `topic`. This
> file (`content/guides/AUTHORING.md`) is not a guide and is not rendered or
> gated — its examples below are illustrative only.

## Build & check

| Command | What it does |
|---|---|
| `scaffold guides --build` | Render every `index.md` → self-contained `index.html` + the index page. |
| `scaffold guides --list --format json` | Discovery (for agents). |
| `make check-all` | Runs `guides-check` (lint + build freshness) **and** `check-reference-citations` (citation drift, incl. all guides). |

Regenerate and commit `index.html` after editing any `index.md` — the drift gate
enforces freshness.

## Frontmatter (required)

```yaml
---
title: Build Observability          # display title
topic: observability                # MUST equal the directory name
description: One-line scope shown in the guide index
category: tools                     # concepts | reference | workflows | tools
order: 40                           # sort order in the index (lower first)
---
```

Optional: `escape_scripts: [name.js]` — allowlist of script files an `:::embed`
may reference.

## Citations — `:cite` (the provenance contract)

Cite the code that backs a claim so the **citation-drift gate**
(`scripts/check-reference-citations.mjs`) can verify the file:line still exists.
Guides are discovered by the gate automatically — no registration needed.

| Syntax | Renders | Gate behavior |
|---|---|---|
| `:cite[src/observability/engine/api.ts:42]` | `<span class="fp" data-path="…">src/observability/engine/api.ts:42</span>` | **Blocking** — drift fails `make check-all` |
| `:cite[src/foo.ts:42-58]` | range citation | **Blocking** |
| `:cite[docs/git-workflow.md:120]{mode=advisory}` | `<span class="cite-advisory" …>` | **Advisory** — warns, never blocks |

**P0-a — when to use which:**
- Use **`:cite[…]`** (blocking) for a citation that **backs a normative claim**
  ("the worker transitions to `PAGED_PASSED` — `:cite[…]`"). If the line moves or
  the file shrinks, the gate fails so you re-anchor it.
- Use **`:cite[…]{mode=advisory}`** for "see also" pointers where exact-line
  drift shouldn't break CI.

The gate verifies the **line exists**, not that it still points at the right
symbol — semantic drift needs human review.

## Directives

All directives are first-class (parsed, rendered, sanitized). Prefer them over
raw HTML.

### `:::callout{type=…}`
Types: `note` (default), `tip`, `warning`, `danger`, `info`. Unknown → `note`.
```
:::callout{type=warning}
Teardown harvests the ledger **before** `git worktree remove`.
:::
```

### `::::tabs` / `:::tab{title="…"}`
Use a **4-colon** outer fence wrapping 3-colon tabs. **Always quote the title** —
an unquoted title with parentheses, slashes, or other punctuation (e.g.
`{title=mvp (depth 1)}` or `{title=CLI / library}`) fails to parse and leaks the
raw `:::tab{…}` text into the page:
```
::::tabs
:::tab{title="npm"}
`npm install -g @zigrivers/scaffold`
:::
:::tab{title="CLI / library"}
…
:::
::::
```

### `:::filter-table`
Wraps a GFM table and prepends a client-side filter box. Body is a normal GFM
table.

### `:::chart{type=bar}`
Renders proportional bars **from a GFM table** and keeps the table. The **label**
is the first column; the **value** is the **last column and must be numeric**.
This is the stable, non-HTML target a generator emits for baked numeric data
(e.g. live host counts):
```
:::chart{type=bar}

| Host | Citations |
|---|---|
| github.com | 40 |
| npmjs.com | 10 |
:::
```
**Error:** a `:::chart` without a GFM table fails the build.

### `:sev[label]{level=…}`
Inline severity chip. Levels: `p0`, `p1`, `p2` (default), `p3`, `pass`. Unknown → `p2`.
`A :sev[P0]{level=p0} finding.`

### Mermaid
Fenced ```` ```mermaid ```` blocks render to inline SVG for humans and stay
readable as text for agents. Default to mermaid for diagrams.

## Escape hatch — `:::embed{…}` (narrow, discouraged)

For genuinely one-off interactivity a first-class directive can't express. Every
`:::embed` **must contain a text-equivalent** (the word "text-equivalent" in the
body) or the build **errors** — agents must still understand the content. Using
**more than 3** embeds in a guide emits a warning: prefer first-class directives.

## Proposing a new directive

A new directive is warranted only when content recurs across guides and the
escape hatch can't serve it without losing agent-readability. To propose one:
1. Add a `remark<Name>` transform in `src/guides/directives.ts` (mirror the
   existing `textDirective`/`containerDirective` patterns).
2. Allow any new attributes/elements in `src/guides/sanitize.ts`.
3. Register it in the plugin list in `src/guides/build.ts`.
4. TDD: add `src/guides/directives-<name>.test.ts` (render via `renderGuideBody`).
5. Document it here.

## Authoring checklist (required reading for Phase 3 authors)

- [ ] Frontmatter complete; `topic` == directory name.
- [ ] Code-backed claims carry a blocking `:cite`; "see also" links use
      `{mode=advisory}` or relative markdown links.
- [ ] Inter-guide links are relative and resolve (the relative-link validator runs in `guides-check`).
- [ ] Diagrams use mermaid; data uses `:::chart`/GFM/`:::filter-table`; no raw HTML.
- [ ] `:::embed` only where unavoidable, with a text-equivalent.
- [ ] `scaffold guides --build` run and `index.html` committed.
- [ ] `make check-all` green (citations resolve; build clean).
