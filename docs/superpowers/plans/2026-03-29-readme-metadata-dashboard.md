# README, Metadata & Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship all session work (README improvements, phase/step metadata, dashboard v3 rewrite), update changelog, create PR, merge, and release.

**Architecture:** Three logical chunks: (1) commit already-done work (README, metadata, skills), (2) implement dashboard v3 rewrite per design spec, (3) release workflow (changelog, PR, merge, version bump, release). The dashboard rewrite replaces `src/dashboard/generator.ts` and `src/dashboard/template.ts` with enriched data and a new phase-grouped template.

**Tech Stack:** TypeScript (vitest), HTML/CSS/JS (self-contained), git/gh CLI

---

## Phase A: Commit Already-Done Work

All changes from this session that are already implemented and tested but not yet committed.

### Task 1: Commit README improvements

**Files:**
- Modified: `README.md`

- [ ] **Step 1: Stage README changes**

```bash
git add README.md
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: comprehensive README rewrite for less technical users

- Quick Start: greenfield + brownfield examples using scaffold runner skill
- Pipeline: expanded phase descriptions (2-3 sentences each) and step descriptions (action-oriented, plain language)
- Multi-Model Review: tiered approach with code review analogy, quick setup, and streamlined structure
- Moved raw CLI invocation commands to FAQ
- Removed misplaced scaffold check examples from multi-model section

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2: Commit phase descriptions and step summary metadata

**Files:**
- Modified: `src/types/frontmatter.ts` (PHASES descriptions, summary field on interface)
- Modified: `src/project/frontmatter.ts` (summary in KNOWN_YAML_KEYS, Zod schema, empty default)
- Modified: All 60 `pipeline/**/*.md` files (new `summary:` frontmatter field)
- Modified: `src/cli/commands/next.ts` (use summary in output)
- Modified: `src/cli/commands/info.ts` (show summary in output)
- Modified: `src/cli/commands/build.ts` (prefer summary for longDescription)

- [ ] **Step 1: Stage all metadata changes**

```bash
git add src/types/frontmatter.ts src/project/frontmatter.ts
git add pipeline/
git add src/cli/commands/next.ts src/cli/commands/info.ts src/cli/commands/build.ts
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat: add phase descriptions and step summary metadata

- Add description field to all 16 PHASES entries in frontmatter.ts
- Add optional summary field to MetaPromptFrontmatter interface (max 500 chars)
- Add summary to Zod schema, KNOWN_YAML_KEYS, and empty frontmatter default
- Populate summary in all 60 pipeline meta-prompt files
- Update scaffold next to show summary (falls back to description)
- Update scaffold info to show summary in both human and JSON output
- Update scaffold build to prefer summary for longDescription

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3: Commit skill updates

**Files:**
- Modified: `skills/scaffold-runner/SKILL.md` (phase descriptions in reference table, batch progress, rework pauses)
- Modified: `skills/scaffold-pipeline/SKILL.md` (phase descriptions, added Phase 0)

- [ ] **Step 1: Stage skill files**

```bash
git add skills/scaffold-runner/SKILL.md skills/scaffold-pipeline/SKILL.md
```

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
docs: update skills with phase descriptions and summary metadata

- scaffold-runner: add Description column to phase reference table, update batch progress template to use step summaries, update rework phase boundary pauses with phase descriptions
- scaffold-pipeline: add Description column to phases table, add missing Phase 0 (vision)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4: Commit design spec

**Files:**
- New: `docs/superpowers/specs/2026-03-29-dashboard-v3-design.md`

- [ ] **Step 1: Stage and commit**

