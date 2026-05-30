---
title: Dashboard & Design System
topic: dashboard
description: The pipeline dashboard, its panels, the design-token system, and how to customize it safely
category: tools
order: 50
---

## What the dashboard is

Each dashboard is a single, self-contained HTML file that visualizes where a
Scaffold build stands: which pipeline steps are done and what to run next.
Everything is inlined (CSS, JS, data); there are no CDN fonts, stylesheets, or
scripts, so the file works offline and renders identically wherever you open it.

:::callout{type=warning}
**Two different producers — this guide documents the bash generator.** Scaffold
has two distinct dashboard surfaces that do **not** share markup, CSS, or
features:

- **`scaffold dashboard`** (the user-facing CLI) renders HTML from
  `src/dashboard/template.ts` + `generator.ts`. It has its own inline `<style>`
  block (classes like `.container`, `.phase-header`, `.summary-cards`), a
  **Decision Log** section, and standalone-command cards. It does **not** read
  `lib/dashboard-theme.css`, has **no** Beads task section, and does **not**
  inject the Build-Observability panels. The CLI writes the HTML to a temp file
  (or `--output <path>`) and opens it via `open` / `xdg-open` / `start`
  (:cite[src/cli/commands/dashboard.ts:64-66]).
- **`scripts/generate-dashboard.sh`** is the visual-test fixture that
  `make dashboard-test` runs. It embeds `lib/dashboard-theme.css`, renders a
  Beads task section, and injects the two Build-Observability panels. Its
  classes (`.phase-hdr`, `.pcard`, `.beads-section`) and design tokens are
  exclusive to this surface.

The rest of this guide documents the **`scripts/generate-dashboard.sh`**
surface — the one used for visual verification and the one that carries the
`lib/dashboard-theme.css` token system. The panels, classes, design tokens, and
inline JS described below belong to that generator, **not** to the
`scaffold dashboard` CLI command.
:::

## Reading the dashboard

The page is built top-to-bottom by the inline renderer in the generator. From
the header down:

| Region | Classes | What it shows |
| --- | --- | --- |
| Header | `.header`, `.header-meta`, `.theme-toggle` | Title, profile badge, project name + timestamp, light/dark toggle |
| Status legend | `.status-legend` | The four pipeline status badges (Done / Likely Done / Skipped / Pending) |
| Progress bar | `.progress-bar`, `.seg-done`, `.seg-likely`, `.seg-skip` | Proportional completion rail |
| Summary cards | `.cards`, `.card`, `.card-num` | Counts: completed, likely, skipped, pending, total, Beads-open |
| What's Next | `.next-banner`, `.next-cmd` | The recommended next command, with a copy button |
| Phases | `.phase`, `.phase-hdr`, `.pcard` | Collapsible phase sections, one prompt card per step |
| Beads Tasks | `.beads-section`, `.beads-filters` (container), `.beads-filter` (buttons) | Filterable task list (status + priority), cards open a detail modal |
| Build Progress / Audit | `#build-progress`, `#build-audit` | The two Build-Observability panels (only when populated) |

The header, legend, progress bar, summary cards, and What's Next banner are all
emitted in sequence by the renderer (:cite[scripts/generate-dashboard.sh:505-544]).

### The Build-Observability panels

After the pipeline content, the generator shells out to Build Observability and
splices its HTML fragments into the page between named HTML comment markers
(`<!-- observe:progress -->` … `<!-- /observe:progress -->` and the audit pair),
preferring a local `dist/index.js` build and falling back to a global `scaffold`
binary (:cite[scripts/generate-dashboard.sh:872-887]):

```bash
scaffold observe progress --render=dashboard-fragment       # → #build-progress panel
scaffold observe audit   --render=dashboard-fragment-audit  # → #build-audit panel
```

Each renders as a `<section class="panel">` — `#build-progress` for the live
timeline and `#build-audit` (carrying `data-verdict` and `data-threshold`) for
audit findings. If neither a local build nor a global `scaffold` is available the
markers stay empty and the panels simply don't appear. See the
[Build Observability guide](../observability/index.md){mode=advisory} for what
those panels report.

### Filters and modals (the inline JS)

The dashboard is interactive without any framework — a handful of vanilla
functions are inlined at the foot of the generated HTML:

- **Collapse a phase** — clicking a `.phase-hdr` calls `togglePhase()`, which
  toggles `.closed` on the header (rotating its arrow) and `.hidden` on the next
  sibling list (:cite[scripts/generate-dashboard.sh:825-828]).
- **Copy a command** — clicking a `.pcmd` calls `copyCmd()`, which writes the
  `data-cmd` value to the clipboard and flashes the `.copied` state for 1.5 s
  (:cite[scripts/generate-dashboard.sh:829-838]).
