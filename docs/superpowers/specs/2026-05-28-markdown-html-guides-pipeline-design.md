# Markdown→HTML Reference Guides Pipeline — Design

**Date:** 2026-05-28
**Branch:** `feat/docs-guides-pipeline`
**Status:** Approved for spec review (design decisions confirmed)

## Problem

Scaffold ships rich, single-file HTML reference guides that help both humans and
AI agents understand key features. Today these guides are **hand-authored HTML**
(`docs/reference/mmr-reference.html` and two others), which is laborious, drifts
from the prose docs, and is unreadable to agents (who should consume markdown).

We want **markdown as the source of truth**, with HTML **generated** from it,
**without losing** the interactivity and rich elements (theme toggle, TOC, tabs,
filterable/sortable tables, diagrams, callouts, badges, copy buttons). Diagrams
default to **mermaid** so the same source serves humans (rendered SVG) and agents
(readable text).

## Confirmed decisions

| Decision | Choice |
|---|---|
| Human-facing command name | **`guides`** (avoids `--scope docs` overlap; `help` is shadowed by yargs) |
| Generated-HTML drift management | **Check in HTML + CI drift gate** (npm/brew parity; mirrors citation-drift check #425) |
| Escape-hatch width | **Narrow + lint warning** (text-equivalent required per embed; warn past ~3 embeds/guide) |
| Initial implementation scope | **MMR proving-ground only** (convert `mmr-reference` first; migrate the other two later) |

## Discovery findings (ground truth)

### Existing guides (three, not one)
| Guide | Size | Self-contained? | Complexity |
|---|---|---|---|
| `docs/reference/mmr-reference.html` | 45 KB | yes | tabs, filter-table, 1 static SVG flow — **all cheap** |
| `docs/observability/reference.html` | 164 KB | yes | + CSS animations, click-to-open arch diagrams, flag-builder, sortable tables — **escape-hatch heavy** |
| `docs/knowledge-freshness/reference.html` | 277 KB | **no — Google Fonts CDN** | + vscode:// links, decision-search, test-pyramid, animated edges — **escape-hatch heavy** |

All three mirror `lib/dashboard-theme.css` tokens. MMR defines the cheap floor;
the other two define the escape-hatch ceiling (and one violates self-containment).

### Build & dependency landscape
- ESM, Node ≥18.17, **`tsc`-only** build (no bundler). CLI = **yargs**.
- Already depends on `unified`, `remark-parse`, `remark-gfm`, `remark-stringify`,
  `mdast-util-from-markdown`. **No** markdown→HTML renderer, **no** mermaid, **no** jsdom.
- Established pattern: `scripts/generate-dashboard.sh` + `src/observability/renderers/dashboard.ts`
  build self-contained HTML by inlining `lib/dashboard-theme.css` and concatenating strings.

### Packaging
- npm `files` = `["dist/","content/","skills/","README.md","LICENSE"]`. **`docs/` and `lib/` are NOT shipped.** `dashboard-theme.css` is only ever inlined at build time.
- Homebrew builds from the GitHub source tarball, then `npm run build`. Runtime asset
  resolution is `getPackageRoot()` (`import.meta.url`); all content resolvers look under `content/`.
- **Consequence:** placing guides under `content/guides/` ships them (md + html) via the
  existing `content/` entry with **zero packaging change**.

### CLI
- `dashboard.ts` already has the cross-platform opener (`open`/`xdg-open`/`start`, `--no-open`).
- House style: `--format json` (not `--json`), `resolveOutputMode()` + `createOutputContext()`.
- Frontmatter index pattern exists (`buildIndex()` in `knowledge-loader.ts`) to mirror.

## Architecture

### Authoring model — a guide is a directory
```
content/guides/<slug>/
  index.md            # source of truth (frontmatter + markdown + directives)
  partials/           # optional escape-hatch assets (*.svg, *.html)
  custom.css          # optional escape-hatch styles
  custom.js           # optional escape-hatch behavior
  index.html          # GENERATED, checked in (build artifact)
```
Frontmatter: `title`, `topic` (slug), `description`, `category`, `order`.

### Generator — unified remark→rehype pipeline
A new TS module (`src/guides/`) compiled by the existing `tsc` build:

```
remark-parse → remark-gfm → remark-directive → remark-rehype (allowDangerousHtml)
→ rehype-raw → [custom hast transforms] → rehype-stringify
→ wrap in template.ts (inline dashboard-theme.css + chrome.js + TOC)
```

New dependencies (all small, ESM, same family): `remark-directive`,
`remark-rehype`, `rehype-raw`, `rehype-stringify`. Dev-only for diagrams:
`@mermaid-js/mermaid-cli` **or** reuse the existing Playwright toolchain.

### Chrome for free (`src/guides/template.ts` + `chrome.js`)
Injected into **every** guide; never hand-authored:
theme toggle (localStorage + OS pref), sidebar TOC (built from heading nodes),
scrollspy (IntersectionObserver), mobile nav drawer, copy-to-clipboard, skip link,
and the shared `tab()` / filter / sort helpers that the content directives target.
CSS is inlined by `cat`-ing `lib/dashboard-theme.css` into `<style>` (dashboard pattern).

### Content directive vocabulary (small, agent-readable)
Authored with `remark-directive` (bodies stay real markdown) + one fenced block:

| Directive | Renders |
|---|---|
| `:::callout{type=warning}` … `:::` | admonition box |
| `:::tabs` / `:::tab{title="…"}` … `:::` | tab group (compiles to `data-pane` + `tab()`) |
| `:::filter-table` wrapping a GFM table | filter input + `.hidden` JS |
| `:::chart{type=bar from=table}` over a GFM table | bar chart (agent reads the table) |
| `:sev[P0]{level=p0}` (inline) | severity badge/chip |
| ` ```mermaid ` fenced block | static inline SVG (build-time) |

These six cover the entire MMR guide and the cheap parts of the others.

### Diagrams — mermaid → static inline SVG at build time
- Render via `mmdc` (devDependency, bundles headless browser) **or** the existing
  Playwright toolchain. **Build-time only; never shipped; offline at view time.**
- **SVG cache:** hash mermaid source → `partials/.mermaid-cache/<hash>.svg`. Unchanged
  diagrams skip rendering; warm cache lets browser-less contributors build; CI is reproducible.
- The MMR pipeline diagram is a `flowchart LR` fan-out→fan-in — mermaid reproduces it cleanly.

### Escape hatch — narrow + lint
Co-located `partials/`, `custom.css`, `custom.js`, opted into by a directive that
**requires** a markdown text-equivalent:
```
:::embed{src=partials/gantt.svg}
**Text equivalent (required):** Stall detection — a bar grows green→P2→P1→P0
as a task ages past the 6h threshold line.
:::
```
Rules: reach for the hatch only when no first-class directive fits; every embed must
carry a text-equivalent (lint-enforced); a lint **warns past ~3 embeds/guide**.
Charts are authored as GFM table + `:::chart` so no information lives only in pixels.

**Diagrams mermaid CANNOT reproduce (kept as escape-hatch SVG in later migrations):**
observability's animated Gantt/fix-loop/redaction visuals, and the click-to-open
`data-arch` architecture diagrams + animated dashed edges + multi-lane swimlanes in
observability & knowledge-freshness.

### CLI — `scaffold guides`
- `scaffold guides` → open index in browser (reuse dashboard opener)
- `scaffold guides <topic>` → open one guide
- `scaffold guides --list` (`--format json` for machines)
- `scaffold guides <topic> --markdown` → print markdown; `--print-path` → path to `index.md`
- `--no-open` honored throughout
- `scaffold guides build` → regenerate all HTML + `index.html` from sources

### Manifest & index
`buildGuidesIndex()` (mirrors `buildIndex()`) scans `content/guides/*/index.md`
frontmatter → powers both the generated index page and `guides --list`. Adding a
guide directory is the only step required.

### Drift gate
Generated `index.html` (+ `index.html` index page) are **checked in**. A `make`
target / CI job regenerates and runs `git diff --exit-code`, failing on staleness
(mirrors the generic citation-drift check). Guarantees npm and brew ship identical HTML.

### Agent access
Reference the guide set from `CLAUDE.md` (and `AGENTS.md` if added): agents read the
bundled `content/guides/<slug>/index.md`, never the HTML. `--markdown`/`--print-path`
give programmatic access; `--list --format json` gives discovery.

## Components & boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `src/guides/loader.ts` | scan `content/guides/`, parse frontmatter → manifest | fs, frontmatter parser |
| `src/guides/render.ts` | md+directives → hast → HTML body | unified/remark/rehype |
| `src/guides/directives.ts` | custom hast transforms for the 6 directives + embed | render.ts |
| `src/guides/mermaid.ts` | mermaid source → cached inline SVG (build-time) | mmdc/Playwright |
| `src/guides/template.ts` | wrap body in chrome + inline CSS/JS → full HTML | render.ts, dashboard-theme.css |
| `src/guides/index-page.ts` | generate index.html from manifest | loader.ts, template.ts |
| `src/cli/commands/guides.ts` | `guides` command (open/list/markdown/build) | loader.ts, dashboard opener |
| `getPackageGuidesDir()` in `src/utils/fs.ts` | resolve `content/guides` across dev/npm/brew | existing resolver pattern |
| lint + drift gate (`scripts/` + CI) | text-equivalent + embed-count + staleness | loader.ts, render.ts |

## Testing
- **TDD throughout.** Unit tests: each directive transform (input md → expected HTML
  fragment); manifest builder; mermaid cache hit/miss; escape-hatch lint (missing
  text-equivalent fails, >3 embeds warns).
- **Golden/snapshot:** generated MMR `index.html` snapshot.
- **Playwright visual verification:** generated MMR guide vs the existing hand-built
  `mmr-reference.html` as baseline — desktop + mobile, light + dark, tab/filter interactions.
- **Drift gate test:** regenerate → `git diff --exit-code` is clean.

## Error handling
- Missing/invalid frontmatter → skip guide with a warning (matches `buildIndex` behavior).
- Mermaid render failure → fail the build loudly (diagrams are content, not optional).
- Browser unavailable + cold cache → clear actionable error naming the cache path.
- Unknown directive → render as a visible warning block, not silent drop.

## Smallest viable first step
Convert `docs/reference/mmr-reference.html` → `content/guides/mmr/index.md` +
generated `content/guides/mmr/index.html`. Zero escape-hatch; exercises tabs,
filter-table, and one mermaid diagram. Stand up `guides` command, manifest, index
page, drift gate, and Playwright baseline. Migrate observability and
knowledge-freshness (and fix the latter's Google-Fonts violation) in follow-ups.

## Out of scope (this iteration)
- Migrating the observability and knowledge-freshness guides.
- A hosted docs site (GH Pages) — easy follow-up from the same markdown; bundled/offline is primary.
- AGENTS.md creation (reference from CLAUDE.md for now).