```bash
git add docs/superpowers/specs/2026-03-29-dashboard-v3-design.md
git commit -m "$(cat <<'EOF'
docs: add dashboard v3 design spec

Complete rewrite design for the pipeline dashboard with phase-grouped layout,
step drill-down modals, what's-next banner, and enriched metadata display.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5: Verify all session work is committed

- [ ] **Step 1: Confirm clean working tree**

```bash
git status
```

Expected: Only untracked `.superpowers/` and `.scaffold/` directories (both gitignored or irrelevant). No modified files.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: All 1058+ tests pass.

- [ ] **Step 3: Run quality gates**

```bash
make check
```

Expected: Exit 0, no failures.

---

## Phase B: Dashboard v3 Rewrite

Implements the design spec at `docs/superpowers/specs/2026-03-29-dashboard-v3-design.md`.

### Task 6: Extend DashboardData interface and generator

**Files:**
- Modify: `src/dashboard/generator.ts`

- [ ] **Step 1: Write failing test — phases are grouped with descriptions**

Add to `src/dashboard/generator.test.ts`:

```typescript
import { PHASES } from '../types/frontmatter.js'

// Add to existing describe block or create new one:
describe('generateDashboardData (enriched)', () => {
  it('groups steps into phases with descriptions', () => {
    const data = generateDashboardData(makeOpts())
    expect(data.phases).toBeDefined()
    expect(data.phases.length).toBeGreaterThan(0)
    const prePhase = data.phases.find(p => p.slug === 'pre')
    expect(prePhase).toBeDefined()
    expect(prePhase!.displayName).toBe('Product Definition')
    expect(prePhase!.description).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/dashboard/generator.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `data.phases` is undefined.

- [ ] **Step 3: Implement extended generator**

Rewrite `src/dashboard/generator.ts` to:
- Import `PHASES`, `PHASE_BY_SLUG` from `../types/frontmatter.js`
- Import `MetaPromptFile` type
- Add `metaPrompts?: Map<string, MetaPromptFile>` to `GeneratorOptions`
- Add `DashboardPhase`, `DashboardStep` (enriched), and `DashboardDecision` interfaces per design spec Section 5.1
- Extend `DashboardData` with `phases`, `nextEligible`, `scaffoldVersion`
- Keep backward compat: `steps` array still populated (flat list) for any consumers
- Group steps by phase using `PHASES` ordering
- Compute per-phase counts
- Compute `nextEligible` from `state.next_eligible` field
- Populate `description`, `summary`, `dependencies`, `outputs`, `order`, `conditional`, `metaPromptBody` from metaPrompts map (when provided)
- Read scaffold version from package.json via `import { createRequire } from 'node:module'`

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/dashboard/generator.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: All tests pass including the new one.

- [ ] **Step 5: Write additional generator tests**

Add tests for:
- Phase counts are accurate (completed, skipped, pending per phase)
- Steps within phases are sorted by order field
- Phases with no steps from state are still included (with all-pending counts)
- `nextEligible` is populated when state has `next_eligible`
- `nextEligible` is null when all steps completed/skipped
- Meta-prompt body is included when metaPrompts provided
- Step summary and description are included when metaPrompts provided
- Backward compat: `steps` flat array still works
- `scaffoldVersion` is a non-empty string

- [ ] **Step 6: Run all generator tests**

```bash
npx vitest run src/dashboard/generator.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add src/dashboard/generator.ts src/dashboard/generator.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): extend generator with phase grouping and enriched metadata

- Group steps into phases with descriptions from PHASES constant
- Enrich steps with summary, dependencies, outputs, meta-prompt body
- Add nextEligible computation from state
- Add scaffoldVersion field
- Maintain backward-compatible flat steps array

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 7: Rewrite HTML template

**Files:**
- Modify: `src/dashboard/template.ts`

- [ ] **Step 1: Write failing test — template has phase sections**

Add to `src/dashboard/generator.test.ts` (generateHtml section):

```typescript
it('renders phase sections in HTML', () => {
  const data = generateDashboardData(makeOpts())
  const html = generateHtml(data)
  expect(html).toContain('phase-header')
  expect(html).toContain('togglePhase')
})

it('renders step modal infrastructure', () => {
  const data = generateDashboardData(makeOpts())
  const html = generateHtml(data)
  expect(html).toContain('openModal')
  expect(html).toContain('closeModal')
  expect(html).toContain('modal-overlay')
})

it('renders what\'s next banner when nextEligible exists', () => {
  const data = generateDashboardData(makeOpts())
  const html = generateHtml(data)
  expect(html).toContain('whats-next')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/dashboard/generator.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — current template doesn't have phase sections or modals.

- [ ] **Step 3: Implement new template**

Complete rewrite of `src/dashboard/template.ts` per design spec Section 6. The template must:

**CSS (all inline):**
- Dark/light theme via CSS custom properties on `[data-theme]`
- Color palette per spec Section 7.1 (slate/indigo dark, cool white light)
- Layout: 960px max-width, responsive summary cards grid, step card rows
- Phase header with arrow, title, count pills
- Step card with status icon, info, metadata
- Modal overlay with header, body, metadata grid, prompt section, command row
- What's Next banner with accent gradient background
- Decision log section
- Progress bar with segmented fills
- Status colors: green (completed), indigo (skipped), slate (pending), amber (in-progress)

**HTML structure:**
- Header with title, methodology badge, percentage, theme toggle
- Stale notice (hidden by default, shown via JS if >1hr)
- Progress bar (completed + skipped segments)
- Summary cards (4-card responsive grid)
- What's Next banner (conditionally rendered from data.nextEligible)
- `<div id="phases">` — populated by JS
- `<div id="decisions">` — populated by JS
- Footer with timestamp and version
- Modal overlay (hidden by default)
- Embedded JSON data in `<script id="scaffold-data">`

**JavaScript (all inline):**
- `initTheme()` — read localStorage/matchMedia, set data-theme
- `toggleTheme()` — switch theme, persist to localStorage
- `renderPhases(data)` — build phase sections with step cards from data.phases
- `togglePhase(slug)` — collapse/expand phase content
- `openModal(slug)` — populate and show step detail modal
- `closeModal()` — hide modal, unlock body scroll
- `copyCommand(slug)` — clipboard API with "Copied!" feedback
- `togglePrompt()` — collapse/expand prompt body in modal
- `renderDecisions(data)` — build decision log entries
- `toggleDecisions()` — collapse/expand decision section
- `escapeHtml(s)` — XSS prevention (keep existing function)
- `formatDate(iso)` — format ISO timestamp to "Mar 25, 2026" style
- Stale check — show notice if generatedAt > 1hr ago
- Keyboard handlers — Escape closes modal
- Default collapse state — completed phases collapsed, pending/in-progress expanded

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/dashboard/generator.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: All tests pass including new phase/modal/whats-next tests.

- [ ] **Step 5: Write additional template tests**

Add tests for:
- HTML starts with `<!DOCTYPE html>`
- Contains `<script id="scaffold-data"` with embedded JSON
- No external resource references (https://, http://)
- Contains theme toggle and localStorage
- Contains `escapeHtml` function
- Contains `copyCommand` function
- Contains `formatDate` function
- XSS: escapes slugs in step cards (keep existing XSS test, adapt for new template)
- Shows "No decisions" when decisions empty
- Stale notice shown for old data, hidden for fresh data
- Contains decision log section with `toggleDecisions`

- [ ] **Step 6: Run all tests**

```bash
npx vitest run src/dashboard/generator.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add src/dashboard/template.ts src/dashboard/generator.test.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): rewrite HTML template with phase layout and step modals

- Phase-grouped layout with collapsible sections and descriptions
- Step detail modal with summary, metadata grid, meta-prompt body, copy command
- What's Next banner showing next eligible step
- Collapsible decision log section
- Dark/light theme with slate/indigo palette
- Responsive layout (4-col → 2-col → 1-col)
- Self-contained: zero external resources

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 8: Update dashboard CLI command

**Files:**
- Modify: `src/cli/commands/dashboard.ts`

- [ ] **Step 1: Update CLI to load meta-prompts and pass to generator**

The CLI needs to:
- Import `discoverMetaPrompts` from `../../core/assembly/meta-prompt-loader.js`
- Import `getPackagePipelineDir` from `../../utils/fs.js`
- Load meta-prompts: `const metaPrompts = discoverMetaPrompts(getPackagePipelineDir(projectRoot))`
- Pass to generator: `generateDashboardData({ state, decisions, methodology, metaPrompts })`

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

Expected: Clean build, no TypeScript errors.

- [ ] **Step 3: Manual smoke test**

```bash
node dist/cli/index.js dashboard --no-open --output /tmp/dashboard-test.html
```

Then open `/tmp/dashboard-test.html` in a browser and verify:
- All 16 phases displayed with names and descriptions
- Steps grouped correctly within phases
- Phase collapse/expand works
- Step click opens modal with summary, metadata, prompt body
- What's Next banner shows if pipeline incomplete
- Theme toggle works
- Progress bar and summary cards show correct counts

- [ ] **Step 4: Commit**

```bash
git add src/cli/commands/dashboard.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): load meta-prompts in CLI for enriched dashboard data

Pass meta-prompts to generator so dashboard can display step summaries,
descriptions, dependencies, outputs, and meta-prompt bodies.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 9: Update tool meta-prompt

**Files:**
- Modify: `tools/dashboard.md`

- [ ] **Step 1: Update tools/dashboard.md**

Update the Purpose section and instructions to reference the `scaffold dashboard` CLI command instead of the v1 bash script. Keep it simple — the CLI handles everything now.

- [ ] **Step 2: Rebuild commands**

```bash
node dist/cli/index.js build
```

Expected: Commands rebuilt, `commands/dashboard.md` updated.

- [ ] **Step 3: Commit**

```bash
git add tools/dashboard.md commands/dashboard.md
git commit -m "$(cat <<'EOF'
docs(dashboard): update tool meta-prompt to reference v2 CLI

Replace v1 bash script references with scaffold dashboard CLI command.
Rebuild commands/ to sync.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 10: Run full test suite and quality gates

- [ ] **Step 1: TypeScript build**

```bash
npm run build
```

Expected: Clean build.

- [ ] **Step 2: Full vitest suite**

```bash
npm test
```

Expected: All tests pass (1058+ existing + new dashboard tests).

- [ ] **Step 3: Bash quality gates**

```bash
make check
```

Expected: Exit 0, all tests pass.

- [ ] **Step 4: Visual verification with Playwright MCP**

```bash
make dashboard-test
```

Open the generated HTML and verify with Playwright MCP:
- Desktop dark mode screenshot
- Desktop light mode screenshot
- Mobile (375px) responsive layout
- Phase collapse/expand interaction
- Step modal open/close
- What's Next banner visible
- Copy command button works

---

## Phase C: Release Workflow

### Task 11: Update CHANGELOG.md

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add new version entry at the top**

Add a `## [2.38.0]` entry above the current `## [2.37.0]` entry. Include all work from this session:

```markdown
## [2.38.0] — 2026-03-29

### Added

- **Phase descriptions** — All 16 phases in the PHASES constant now include a 2-3 sentence `description` field explaining what the phase accomplishes and why it matters.
- **Step summaries** — New optional `summary` frontmatter field (max 500 chars) on all 60 pipeline meta-prompts, providing action-oriented descriptions of what each step does and produces.
- **Dashboard v3** — Complete rewrite of the pipeline dashboard with phase-grouped layout, collapsible sections, step detail modals (with meta-prompt body), What's Next banner, decision log, dark/light theme, responsive design.
- **Dashboard step drill-down** — Click any step to see its summary, metadata (status, date, depth, dependencies, outputs), and the meta-prompt that drives it.

### Changed

- **README Quick Start** — Comprehensive rewrite for less technical users, featuring scaffold runner skill as primary interface with greenfield and brownfield examples.
- **README Pipeline section** — All 16 phase descriptions and 60 step descriptions rewritten in plain language explaining what Claude does and what the user gets.
- **README Multi-Model Review** — Tiered rewrite with code review analogy, quick setup guide, and streamlined structure. Raw CLI invocation moved to FAQ.
- **`scaffold next`** — Now shows step summary (falls back to description) for richer output.
- **`scaffold info`** — Now shows step summary in both human-readable and JSON output.
- **`scaffold build`** — Prefers step summary for longDescription in generated command files.
- **Scaffold Runner skill** — Phase reference table now includes descriptions; batch progress and rework pause templates use step summaries and phase descriptions.
- **Scaffold Pipeline skill** — Phases table now includes descriptions and missing Phase 0 (vision).
- **Dashboard generator** — Extended with phase grouping, enriched step metadata, next eligible computation, and scaffold version.
- **Dashboard template** — Replaced barebones flat list with full-featured phase-grouped UI.
- **Dashboard CLI** — Now loads meta-prompts to provide enriched data to the dashboard.
- **Dashboard tool meta-prompt** — Updated to reference v2 CLI instead of v1 bash script.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs: update changelog for v2.38.0

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 12: Bump version

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump version in package.json**

```bash
npm version minor --no-git-tag-version
```

Expected: Version bumps to 2.38.0.

- [ ] **Step 2: Commit version bump**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore(version): v2.38.0

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 13: Create branch, push, and open PR

- [ ] **Step 1: Create feature branch**

```bash
git checkout -b feat/readme-metadata-dashboard
```

- [ ] **Step 2: Cherry-pick or rebase commits onto branch**

If already on main with commits, push the branch:

```bash
git push -u origin feat/readme-metadata-dashboard
```

- [ ] **Step 3: Create PR**

```bash
gh pr create --title "feat: README rewrite, phase/step metadata, dashboard v3" --body "$(cat <<'EOF'
## Summary

- **README**: Comprehensive rewrite of Quick Start (greenfield + brownfield examples), Pipeline descriptions (all 16 phases + 60 steps in plain language), and Multi-Model Review (tiered approach with code review analogy)
- **Metadata**: Added `description` to all 16 PHASES entries and `summary` frontmatter field to all 60 pipeline steps. CLI consumers (next, info, build) surface the richer metadata.
- **Skills**: Updated scaffold-runner and scaffold-pipeline with phase descriptions
- **Dashboard v3**: Complete rewrite with phase-grouped layout, step drill-down modals, What's Next banner, decision log, dark/light theme, responsive design

## Test plan

- [ ] `npm test` — all vitest tests pass (1058+ existing + new dashboard tests)
- [ ] `make check` — all quality gates pass (lint + validate + bats)
- [ ] `scaffold dashboard --no-open` — generates valid HTML with all 16 phases and 60 steps
- [ ] Visual verification: desktop/mobile, dark/light, phase collapse, step modal, copy command
- [ ] `scaffold next` shows step summaries
- [ ] `scaffold info <step>` shows summary field

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for CI**

```bash
gh pr checks
```

Expected: All checks pass.

### Task 14: Merge PR

- [ ] **Step 1: Verify CI passed**

```bash
gh pr checks
```

- [ ] **Step 2: Squash-merge**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 3: Switch to main and pull**

```bash
git checkout main
git pull
```

### Task 15: Create GitHub release

- [ ] **Step 1: Create git tag**

```bash
git tag v2.38.0
git push origin v2.38.0
```

- [ ] **Step 2: Create GitHub release**

```bash
gh release create v2.38.0 --title "v2.38.0" --notes "$(cat <<'EOF'
## What's New

### README Rewrite
- **Quick Start**: Comprehensive greenfield + brownfield examples using scaffold runner skill as primary interface
- **Pipeline descriptions**: All 16 phase descriptions and 60 step descriptions rewritten in plain language
- **Multi-Model Review**: Tiered rewrite with code review analogy and quick setup guide

### Phase & Step Metadata
- All 16 phases now include rich `description` fields
- All 60 pipeline steps now include `summary` frontmatter for user-facing descriptions
- `scaffold next`, `scaffold info`, and `scaffold build` surface the richer metadata

### Dashboard v3
- Complete dashboard rewrite with phase-grouped layout
- Step drill-down modals showing summary, metadata, and meta-prompt body
- What's Next banner highlighting the next eligible step
- Collapsible decision log
- Dark/light theme with responsive design

**Full Changelog**: https://github.com/zigrivers/scaffold/blob/main/CHANGELOG.md
EOF
)"
```

- [ ] **Step 3: Publish to npm**

```bash
npm publish
```

Expected: Package published as `@zigrivers/scaffold@2.38.0`.

- [ ] **Step 4: Verify**

```bash
npm info @zigrivers/scaffold version
```

Expected: `2.38.0`
