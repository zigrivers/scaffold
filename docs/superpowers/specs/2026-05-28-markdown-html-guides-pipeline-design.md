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
→ rehype-raw → [custom hast transforms for the 6 directives]
→ rehype-sanitize (custom schema, see Security) → rehype-stringify
→ wrap in template.ts (inline theme CSS + chrome.js + TOC)
```

New dependencies (all small, ESM, same family): `remark-directive`,
`remark-rehype`, `rehype-raw`, `rehype-sanitize`, `rehype-stringify`. Dev-only
for diagrams: `@mermaid-js/mermaid-cli` (`mmdc`) — chosen as the **single**
renderer (see Diagrams). The repo has **no** Playwright in `package.json`/CI
today (only an MCP mention in CLAUDE.md), so "reuse Playwright" is not an option
without adding it; `mmdc` keeps the diagram dependency self-contained.

### Chrome for free (`src/guides/template.ts` + `chrome.js`)
Injected into **every** guide; never hand-authored:
theme toggle (localStorage + OS pref), sidebar TOC (built from heading nodes),
scrollspy (IntersectionObserver), mobile nav drawer, copy-to-clipboard, skip link,
and the shared `tab()` / filter / sort helpers that the content directives target.
The template inlines the theme CSS into `<style>` and stamps a
`data-chrome-version="<n>"` attribute on `<html>` (see Drift gate) so chrome
changes are detectable.

**Theme CSS resolution (packaging-safe).** `lib/dashboard-theme.css` is a
source-only directory — it ships in **neither** the npm tarball nor the
Homebrew `npm install` tree. So the generator must NOT read `lib/` at runtime.
Instead, the `build` script copies it into `dist/` at compile time (exactly as
the existing build already copies `knowledge-update-template.md` into `dist/`):
`tsc && cp lib/dashboard-theme.css dist/guides/dashboard-theme.css`. The
generator resolves the CSS via `getPackageRoot()` → `dist/guides/…`, which
exists in dev, npm-global, and brew alike. `dist/` is already in the `files`
array, so this is zero net packaging change.

### Content directive vocabulary (small, agent-readable)
Authored with `remark-directive` (bodies stay real markdown) + one fenced block:

| Directive | Renders |
|---|---|
| `:::callout{type=warning}` … `:::` | admonition box |
| `:::tabs` / `:::tab{title="…"}` … `:::` | tab group (compiles to `data-pane` + `tab()`) |
| `:::filter-table` wrapping a GFM table | filter input + `.hidden` JS |
| `:::chart{type=bar}` immediately preceding a GFM table | build-time static HTML/CSS bars (see Charts) |
| `:sev[P0]{level=p0}` (inline) | severity badge/chip |
| ` ```mermaid ` fenced block | static inline SVG (build-time) |

These six cover the entire MMR guide and the cheap parts of the others.

### Charts — `:::chart{type=bar}` (build-time, zero runtime deps)
A `:::chart{type=bar}` directive immediately **precedes** a GFM table. At build
time the generator reads that table (first column = label, last numeric column =
value) and emits **static HTML/CSS bars** — `<div>`s with `style="width:N%"` —
exactly the pattern the existing knowledge-freshness "top hosts" chart uses. **No
charting library, no canvas, no runtime JS, no new dependency.** The source GFM
table stays rendered in the DOM directly after the chart, so humans see both and
agents read the numbers from the markdown table. Accessibility: each bar carries
an `aria-label` built from its label+value; the table is the accessible data
source. `type=bar` is the only supported type this iteration (extensible later).

### Diagrams — mermaid → static inline SVG at build time
- Render via **`mmdc`** (`@mermaid-js/mermaid-cli`, devDependency — bundles a
  headless browser). Single chosen renderer. **Build-time only; never shipped;
  offline at view time** (output is inline `<svg>`).
- **SVG cache (checked in):** key = hash of `mermaid source + mmdc version +
  render options`; cached SVGs live at `partials/.mermaid-cache/<key>.svg` and are
  **committed**. The build renders a diagram only on a cache miss (source or
  renderer changed), so cold-cache CI and browser-less contributors build
  successfully for unchanged diagrams; a changed diagram with no browser fails
  loudly naming the cache path. Embedding the renderer fingerprint in the key
  prevents silently-stale SVGs after an `mmdc` bump.
- `guides build` requires a headless browser **only** when a diagram's source
  changed; `dev-setup.md` and the CI workflow document the browser install.
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

### Security & trust model
- **Trust model:** guide sources live in-repo and reach `main` only via reviewed
  PRs. That is the primary control. The measures below are defense-in-depth so a
  single bad PR can't silently ship arbitrary script to every npm/brew consumer.
- **Sanitize the markdown-derived HTML:** `rehype-sanitize` runs after the custom
  directive transforms with a **custom schema** that allowlists exactly what the
  six directives emit (e.g. `data-pane`/`data-tab` on tab nodes, `class` for
  severity chips and callout types, inline `<svg>` from mermaid, the chart bar
  divs and their `style="width:…"`/`aria-label`). Anything outside the schema is
  stripped, so a stray `<script>`/`onclick`/`iframe` in prose cannot pass.
- **Escape-hatch partials are template-injected, not author-free:** `partials/*`,
  `custom.css`, `custom.js` are injected by the template (outside the sanitized
  body) and are therefore the explicit, reviewed exception. The narrow-hatch lint
  (≤3 embeds, text-equivalent required) bounds their volume and forces review.