- **Filter Beads** — `filterBeads()` switches the active status filter and
  `filterBeadsPrio()` toggles priority filters; cards carry `data-bead-status`
  and `data-bead-priority` so the filters can show/hide them
  (:cite[scripts/generate-dashboard.sh:733-741]).
- **Beads task detail modal** — `openBeadModal(id)` builds a `.modal-overlay`
  detail view for a Beads task (status, priority, deps, timestamps); close via
  the X, Escape, or a backdrop click
  (:cite[scripts/generate-dashboard.sh:756-816]).
- **Prompt detail modal** — clicking a prompt card calls `openModal(slug)`,
  which renders the full prompt content for that pipeline step in the same
  `.modal-overlay` shell (:cite[scripts/generate-dashboard.sh:693-710]).
- **Audit finding filters** — on load, `initAuditFilters()` finds the
  `#build-audit` section, reads its `data-threshold`, and wires the
  `[data-filter]` buttons to show/hide `.finding` rows by severity rank
  (:cite[scripts/generate-dashboard.sh:839-863]).

## The design-token system

`lib/dashboard-theme.css` defines a shared set of CSS custom properties for
colors, spacing, sizes, and radii. Component styles should prefer these tokens
via `var(--token)` — that is what keeps light and dark mode in lockstep and the
surface coherent. The contract is "prefer tokens," not "tokens only": the file
still contains some component-level raw values (e.g. `#fff`, gradient stop hex
colors, `rgba(...)`, and a few one-off pixel values like `99px`, `720px`, and
`130px`). Promote a raw value to a token when it needs light/dark parity or
reuse; leave genuinely one-off structural values inline rather than minting a
single-use token.

### Colors — light + dark parity

The light palette is declared on `:root` (:cite[lib/dashboard-theme.css:11-35]),
and every color token has a matching override under `[data-theme="dark"]`
(:cite[lib/dashboard-theme.css:98-120]). Dark mode is not a filter — backgrounds
go dramatically darker, text lightens but stays slightly warm, and accents shift
lighter for contrast on dark surfaces.

:::filter-table
| token | light | dark | role |
| --- | --- | --- | --- |
| `--bg` | `#f5f6fa` | `#0f1117` | Page background |
| `--bg-card` | `#ffffff` | `#1a1d2e` | Card / panel surface |
| `--bg-inset` | `#e8eaf2` | `#141724` | Recessed elements (copy buttons, inputs) |
| `--text` | `#1a1d2e` | `#e2e5f0` | Primary text |
| `--text-muted` | `#6b7294` | `#7c82a8` | Secondary text |
| `--border` | `#dde0ed` | `#2a2f45` | Default borders |
| `--accent` | `#4f46e5` | `#818cf8` | Primary interactive color |
| `--green` | `#059669` | `#34d399` | Completed status |
| `--blue` | `#2563eb` | `#60a5fa` | Likely-completed status |
| `--yellow` | `#d97706` | `#fbbf24` | Warnings / blocked |
| `--gray` | `#9ca3af` | `#6b7294` | Skipped status |
:::

Each status color (`--green`, `--blue`, `--yellow`, `--gray`) also has `-bg` and
`-border` companions used by badges and status dots, so a status reads correctly
on both card and inset surfaces.

:::callout{type=note}
The table above is a high-level subset of the most visible status and surface
tokens — not the complete set. `lib/dashboard-theme.css` (and
`docs/design-system.md` §2) also define many component-specific semantic tokens
such as `--bg-hover`, `--text-faint`, the `--next-*`, `--progress-*`,
`--shadow-*`, `--accent-hover` / `--accent-glow`, and `--border-light`. Consult
the CSS file and §2 for the full system.
:::

### Spacing — the `--sp-*` scale

All spacing comes from an 8-step scale on a 4px base
(:cite[lib/dashboard-theme.css:63-71]). There are no ad-hoc margins or paddings;
layout is composed entirely from these:

| token | value | typical use |
| --- | --- | --- |
| `--sp-1` | `4px` | minimal gaps (dot margin) |
| `--sp-2` | `8px` | tight gaps (badge padding) |
| `--sp-3` | `12px` | card gap, prompt-card padding |
| `--sp-4` | `16px` | card inner padding, section gap |
| `--sp-5` | `20px` | banner padding |
| `--sp-6` | `24px` | section margin, page side padding |
| `--sp-8` | `32px` | page top/bottom padding |
| `--sp-10` | `40px` | major section separation, footer |

### Typography, radius & layout

