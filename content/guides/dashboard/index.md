---
title: Dashboard & Design System
topic: dashboard
description: The pipeline dashboard, its panels, the design-token system, and how to customize it safely
category: tools
order: 50
---

## What the dashboard is

The dashboard is a single, self-contained HTML file that visualizes where a
Scaffold build stands: which pipeline steps are done, what to run next, the
in-flight Beads tasks, and — when Build Observability is wired up — live
build-progress and audit panels. Everything is inlined (CSS, JS, data); there
are no CDN fonts, stylesheets, or scripts, so the file works offline and renders
identically wherever you open it.

Open it with `scaffold dashboard`. The CLI assembles the dashboard data, writes
the HTML to a temp file (or `--output <path>`), and opens it in your system
browser via `open` / `xdg-open` / `start`
(:cite[src/cli/commands/dashboard.ts:64-66]). The companion generator —
`scripts/generate-dashboard.sh` — produces the same surface and additionally
injects the two Build-Observability panels; it is what `make dashboard-test`
runs so you can verify rendering before shipping a change.

:::callout{type=note}
**Two producers, one design system.** The TypeScript `scaffold dashboard`
command and the bash `scripts/generate-dashboard.sh` both emit the same markup
and both embed `lib/dashboard-theme.css`. This guide cites the bash generator for
panel structure and inline JS because it is the visual-test entry point; the
design tokens it relies on are defined once in `lib/dashboard-theme.css`.
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
| Beads Tasks | `.beads-section`, `.beads-filter` | Filterable task list (status + priority), cards open a detail modal |
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
- **Task / prompt detail modals** — `openBeadModal(id)` builds a
  `.modal-overlay` detail view for a task; close via the X, Escape, or a
  backdrop click.
- **Audit finding filters** — on load, `initAuditFilters()` finds the
  `#build-audit` section, reads its `data-threshold`, and wires the
  `[data-filter]` buttons to show/hide `.finding` rows by severity rank
  (:cite[scripts/generate-dashboard.sh:839-863]).

## The design-token system

Every color, space, size, and radius the dashboard uses is a CSS custom property
defined in `lib/dashboard-theme.css`. Component styles reference tokens via
`var(--token)` and never hardcode raw values — that is what keeps light and dark
mode in lockstep and the surface coherent.

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
rules in `docs/design-system.md` are load-bearing. Follow the documented add-a-
token / add-a-component flow and stay inside the token system.

:::callout{type=warning}
**Two rules that are never optional.** (1) **Use only defined tokens** — never
hardcode a hex color, pixel value, or font name in a component style; if you need
a value that doesn't exist, add a *token* first. (2) **Always ship both modes** —
every new color token needs a `:root` value *and* a `[data-theme="dark"]`
override, and every change must be checked in light *and* dark. Skipping the dark
override leaves the token undefined in dark mode and breaks the surface.
:::

To add a token: declare it on `:root` in the light section of
`lib/dashboard-theme.css`, add the dark override under `[data-theme="dark"]`,
document both values in `docs/design-system.md` §2, then reference it as
`var(--token)`. To add a component: add its styles to the right section of the
theme file, reuse existing tokens (add new ones first if needed), wire its markup
into the generator JS, and document it in §3. New components should reuse
established patterns — for example, collapsible sections reuse the same
`.phase-hdr` + `togglePhase()` mechanism as pipeline phases, and detail views
reuse `.modal-overlay`.

Also avoid: `!important` (restructure selectors instead), any second theme
mechanism (the `[data-theme]` toggle is the only one), and external resource
references — the generated HTML must stay self-contained. Dark mode is driven by
the inline bootstrap that reads `localStorage('scaffold-theme')`, falling back to
`prefers-color-scheme` on first visit (:cite[scripts/generate-dashboard.sh:438]),
and the `.theme-toggle` button flips and persists the choice
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
`browser_take_screenshot` at each, emulate dark mode and repeat, exercise the
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