- **CI scan:** the drift-gate job greps every generated `index.html` for
  high-risk patterns (`<script>` outside the known chrome bundle, `on*=`
  handlers, `javascript:`/external `src`) and fails on an unexpected match —
  catching both an over-broad sanitize schema and a risky escape-hatch partial.

### CLI — `scaffold guides`
- `scaffold guides` → open index in browser (reuse dashboard opener)
- `scaffold guides <topic>` → open one guide
- `scaffold guides --list` (`--format json` for machines)
- `scaffold guides <topic> --markdown` → print markdown; `--print-path` → path to `index.md`
- `--no-open` honored throughout
- `scaffold guides build [--all]` → regenerate guide HTML + the index page from
  sources. This is a **source/maintainer-time** operation (dev, CI, and
  brew-build-from-source all have the full tree incl. the `dist/`-copied theme
  CSS). End users consume the **pre-built, checked-in** HTML and never invoke
  `build`; `--all` forces regeneration of every guide (used after a chrome change).

### Manifest & index
`buildGuidesIndex()` (mirrors `buildIndex()`) scans `content/guides/*/index.md`
frontmatter → powers both the generated index page and `guides --list`. Adding a
guide directory is the only step required.

### Drift gate
Generated guide `index.html` files and the index page are **checked in**. A `make`
target / CI job regenerates and runs `git diff --exit-code`, failing on staleness
(mirrors the generic citation-drift check) plus the security scan above.
Guarantees npm and brew ship identical, audited HTML.

**Chrome evolution.** Chrome (template + `chrome.js` + theme CSS) is shared, so a
chrome change must regenerate *every* guide or the gate fails. Each generated file
carries `data-chrome-version`; bumping the chrome version is the signal to run
`scaffold guides build --all` in the same PR. With one guide in this iteration the
cost is trivial; the marker and `--all` keep it bounded as guides are added.

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
| `src/guides/mermaid.ts` | mermaid source → cached inline SVG (build-time), fingerprinted key | `mmdc` |
| `src/guides/sanitize.ts` | `rehype-sanitize` custom schema allowlisting directive output | rehype-sanitize |
| `src/guides/template.ts` | wrap body in chrome + inline CSS/JS + `data-chrome-version` → full HTML | render.ts; `dist/guides/dashboard-theme.css` |
| `src/guides/index-page.ts` | generate index page from manifest | loader.ts, template.ts |
| `src/guides/lint.ts` | escape-hatch lint (text-equivalent required, warn >3 embeds), exported for CLI + tests | loader.ts |
| `src/cli/commands/guides.ts` | `guides` command (open/list/markdown/build) | loader.ts, dashboard opener |
| `getPackageGuidesDir()` in `src/utils/fs.ts` | resolve `content/guides` across dev/npm/brew | existing resolver pattern |
| `build` script + `make guides-check` (CI) | copy theme CSS → `dist/guides/`; regenerate + `git diff` + security scan | mermaid.ts, render.ts, lint.ts |

## Testing
- **TDD throughout.** Unit tests: each directive transform (input md → expected HTML
  fragment); manifest builder; mermaid cache hit/miss; escape-hatch lint (missing
  text-equivalent fails, >3 embeds warns).
- **Sanitize tests:** the custom schema passes all six directives' output and
  strips an injected `<script>`/`onclick`/`iframe`.
- **Golden/snapshot:** the **first generated** MMR `index.html`, manually reviewed,
  is committed as its own golden; subsequent runs diff against it (this is also the
  drift-gate baseline). The legacy hand-authored `mmr-reference.html` is used only
  as a **content-parity** reference, not a pixel/DOM baseline (the new pipeline's
  DOM — rehype output, auto-TOC, new chrome — differs by design, so visual identity
  to the old file would be brittle).
- **Playwright functional verification:** against the generated guide, assert
  behavior, not pixels vs the old file — tabs switch, filter hides rows, mermaid
  `<svg>` is present, theme toggle works, **no console errors** — at desktop +
  mobile, light + dark.
- **Drift gate test:** regenerate → `git diff --exit-code` is clean; security scan passes.

## Error handling
- Missing/invalid frontmatter → skip guide with a warning (matches `buildIndex` behavior).
- Mermaid render failure → fail the build loudly (diagrams are content, not optional).
- Browser unavailable + **changed** diagram (cache miss) → fail loudly naming the
  cache path and the install step; unchanged diagrams (cache hit) build fine.
- Missing `dist/guides/dashboard-theme.css` → fail with a message pointing at the
  `build` copy step (signals the package was built without it).
- `:::chart` not followed by a GFM table, or a non-numeric value column → fail the build.
- Unknown directive → render as a visible warning block, not silent drop.

## Smallest viable first step
Convert `docs/reference/mmr-reference.html` → `content/guides/mmr/index.md` +
generated `content/guides/mmr/index.html`. Zero escape-hatch; exercises tabs,
filter-table, and one mermaid diagram. Stand up `guides` command, manifest, index
page, sanitize schema, drift gate + security scan, and Playwright functional
verification with a committed self-golden. Migrate observability and
knowledge-freshness (and fix the latter's Google-Fonts violation) in follow-ups.

## Out of scope (this iteration)
- Migrating the observability and knowledge-freshness guides.
- A hosted docs site (GH Pages) — easy follow-up from the same markdown; bundled/offline is primary.
- AGENTS.md creation (reference from CLAUDE.md for now).