The font stacks are system-only (no web fonts): `--font-sans` for body and
headings, `--font-mono` for commands, counts, and step numbers
(:cite[lib/dashboard-theme.css:74-75]). Sizes run on a `--text-xs` … `--text-2xl`
scale (:cite[lib/dashboard-theme.css:76-81]), paired with `--lh-*` line heights,
`--fw-*` weights, and `--ls-*` letter-spacing tokens. Surfaces use `--radius`
(10px) for cards/panels and `--radius-sm` (6px) for buttons and code blocks
(:cite[lib/dashboard-theme.css:26]); content is centered within `--max-w` (960px)
(:cite[lib/dashboard-theme.css:93]). Depth comes from a four-step shadow scale,
with `--shadow-lg` reserved for modals and overlays
(:cite[lib/dashboard-theme.css:61]).

## Customizing the dashboard safely

The dashboard's coherence is enforced by convention, not by a build step — so the
rules in `docs/design-system.md` are load-bearing (with the §6.1 caveat noted
below). Follow the add-a-token / add-a-component flow and stay inside the token
system.

:::callout{type=warning}
**Two rules that are never optional.** (1) **Prefer tokens for anything that
needs light/dark parity** — never hardcode a color, theme-dependent value, or
font name in a component style; if you need a value that doesn't exist, add a
*token* first. (Purely structural one-offs may stay inline — see the token
section above.) (2) **Always ship both modes** —
every new color token needs a `:root` value *and* a `[data-theme="dark"]`
override, and every change must be checked in light *and* dark. Skipping the dark
override leaves the token undefined in dark mode and breaks the surface.
:::

To add a token: declare it on `:root` in the light section of
`lib/dashboard-theme.css`, add the dark override under `[data-theme="dark"]`,
then reference it as `var(--token)`. Note that `docs/design-system.md` §6.1 is
stale here — it still says to add the dark override to a
`@media (prefers-color-scheme: dark)` block, but no such block exists in
`lib/dashboard-theme.css`; the dark tokens live only under the `[data-theme="dark"]`
attribute selector. Follow the code, not §6.1. To add a component: add its styles to the right section of the
theme file, reuse existing tokens (add new ones first if needed), wire its markup
into the generator JS, and document it in §3. New components should reuse
established patterns — for example, collapsible sections reuse the same
`.phase-hdr` + `togglePhase()` mechanism as pipeline phases, and detail views
reuse `.modal-overlay`.

Also avoid: `!important` (restructure selectors instead), any second theme
mechanism (the `[data-theme]` toggle is the only one), and external resource
references — the generated HTML must stay self-contained. Dark mode is driven by
the inline bootstrap that reads `localStorage.getItem('scaffold-theme')`, falling
back to `prefers-color-scheme` on first visit
(:cite[scripts/generate-dashboard.sh:438]), and the `.theme-toggle` button flips
the `[data-theme]` attribute and persists the choice via
`localStorage.setItem('scaffold-theme', …)`
(:cite[scripts/generate-dashboard.sh:817-823]).

## Visual testing

Reference guides are verified manually with a screenshot, and the dashboard
itself is verified the same way: after any change to
`scripts/generate-dashboard.sh`, `lib/dashboard-theme.css`, or a dashboard test,
render it and look at it in a browser. There is no pixel-diff gate — a human (or
an agent driving Playwright MCP) confirms the rendering.

```bash
make dashboard-test   # writes tests/screenshots/dashboard-test.html
```

Then drive Playwright MCP over the generated file: `browser_navigate` to its
`file://` path, `browser_resize` to 1280×800 then 375×812, take a
`browser_take_screenshot` at each. For dark mode, don't rely on emulating
`prefers-color-scheme` after the page has loaded — the inline bootstrap reads it
only once, so the page stays on whatever `[data-theme]` is already set. Instead,
either set `localStorage('scaffold-theme', 'dark')` and reload, or click the
`.theme-toggle` button; then confirm
`document.documentElement.dataset.theme === 'dark'` **before** capturing the
dark screenshots (and clear/set the key back for light shots). Also exercise the
interactive bits (expand/collapse a phase, a Beads filter, a modal), and
`browser_snapshot` to sanity-check accessibility.

The minimum coverage for any dashboard change is desktop + mobile in both light
and dark mode, plus the interactive elements, compared against the committed
baselines.

| Path | Role |
| --- | --- |
| `tests/screenshots/dashboard-test.html` | Generated test fixture (from `make dashboard-test`) |
| `tests/screenshots/baseline/` | Committed baselines |
| `tests/screenshots/current/` | New screenshots (gitignored); name `{feature}_{viewport}_{state}.png` |

Update a baseline only for an intentional visual change — copy the new shot from
`current/` to `baseline/` and commit it. Full workflow and naming live in
`docs/tdd-standards.md` §7 and the design rules in `docs/design-system.md`.
