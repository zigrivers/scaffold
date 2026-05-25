# Knowledge-Base Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Scaffold's ~266 knowledge entries (live count; see plan Task 0) accurate against external reality via volatility-tagged, grounded, multi-model-corroborated audits — and surface gaps where the knowledge base doesn't yet cover what downstream agents need.

**Architecture:** Extend the knowledge frontmatter additively with `volatility` / `last-reviewed` / `sources` / `version-pin`. A daily cron pre-filters entries by source-hash diff and overdue cadence, dispatches a grounded audit meta-prompt that performs WebFetch on each `sources:` URL and emits a structured verdict, corroborates via `mmr review --diff`, and opens a PR with provenance for human merge. A parallel `knowledge_gap_signal` observability event aggregates "agent asked but KB didn't cover" into a new audit lens (I). Reuses the knowledge loader, observability engine, MMR dispatch, and existing CI; adds no parallel infrastructure.

**Tech Stack:** TypeScript (existing `src/`), Zod (validator), `WebFetch` via existing `src/observability/engine/llm-dispatcher.ts` (subprocess `claude -p`), `mmr` CLI (sibling repo), GitHub Actions (cron scheduling), Vitest (tests).

**Companion design doc:** [`docs/superpowers/specs/2026-05-24-knowledge-freshness-design.md`](../specs/2026-05-24-knowledge-freshness-design.md). Read it first — it carries Findings & Corrections to the user's framing (e.g., knowledge entries are not routed through the pipeline frontmatter validator; `doc-conformance` is a category string not an MMR channel) and the Resolved Decisions table at the bottom.

---

## Phase Sequencing

| Phase | Outcome | Gate to next phase |
|---|---|---|
| **0** | Standalone prerequisite PR fixing stale CLAUDE.md numbers (60→89 steps, 64→267 entries, 7→18 categories). | Merged to `main`. |
| **1** | End-to-end loop validated on **one entry** (`security-best-practices.md`): frontmatter extended, validator passing, audit meta-prompt + driver work manually, MMR corroboration runs, PR opens with clean provenance. | Manual audit run produces a reviewable PR with citations, MMR verdict, and updated `last-reviewed`. |
| **2** | Loop runs unattended on cron; expanded backfill to ~30 entries; CI gates enforced on freshness PRs. | A weekly cron has opened ≥1 audit PR autonomously and the gates blocked at least one bad-faith test PR. |
| **3** | Gap detection — `knowledge_gap_signal` event + Lens I aggregator. | Signals from real pipeline runs surface in a `docs/audits/` report. |
| **4** | Full backfill across all knowledge entries (live count); KB SemVer pinned and consumable downstream. | `content/knowledge/VERSION` is bumped on every audit-PR merge; downstream pins demonstrably work. |
| **5** | Roadmap items: native MMR `knowledge-freshness` channel, frontier scan tool, taxonomy cross-reference. | Out of scope for this plan; specs only. |

**Phases 0 and 1 are detailed task-by-task below.** Phases 2–5 are scoped as tasks with acceptance criteria; the next round of planning expands them once Phase 1 ships.

**Branch model.** This plan's work happens in the existing worktree at `.claude/worktrees/feat+knowledge-freshness/` on branch `worktree-feat+knowledge-freshness`. Each merge-target branch is created off `main` per task and PR'd separately. Task 0 is its own tiny PR; Phase 1 tasks may share a `feat/knowledge-freshness-phase-1` branch with frequent commits, or split per-task — implementer's call at execution time.

---

## Phase 0 — Prerequisite: Fix stale CLAUDE.md numbers

A 5-minute standalone PR. Lands first so the freshness work doesn't inherit drift it's supposed to be solving.

### Task 0: Update CLAUDE.md summary counts

**Files:**
- Modify: `CLAUDE.md` (three lines under the "## Structure" and "## Project Overview" sections)

- [ ] **Step 1: Find and fix the three stale references**

In `CLAUDE.md`, locate:
- `CLAUDE.md:55` — "60 meta-prompt files organized into 16 phases" → use the live `find` count below for pipeline steps.
- `CLAUDE.md:71` — "64 domain expertise entries in 7 categories" → use the live `find` counts below. Knowledge entries are the `.md` files minus `README.md` per `knowledge-loader.ts:138-139, :186-187`.
- Any other place either count is repeated (search `60 meta-prompt` and `64 domain` to be sure).

Compute the live counts before committing:

```bash
find content/pipeline -name '*.md' | wc -l                 # pipeline step count
# Knowledge entries: total .md minus README files (loader excludes READMEs).
echo $(( $(find content/knowledge -name '*.md' | wc -l) - $(find content/knowledge -name 'README.md' | wc -l) ))
ls -d content/knowledge/*/ | wc -l                          # category count
```

Snapshot from 2026-05-24: 89 pipeline steps, 266 knowledge entries (268 `.md` files − 2 READMEs), 19 categories. **Use whatever the live commands return at execution time**, not these snapshot numbers.

- [ ] **Step 2: Commit and PR**

```bash
git checkout -b chore/claude-md-fix-stale-counts main

# Compute live counts first; substitute into both the file edit and the commit/PR messages.
PIPELINE=$(find content/pipeline -name '*.md' | wc -l | tr -d ' ')
KB_ENTRIES=$(( $(find content/knowledge -name '*.md' | wc -l) - $(find content/knowledge -name 'README.md' | wc -l) ))
KB_CATS=$(ls -d content/knowledge/*/ | wc -l | tr -d ' ')

# Edit CLAUDE.md to use $PIPELINE, $KB_ENTRIES, $KB_CATS. (Do this with your
# editor, not sed — there's only ~3 occurrences and a visual check is safer.)

git add CLAUDE.md
git commit -m "docs: fix stale pipeline/knowledge counts in CLAUDE.md

Surveyed by Phase 0 of the knowledge-freshness design work: pipeline has
$PIPELINE steps across 16 phases (was 60/16); knowledge has $KB_ENTRIES entries
across $KB_CATS categories (was 64/7). Knowledge count excludes directory
README files (knowledge-loader.ts:138-139, :186-187)."
git push -u origin HEAD
gh pr create --title "docs: fix stale pipeline/knowledge counts in CLAUDE.md" \
  --body "Surveyed counts in CLAUDE.md were stale. Updates pipeline step count (60→$PIPELINE), knowledge entry count (64→$KB_ENTRIES), category count (7→$KB_CATS).

Sourced from live \`find\`/\`ls\` against content/; knowledge count excludes README files per the assembly loader. No functional changes."
```

- [ ] **Step 3: Wait for merge before starting Phase 1 Task 1.**

---

## Phase 1 — End-to-End Loop on One Entry

**Tracking:** When working this phase, use TodoWrite to track Tasks 1–9 individually.

### Task 1: Extend `KBFrontmatter` type and parser with optional freshness fields

**Files:**
- Modify: `src/core/assembly/knowledge-loader.ts:8-12` (interface), `:18-63` (parser)
- Modify: `src/types/assembly.ts:8-13` (public `KnowledgeEntry` type)
- Test: `src/core/assembly/knowledge-loader.test.ts` (extend existing test file; if not present, create it next to the source)

- [ ] **Step 1: Write failing tests for the new parser fields**

Append to `src/core/assembly/knowledge-loader.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { extractKBFrontmatter } from './knowledge-loader.js'

describe('extractKBFrontmatter — freshness fields', () => {
  it('parses volatility, last-reviewed, sources, version-pin when present', () => {
    const content = `---
name: security-best-practices
description: OWASP Top 10 plus auth and crypto
topics: [security]
volatility: fast-moving
last-reviewed: '2026-05-01'
version-pin: 'OWASP Top 10 2021'
sources:
  - url: https://owasp.org/Top10/
    anchor: '#2025-edition'
    retrieved: '2026-05-01'
    hash: 'sha256:abc'
---
body`
    const fm = extractKBFrontmatter(content)
    expect(fm).not.toBeNull()
    expect(fm!.volatility).toBe('fast-moving')
    expect(fm!.lastReviewed).toBe('2026-05-01')
    expect(fm!.versionPin).toBe('OWASP Top 10 2021')
    expect(fm!.sources).toHaveLength(1)
    expect(fm!.sources![0].url).toBe('https://owasp.org/Top10/')
    expect(fm!.sources![0].hash).toBe('sha256:abc')
  })

  it('defaults volatility to "evolving" and lastReviewed to null when absent', () => {
    const content = `---
name: domain-modeling
description: DDD
topics: [ddd]
---
body`
    const fm = extractKBFrontmatter(content)
    expect(fm!.volatility).toBe('evolving')
    expect(fm!.lastReviewed).toBeNull()
    expect(fm!.sources).toEqual([])
    expect(fm!.versionPin).toBeNull()
  })

  it('coerces unknown volatility values to "evolving" silently', () => {
    const content = `---
name: x
description: y
topics: []
volatility: urgent
---
body`
    const fm = extractKBFrontmatter(content)
    expect(fm!.volatility).toBe('evolving')
  })

  it('parses unquoted ISO dates as strings (not Date objects)', () => {
    // js-yaml's default schema coerces unquoted YYYY-MM-DD into a JS Date.
    // We use JSON_SCHEMA + a Date-aware coercer so lastReviewed is always
    // a string or null — never an object.
    const content = `---
name: x
description: y
topics: []
last-reviewed: 2026-04-01
sources:
  - url: https://x
    retrieved: 2026-04-01
---
body`
    const fm = extractKBFrontmatter(content)
    expect(fm!.lastReviewed).toBe('2026-04-01')
    expect(typeof fm!.lastReviewed).toBe('string')
    expect(fm!.sources[0].retrieved).toBe('2026-04-01')
  })
})
```

> **Note on appending to an existing test file.** `src/core/assembly/knowledge-loader.test.ts` may already exist and already import `describe`, `it`, `expect`, and `extractKBFrontmatter`. If so, do not append the import lines — only append the new `describe(...)` block. If the file does not yet exist, create it with the imports shown above. Either way, end up with exactly one import of each symbol.

- [ ] **Step 2: Run the test and confirm failure**

Run: `npx vitest run src/core/assembly/knowledge-loader.test.ts`
Expected: FAIL — `volatility`, `lastReviewed`, `versionPin`, `sources` all undefined on the parsed object.

- [ ] **Step 3: Extend `KBFrontmatter` and parser**

In `src/core/assembly/knowledge-loader.ts`, replace the `KBFrontmatter` interface and `extractKBFrontmatter` function (lines 8–63) with:

```typescript
type Volatility = 'stable' | 'evolving' | 'fast-moving'

interface KBSource {
  url: string
  anchor?: string
  retrieved?: string
  hash?: string
}

interface KBFrontmatter {
  name: string
  description: string
  topics: string[]
  volatility: Volatility
  lastReviewed: string | null
  versionPin: string | null
  sources: KBSource[]
}

const VOLATILITIES = new Set<Volatility>(['stable', 'evolving', 'fast-moving'])

function coerceVolatility(raw: unknown): Volatility {
  return typeof raw === 'string' && VOLATILITIES.has(raw as Volatility) ? (raw as Volatility) : 'evolving'
}

/**
 * Coerce a YAML-parsed value to an ISO date string. Accepts either a string
 * (e.g. quoted `'2026-05-24'`) or a Date (e.g. unquoted `2026-05-24` under the
 * default js-yaml schema, which interprets it as a timestamp).
 */
function coerceIsoDate(raw: unknown): string | null {
  if (typeof raw === 'string') return raw
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw.toISOString().slice(0, 10)
  return null
}

function coerceSources(raw: unknown): KBSource[] {
  if (!Array.isArray(raw)) return []
  const out: KBSource[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (typeof o.url !== 'string') continue
    const src: KBSource = { url: o.url }
    if (typeof o.anchor === 'string') src.anchor = o.anchor
    const retrieved = coerceIsoDate(o.retrieved)
    if (retrieved) src.retrieved = retrieved
    if (typeof o.hash === 'string') src.hash = o.hash
    out.push(src)
  }
  return out
}

export function extractKBFrontmatter(content: string): KBFrontmatter | null {
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') return null
  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { closeIdx = i; break }
  }
  if (closeIdx === -1) return null
  const yamlText = lines.slice(1, closeIdx).join('\n')

  let parsed: unknown
  // Use JSON_SCHEMA so unquoted ISO dates parse as strings, not Date objects.
  // (The default schema converts `2026-05-24` to a JS Date, which silently
  // null'd out `last-reviewed` before this fix.)
  try { parsed = yaml.load(yamlText, { schema: yaml.JSON_SCHEMA }) } catch { return null }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>
  if (typeof obj['name'] !== 'string' || obj['name'].trim() === '') return null

  return {
    name: obj['name'].trim(),
    description: typeof obj['description'] === 'string' ? obj['description'].trim() : '',
    topics: Array.isArray(obj['topics'])
      ? (obj['topics'] as unknown[]).filter((t): t is string => typeof t === 'string')
      : [],
    volatility: coerceVolatility(obj['volatility']),
    lastReviewed: coerceIsoDate(obj['last-reviewed']),
    versionPin: typeof obj['version-pin'] === 'string' ? obj['version-pin'] : null,
    sources: coerceSources(obj['sources']),
  }
}
```

Then update `src/types/assembly.ts` (lines 8–13) to mirror the new shape (the public `KnowledgeEntry` carries through the body field plus the new metadata):

```typescript
export interface KnowledgeSource {
  url: string
  anchor?: string
  retrieved?: string
  hash?: string
}

export interface KnowledgeEntry {
  name: string
  description: string
  topics: string[]
  content: string
  volatility: 'stable' | 'evolving' | 'fast-moving'
  lastReviewed: string | null
  versionPin: string | null
  sources: KnowledgeSource[]
}
```

Then update the two `loadEntries` / `loadFullEntries` builder paths in `knowledge-loader.ts:254-262` and `:312-320` (search for `topics: fm.topics`) to propagate the new fields onto the constructed `KnowledgeEntry`. Pattern:

```typescript
entries.push({
  name: fm.name,
  description: fm.description,
  topics: fm.topics,
  content: extracted ?? body,
  volatility: fm.volatility,
  lastReviewed: fm.lastReviewed,
  versionPin: fm.versionPin,
  sources: fm.sources,
})
```

- [ ] **Step 4: Run all knowledge-loader tests and confirm pass**

Run: `npx vitest run src/core/assembly/knowledge-loader.test.ts`
Expected: all tests pass, including pre-existing assembly engine tests that construct `KnowledgeEntry` literals — those will fail to type-check until updated.

Run: `npm run type-check`
Expected: PASS (test fixtures may need new fields; if they fail, add `volatility: 'evolving', lastReviewed: null, versionPin: null, sources: []` to the fixture objects flagged by tsc).

- [ ] **Step 5: Commit**

```bash
git add src/core/assembly/knowledge-loader.ts src/core/assembly/knowledge-loader.test.ts src/types/assembly.ts
git commit -m "feat(knowledge): add freshness fields (volatility, last-reviewed, sources, version-pin)

Extends KBFrontmatter and KnowledgeEntry with optional metadata used by
the freshness audit system. All fields default to safe values so existing
entries load unchanged."
```

---

### Task 2: Knowledge-frontmatter Zod validator + `make validate-knowledge`

**Files:**
- Create: `src/validation/knowledge-frontmatter-validator.ts`
- Create: `src/validation/knowledge-frontmatter-validator.test.ts`
- Modify: `Makefile` (add `validate-knowledge` target)
- Modify: `.github/workflows/ci.yml` (add validation step)

- [ ] **Step 1: Write failing tests for the validator**

```typescript
// src/validation/knowledge-frontmatter-validator.test.ts
import { describe, it, expect } from 'vitest'
import { validateKnowledgeFile } from './knowledge-frontmatter-validator.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

function tmpFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-test-'))
  const file = path.join(dir, 'entry.md')
  fs.writeFileSync(file, content)
  return file
}

describe('validateKnowledgeFile', () => {
  it('passes a minimal valid entry', () => {
    const file = tmpFile(`---\nname: x\ndescription: y\n---\nbody`)
    const result = validateKnowledgeFile(file)
    expect(result.errors).toEqual([])
  })

  it('errors when last-reviewed is not an ISO date', () => {
    const file = tmpFile(`---\nname: x\ndescription: y\nlast-reviewed: 'last tuesday'\n---\nbody`)
    const result = validateKnowledgeFile(file)
    expect(result.errors[0].message).toMatch(/last-reviewed/)
  })

  it('errors when a source entry is missing url', () => {
    const file = tmpFile(`---\nname: x\ndescription: y\nsources:\n  - anchor: '#a'\n---\nbody`)
    const result = validateKnowledgeFile(file)
    expect(result.errors[0].message).toMatch(/url/)
  })

  it('warns when sources is empty and volatility is fast-moving', () => {
    const file = tmpFile(`---\nname: x\ndescription: y\nvolatility: fast-moving\nsources: []\n---\nbody`)
    const result = validateKnowledgeFile(file)
    expect(result.warnings.some(w => /sources/.test(w.message))).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx vitest run src/validation/knowledge-frontmatter-validator.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the validator**

```typescript
// src/validation/knowledge-frontmatter-validator.ts
import fs from 'node:fs'
import yaml from 'js-yaml'
import { z } from 'zod'

const sourceSchema = z.object({
  url: z.string().url(),
  // Anchors are appended to source.url literally by the audit meta-prompt, so
  // they must include the leading "#" to produce a valid URL fragment.
  anchor: z.string().regex(/^#/, 'anchor must start with "#"').optional(),
  retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hash: z.string().optional(),
})

// Note: description has no max in the schema because some existing entries
// already exceed 200 chars (e.g. content/knowledge/core/automated-review-tooling.md
// is ~228). Overlong descriptions surface as a *warning* below, not an error,
// so the Phase 1 CI gate doesn't break on day one.
const kbSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  description: z.string(),
  topics: z.array(z.string()).default([]),
  volatility: z.enum(['stable', 'evolving', 'fast-moving']).default('evolving'),
  'last-reviewed': z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  'version-pin': z.string().nullable().default(null),
  sources: z.array(sourceSchema).default([]),
})

const DESCRIPTION_SOFT_MAX = 200

export interface KBValidationIssue { message: string; field?: string }
export interface KBValidationResult { errors: KBValidationIssue[]; warnings: KBValidationIssue[] }

export function validateKnowledgeFile(filePath: string): KBValidationResult {
  const errors: KBValidationIssue[] = []
  const warnings: KBValidationIssue[] = []
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') {
    errors.push({ message: 'missing frontmatter' })
    return { errors, warnings }
  }
  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { closeIdx = i; break }
  }
  if (closeIdx === -1) {
    errors.push({ message: 'unclosed frontmatter' })
    return { errors, warnings }
  }
  let parsed: unknown
  try { parsed = yaml.load(lines.slice(1, closeIdx).join('\n'), { schema: yaml.JSON_SCHEMA }) }
  catch (e) {
    errors.push({ message: `yaml parse error: ${(e as Error).message}` })
    return { errors, warnings }
  }
  const result = kbSchema.safeParse(parsed ?? {})
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({ message: `${issue.path.join('.')}: ${issue.message}`, field: String(issue.path[0] ?? '') })
    }
    return { errors, warnings }
  }
  const fm = result.data
  if (fm.description.length > DESCRIPTION_SOFT_MAX) {
    warnings.push({ message: `description is ${fm.description.length} chars (>${DESCRIPTION_SOFT_MAX}); consider trimming for downstream prompt token budgets` })
  }
  if (fm.volatility === 'fast-moving' && fm.sources.length === 0) {
    warnings.push({ message: 'fast-moving entry has empty sources — audit cannot run' })
  }
  if (!content.includes('## Deep Guidance')) {
    warnings.push({ message: 'missing "## Deep Guidance" heading — assembly engine will fall back to full body' })
  }
  return { errors, warnings }
}

export function validateKnowledgeDir(dir: string): Map<string, KBValidationResult> {
  const results = new Map<string, KBValidationResult>()
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = `${d}/${entry.name}`
      if (entry.isDirectory()) walk(p)
      // Skip directory READMEs — the assembly engine excludes them
      // (knowledge-loader.ts:138-139, :186-187), so we don't validate them either.
      else if (entry.isFile() && p.endsWith('.md') && entry.name !== 'README.md') {
        results.set(p, validateKnowledgeFile(p))
      }
    }
  }
  walk(dir)
  return results
}
```

- [ ] **Step 4: Add CLI entry point**

Create `src/cli/commands/validate-knowledge.ts`:

```typescript
import { validateKnowledgeDir } from '../../validation/knowledge-frontmatter-validator.js'
import path from 'node:path'

export async function runValidateKnowledge(): Promise<number> {
  const dir = path.resolve('content/knowledge')
  const results = validateKnowledgeDir(dir)
  let errorCount = 0
  let warnCount = 0
  for (const [file, r] of results) {
    for (const e of r.errors) { console.error(`[error] ${file}: ${e.message}`); errorCount++ }
    for (const w of r.warnings) { console.warn(`[warn]  ${file}: ${w.message}`); warnCount++ }
  }
  console.error(`\nknowledge validation: ${errorCount} error(s), ${warnCount} warning(s) across ${results.size} files`)
  return errorCount > 0 ? 1 : 0
}
```

Wire it into the existing CLI dispatch. Look for the pattern used by `src/cli/commands/complete.ts:141` — find where the scaffold CLI entry point (likely `src/cli/scaffold.ts` or `src/cli/index.ts`, whichever exports the binary) imports and dispatches subcommand handlers. Add a `validate-knowledge` subcommand that calls `runValidateKnowledge()` and uses its return value (0 or 1) as the process exit code.

**Do NOT** rely on running `src/cli/commands/validate-knowledge.ts` directly — it has no top-level invocation, so `node dist/cli/commands/validate-knowledge.js` would no-op. The command must be invoked through the CLI dispatcher.

- [ ] **Step 5: Add `make validate-knowledge` target**

In `Makefile`, after the existing `validate:` target, add:

```makefile
.PHONY: validate-knowledge
validate-knowledge: build
	node dist/index.js validate-knowledge
```

The `build` dependency ensures `dist/` exists on clean checkouts. Update the `check:` target to depend on `validate-knowledge`. Confirm the CLI binary path (`dist/index.js`) matches what `package.json` and the existing CLI tests use; adjust if the actual entry point differs.

- [ ] **Step 6: Add CI step**

In `.github/workflows/ci.yml`, append to the existing test job:

```yaml
      - name: Validate knowledge frontmatter
        run: make validate-knowledge
```

- [ ] **Step 7: Run the validator on the real content tree**

Run: `npm run build && make validate-knowledge`
Expected: many `[warn]` lines (entries don't yet have `## Deep Guidance` in some cases, no `sources:`); zero `[error]`. If any errors surface, they reveal real bugs in existing content — fix in a follow-up commit if small, otherwise open an issue and proceed.

- [ ] **Step 8: Commit**

```bash
git add src/validation/knowledge-frontmatter-validator.ts \
        src/validation/knowledge-frontmatter-validator.test.ts \
        src/cli/commands/validate-knowledge.ts \
        Makefile .github/workflows/ci.yml
git commit -m "feat(knowledge): add frontmatter validator and CI gate"
```

---

### Task 3: Knowledge-base SemVer file

**Files:**
- Create: `content/knowledge/VERSION`

- [ ] **Step 1: Create the file**

```bash
echo "0.1.0" > content/knowledge/VERSION
```

- [ ] **Step 2: Commit**

```bash
git add content/knowledge/VERSION
git commit -m "feat(knowledge): introduce KB SemVer (0.1.0)"
```

(Bump logic — incremented on every merged freshness PR per Conventional Commits — is wired in Phase 2 Task 12 when the cron lands. For Phase 1 the file just needs to exist.)

---

### Task 4: Source-authority allowlist + backfill `volatility` + `sources` for 10 fast-movers

**Files:**
- Create: `docs/knowledge-freshness/authoritative-sources.yaml`
- Modify: 10 entries under `content/knowledge/core/` per spec §A.6

- [ ] **Step 1: Create the allowlist YAML**

`docs/knowledge-freshness/authoritative-sources.yaml`:

```yaml
# Knowledge-freshness source allowlist (decisions-locked 2026-05-24).
# Sources outside this list trigger a warning (not a block) in the audit gates.
# Expand per-PR with reviewer approval.

hosts:
  - owasp.org              # OWASP Top 10, ASVS, SAMM
  - nist.gov               # NIST SSDF, SP 800-series
  - ietf.org/rfc           # IETF RFCs (OAuth, OIDC, HTTP, etc.)
  - modelcontextprotocol.io # MCP specification
  - anthropic.com/docs     # Anthropic API docs, Claude model cards
  - platform.openai.com    # OpenAI API docs
  - ai.google.dev          # Gemini API docs

github_repos:
  - modelcontextprotocol/specification
```

- [ ] **Step 2: For each of the 10 entries in spec §A.6, add freshness frontmatter**

Example for `content/knowledge/core/security-best-practices.md` (lines 1–5 currently `name`/`description`/`topics`):

```yaml
---
name: security-best-practices
description: OWASP Top 10, authentication, authorization, data protection, and threat modeling
topics: [security, owasp, authentication, authorization, threat-modeling, secrets-management, dependency-auditing]
volatility: fast-moving
last-reviewed: null
version-pin: 'OWASP Top 10 2021'
sources:
  - url: https://owasp.org/Top10/
    anchor: '#top-10-list'   # anchors MUST include the leading "#" — the audit
                              # meta-prompt appends source.anchor to source.url
                              # literally, and applyVerdictToEntry's normalizeUrl
                              # only strips text *after* a "#". A bare value like
                              # "top-10-list" would produce a wrong URL.
---
```

Repeat per entry from spec §A.6. The right `version-pin` for the others is whatever the entry currently tracks (read the body to figure it out — e.g. `core/multi-model-research-dispatch.md` likely pins to specific CLI versions; for entries that don't pin to a versioned standard, leave `version-pin: null`).

- [ ] **Step 3: Run the validator after each batch**

Run: `make validate-knowledge`
Expected: each modified file goes from warning ("fast-moving with empty sources") to clean.

- [ ] **Step 4: Commit each entry separately**

```bash
git add docs/knowledge-freshness/authoritative-sources.yaml
git commit -m "feat(knowledge-freshness): add authoritative-sources allowlist"

git add content/knowledge/core/security-best-practices.md
git commit -m "chore(knowledge): backfill freshness metadata for security-best-practices"
```

Repeat the per-entry commit for each of the 10. One commit per entry keeps blame meaningful for future audits.

---

### Task 5: Write the grounded-audit tool meta-prompt

**Files:**
- Create: `content/tools/knowledge-audit-entry.md`

- [ ] **Step 1: Create the meta-prompt**

```markdown
---
name: knowledge-audit-entry
description: Audit one knowledge entry against its declared sources via grounded web retrieval
category: tool
stateless: true
---

# Knowledge Audit (Single Entry)

You are auditing a single Scaffold knowledge entry against its declared authoritative sources. Your output is consumed by an automated pipeline — emit **only** the JSON object specified at the end.

## Inputs

- `{{entry_path}}` — absolute path to the knowledge entry being audited.
- `{{entry_frontmatter}}` — parsed frontmatter object including `name`, `volatility`, `last-reviewed`, `version-pin`, `sources`.
- `{{entry_body}}` — full body of the entry.

## Procedure

1. For each source in `{{entry_frontmatter}}.sources`, call `WebFetch` on `source.url` (with `source.anchor` appended if present).
2. Read the retrieved content carefully. Pay particular attention to:
   - The current edition / version of any taxonomy or standard (compare against `version-pin`).
   - Any normative statements in the entry body ("must", "should", "never") that the retrieved source contradicts or supersedes.
   - New categories, sections, or recommendations in the source that the entry does not mention.
3. Determine a verdict:
   - `current` — sources confirm the entry, no findings.
   - `minor-drift` — wording or examples slightly outdated; no substantive claims wrong.
   - `major-drift` — substantive claims now inaccurate; structural revision needed.
   - `superseded` — the source has shipped a new edition/version that changes the taxonomy; `version-pin` no longer applies.

## CRITICAL: Grounding Rules

- Where retrieved content contradicts the entry, **trust the retrieved content**.
- Where retrieved content contradicts your own prior knowledge, **trust the retrieved content**.
- When you cannot verify a claim against any retrieved source, mark it `preserve_warnings` — do NOT mark it as drift, and do NOT invent corroboration.
- Do not propose changes that introduce new normative claims unless those claims are verbatim or near-verbatim derivable from a retrieved source. Cite the source for every new normative claim.
- Preserve the `## Summary` and `## Deep Guidance` headings exactly — the assembly engine depends on them.

## Output (JSON only — no prose)

```json
{
  "entry_name": "<from frontmatter>",
  "audit_date": "<today's ISO date>",
  "model": "<your model identifier>",
  "verdict": "current | minor-drift | major-drift | superseded",
  "sources_checked": [
    {
      "url": "<source url>",
      "retrieved_at": "<ISO date>",
      "content_hash": "<sha256:... of retrieved body>",
      "summary": "<one sentence summary of what the source currently says>"
    }
  ],
  "findings": [
    {
      "claim_in_entry": "<quoted snippet or paraphrase>",
      "evidence_url": "<url>",
      "evidence_date": "<ISO date>",
      "source_excerpt": "<verbatim excerpt from retrieved source>",
      "severity": "P0 | P1 | P2 | P3",
      "drift_kind": "edition-upgrade | wording | new-category | obsolete-recommendation | factual-error"
    }
  ],
  "proposed_changes": [
    {
      "location": "<exact existing top-level \"## \" heading line, e.g. \"## Deep Guidance\" or \"## OWASP Top 10\" — MUST be a verbatim H2 heading currently present in the entry. Phase 1 does not support targeting H3 or deeper subsections; if a change needs to land inside a subsection, replace or update the enclosing H2 section instead.>",
      "kind": "replace | insert | delete",
      "rationale": "<one sentence pointing at the finding(s) this resolves>",
      "new_text": "<the proposed replacement or insertion text, with markdown link citations to retrieved sources. For `replace`, the new section's heading line (the same \"## \" heading) must be included as the first line. Omit this field for `delete`.>"
    }
  ],
  "preserve_warnings": [
    "<any claim you could not verify but should not change>"
  ]
}
```
```

- [ ] **Step 2: Commit**

```bash
git add content/tools/knowledge-audit-entry.md
git commit -m "feat(knowledge-freshness): add grounded audit meta-prompt"
```

---

### Task 6: `scaffold knowledge-freshness audit-prefilter` CLI

**Files:**
- Create: `src/knowledge-freshness/audit-prefilter.ts`
- Create: `src/knowledge-freshness/audit-prefilter.test.ts`
- Create: `src/cli/commands/knowledge-freshness-audit-prefilter.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/knowledge-freshness/audit-prefilter.test.ts
import { describe, it, expect, vi } from 'vitest'
import { selectAuditCandidates, type FetchSourceFn } from './audit-prefilter.js'
import type { KnowledgeEntry } from '../types/index.js'

const today = new Date('2026-05-24T00:00:00Z')

function entry(overrides: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    name: 'x', description: '', topics: [], content: '',
    volatility: 'evolving', lastReviewed: null, versionPin: null, sources: [],
    ...overrides,
  }
}

describe('selectAuditCandidates', () => {
  it('skips entries with no sources', async () => {
    const fetch = vi.fn() as unknown as FetchSourceFn
    const out = await selectAuditCandidates([entry({ sources: [] })], { now: today, max: 10, fetch })
    expect(out).toEqual([])
  })

  it('selects entries that have never been reviewed', async () => {
    const fetch = vi.fn().mockResolvedValue({ hash: 'h1' }) as unknown as FetchSourceFn
    const out = await selectAuditCandidates(
      [entry({ name: 'a', sources: [{ url: 'https://x' }], lastReviewed: null })],
      { now: today, max: 10, fetch },
    )
    expect(out.map(c => c.name)).toEqual(['a'])
  })

  it('selects fast-moving entries last reviewed >14d ago', async () => {
    const fetch = vi.fn().mockResolvedValue({ hash: 'h1' }) as unknown as FetchSourceFn
    const out = await selectAuditCandidates(
      [entry({ name: 'a', volatility: 'fast-moving', lastReviewed: '2026-05-01', sources: [{ url: 'https://x', hash: 'h1' }] })],
      { now: today, max: 10, fetch },
    )
    expect(out.map(c => c.name)).toEqual(['a'])
  })

  it('selects entries whose source hash changed', async () => {
    const fetch = vi.fn().mockResolvedValue({ hash: 'h2' }) as unknown as FetchSourceFn
    const out = await selectAuditCandidates(
      [entry({ name: 'a', lastReviewed: '2026-05-23', sources: [{ url: 'https://x', hash: 'h1' }] })],
      { now: today, max: 10, fetch },
    )
    expect(out.map(c => c.name)).toEqual(['a'])
  })

  it('skips stable entries within their 180d window with matching hashes', async () => {
    const fetch = vi.fn().mockResolvedValue({ hash: 'h1' }) as unknown as FetchSourceFn
    const out = await selectAuditCandidates(
      [entry({ name: 'a', volatility: 'stable', lastReviewed: '2026-04-01', sources: [{ url: 'https://x', hash: 'h1' }] })],
      { now: today, max: 10, fetch },
    )
    expect(out).toEqual([])
  })

  it('respects max ceiling', async () => {
    const fetch = vi.fn().mockResolvedValue({ hash: 'new' }) as unknown as FetchSourceFn
    const entries = Array.from({ length: 5 }, (_, i) =>
      entry({ name: `e${i}`, sources: [{ url: `https://x${i}`, hash: 'old' }], lastReviewed: null }),
    )
    const out = await selectAuditCandidates(entries, { now: today, max: 2, fetch })
    expect(out).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx vitest run src/knowledge-freshness/audit-prefilter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pre-filter**

```typescript
// src/knowledge-freshness/audit-prefilter.ts
import type { KnowledgeEntry } from '../types/index.js'

export type FetchSourceFn = (url: string) => Promise<{ hash: string }>

const WINDOW_DAYS: Record<KnowledgeEntry['volatility'], number> = {
  'fast-moving': 14, evolving: 60, stable: 180,
}

interface Options { now: Date; max: number; fetch: FetchSourceFn }

export async function selectAuditCandidates(
  entries: KnowledgeEntry[],
  opts: Options,
): Promise<KnowledgeEntry[]> {
  const candidates: { entry: KnowledgeEntry; priority: number }[] = []
  for (const e of entries) {
    if (e.sources.length === 0) continue
    let select = false
    let priority = 0
    if (!e.lastReviewed) { select = true; priority = 100 }
    else {
      const ageDays = Math.floor((opts.now.getTime() - new Date(e.lastReviewed).getTime()) / 86400000)
      const window = WINDOW_DAYS[e.volatility]
      if (ageDays > window) { select = true; priority = 50 + ageDays }
      else {
        for (const s of e.sources) {
          if (!s.hash) continue
          // Fetch errors must not crash the whole cron. Treat any error as
          // "could not verify" — leave the entry alone this run; the next
          // cadence-window expiry will pick it up.
          let hash: string
          try { ({ hash } = await opts.fetch(s.url)) }
          catch (err) {
            console.warn(`[knowledge-freshness] fetch failed for ${s.url} (entry ${e.name}): ${(err as Error).message}`)
            continue
          }
          if (hash !== s.hash) { select = true; priority = 75; break }
        }
      }
    }
    if (select) candidates.push({ entry: e, priority })
  }
  candidates.sort((a, b) => b.priority - a.priority)
  return candidates.slice(0, opts.max).map(c => c.entry)
}
```

- [ ] **Step 4: Run tests and confirm pass**

Run: `npx vitest run src/knowledge-freshness/audit-prefilter.test.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Wire CLI command**

Create `src/cli/commands/knowledge-freshness-audit-prefilter.ts` — reuses `loadFullEntries` from the assembly engine to load entries, calls `selectAuditCandidates` with an HTTP fetcher that performs `fetch(url, {method: 'GET'})` and sha-256s the body, and prints the resulting candidate names as JSON on stdout. Register in the CLI dispatcher mirroring `complete.ts:141`. (Implementation is mechanical; if any non-obvious choices arise, surface them rather than guessing.)

- [ ] **Step 6: Commit**

```bash
git add src/knowledge-freshness/audit-prefilter.ts src/knowledge-freshness/audit-prefilter.test.ts \
        src/cli/commands/knowledge-freshness-audit-prefilter.ts
git commit -m "feat(knowledge-freshness): add audit pre-filter (source-hash + cadence)"
```

---

### Task 7: `scaffold knowledge-freshness audit-run-entry` CLI

**Files:**
- Create: `src/knowledge-freshness/audit-runner.ts`
- Create: `src/knowledge-freshness/audit-runner.test.ts`
- Create: `src/cli/commands/knowledge-freshness-audit-run-entry.ts`
- Possibly modify: `src/observability/engine/llm-dispatcher.ts` to export the subprocess helper

This task reuses the existing LLM dispatcher (`src/observability/engine/llm-dispatcher.ts`, hardcoded `claude -p` for security reasons — decisions-locked) to invoke `content/tools/knowledge-audit-entry.md` against a single entry. It returns the parsed verdict JSON.

- [ ] **Step 1: Write failing test (with mocked dispatcher)**

```typescript
// src/knowledge-freshness/audit-runner.test.ts
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runEntryAudit, type Dispatcher } from './audit-runner.js'

// Use temp fixtures rather than the real on-disk entry + meta-prompt so the
// runner tests don't break when those files are edited. The runner reads two
// files relative to cwd: the entry path passed in, and
// `content/tools/knowledge-audit-entry.md` (the meta-prompt). Shim both.
let tmpRoot: string
let originalCwd: string

beforeAll(() => {
  originalCwd = process.cwd()
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-test-'))
  fs.mkdirSync(path.join(tmpRoot, 'content/tools'), { recursive: true })
  fs.writeFileSync(
    path.join(tmpRoot, 'content/tools/knowledge-audit-entry.md'),
    '# stub\n{{entry_path}} {{entry_frontmatter}} {{entry_body}}\n',
  )
  fs.writeFileSync(
    path.join(tmpRoot, 'entry.md'),
    '---\nname: stub\ndescription: y\n---\nbody\n',
  )
  process.chdir(tmpRoot)
})

afterAll(() => {
  process.chdir(originalCwd)
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

const entryPath = () => path.join(tmpRoot, 'entry.md')

describe('runEntryAudit', () => {
  it('returns the parsed verdict on a clean dispatcher response', async () => {
    const dispatcher: Dispatcher = vi.fn().mockResolvedValue(JSON.stringify({
      entry_name: 'stub', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'superseded', sources_checked: [], findings: [], proposed_changes: [], preserve_warnings: [],
    }))
    const out = await runEntryAudit(entryPath(), dispatcher)
    expect(out.verdict).toBe('superseded')
    expect(out.entry_name).toBe('stub')
  })

  it('extracts JSON when the model wraps it in conversational preamble', async () => {
    const dispatcher: Dispatcher = vi.fn().mockResolvedValue(
      `Here's the verdict you asked for:\n\n${JSON.stringify({
        entry_name: 'stub', audit_date: '2026-05-24', model: 'claude-opus-4-7',
        verdict: 'current', sources_checked: [], findings: [], proposed_changes: [], preserve_warnings: [],
      })}\n\nLet me know if you need anything else.`,
    )
    const out = await runEntryAudit(entryPath(), dispatcher)
    expect(out.verdict).toBe('current')
  })

  it('throws on non-JSON dispatcher output', async () => {
    const dispatcher: Dispatcher = vi.fn().mockResolvedValue('not json at all')
    await expect(runEntryAudit(entryPath(), dispatcher)).rejects.toThrow()
  })

  it('throws on missing required fields', async () => {
    const dispatcher: Dispatcher = vi.fn().mockResolvedValue(JSON.stringify({ entry_name: 'x' }))
    await expect(runEntryAudit(entryPath(), dispatcher)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/knowledge-freshness/audit-runner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the runner**

```typescript
// src/knowledge-freshness/audit-runner.ts
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { extractKBFrontmatter } from '../core/assembly/knowledge-loader.js'

export type Dispatcher = (prompt: string) => Promise<string>

const verdictSchema = z.object({
  entry_name: z.string(),
  audit_date: z.string(),
  model: z.string(),
  verdict: z.enum(['current', 'minor-drift', 'major-drift', 'superseded']),
  sources_checked: z.array(z.object({
    url: z.string().url(), retrieved_at: z.string(),
    content_hash: z.string(), summary: z.string(),
  })),
  findings: z.array(z.object({
    claim_in_entry: z.string(), evidence_url: z.string().url(),
    evidence_date: z.string(), source_excerpt: z.string(),
    severity: z.enum(['P0', 'P1', 'P2', 'P3']),
    drift_kind: z.string(),
  })),
  proposed_changes: z.array(z.object({
    location: z.string(), kind: z.enum(['replace', 'insert', 'delete']),
    rationale: z.string(), new_text: z.string().optional(),
  })),
  preserve_warnings: z.array(z.string()),
})

export type AuditVerdict = z.infer<typeof verdictSchema>

export async function runEntryAudit(entryPath: string, dispatch: Dispatcher): Promise<AuditVerdict> {
  const content = fs.readFileSync(entryPath, 'utf8')
  const fm = extractKBFrontmatter(content)
  if (!fm) throw new Error(`could not parse frontmatter at ${entryPath}`)

  // Re-emit the frontmatter with the same hyphenated keys the meta-prompt
  // describes (`last-reviewed`, `version-pin`). The parser's TS-side shape
  // is camelCase; the prompt and the on-disk YAML are hyphenated, and the
  // model is told to expect hyphenated keys.
  const fmForPrompt = {
    name: fm.name,
    description: fm.description,
    topics: fm.topics,
    volatility: fm.volatility,
    'last-reviewed': fm.lastReviewed,
    'version-pin': fm.versionPin,
    sources: fm.sources,
  }

  const promptTemplate = fs.readFileSync(
    path.resolve('content/tools/knowledge-audit-entry.md'), 'utf8',
  )

  // Use replaceAll + replacer-function form so we (a) replace every occurrence
  // — the meta-prompt references `{{entry_frontmatter}}` in the Inputs section
  // AND the Procedure section — and (b) avoid String.replace's special-pattern
  // handling (`$$`, `$&`, `$'`, `$1`) on values that may contain dollar signs.
  const filled = promptTemplate
    .replaceAll('{{entry_path}}', () => entryPath)
    .replaceAll('{{entry_frontmatter}}', () => JSON.stringify(fmForPrompt, null, 2))
    .replaceAll('{{entry_body}}', () => content)

  const raw = await dispatch(filled)
  // Extract the largest top-level `{...}` block; models occasionally emit a
  // preamble/postamble around the JSON even when told not to. If no balanced
  // brace pair is found, JSON.parse will throw and surface the original output.
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  const candidate = first !== -1 && last > first
    ? raw.slice(first, last + 1)
    : raw.replace(/```json\n?|\n?```/g, '').trim()
  let parsed: unknown
  try { parsed = JSON.parse(candidate) }
  catch (e) { throw new Error(`audit output is not valid JSON: ${(e as Error).message}`) }
  return verdictSchema.parse(parsed)
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run src/knowledge-freshness/audit-runner.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire CLI subcommand and dispatcher**

In `src/cli/commands/knowledge-freshness-audit-run-entry.ts`, import the existing LLM dispatcher pattern from `src/observability/engine/llm-dispatcher.ts` (specifically the subprocess invocation of `claude -p` with timeout). Inject it as the `Dispatcher` and call `runEntryAudit(entryPath, dispatcher)`. Print verdict JSON to stdout. Register in CLI dispatch.

If the observability LLM dispatcher does not export a reusable function, extract the subprocess-invocation portion into `src/observability/engine/llm-dispatcher.ts`'s exported surface as part of this task (small refactor, no behavior change) and add a single test exercising the extracted helper. The hardcoded `claude -p` and the security rationale must be preserved.

- [ ] **Step 6: Commit**

```bash
git add src/knowledge-freshness/audit-runner.ts src/knowledge-freshness/audit-runner.test.ts \
        src/cli/commands/knowledge-freshness-audit-run-entry.ts \
        src/observability/engine/llm-dispatcher.ts  # only if extracted helper
git commit -m "feat(knowledge-freshness): add per-entry grounded audit runner"
```

---

### Task 8: `scaffold knowledge-freshness audit-apply` CLI — PR generation

**Files:**
- Create: `src/knowledge-freshness/audit-apply.ts`
- Create: `src/knowledge-freshness/audit-apply.test.ts`
- Create: `src/cli/commands/knowledge-freshness-audit-apply.ts`

This task takes a verdict JSON and produces: (a) a modified entry on disk with `last-reviewed` and source hashes updated, (b) a `git diff` printed to stdout. It does **not** open a PR in Phase 1 — Phase 1 stops at producing a reviewable diff that a human applies manually. (Phase 2 Task 10 adds the `gh pr create` wrapper.)

- [ ] **Step 1: Write failing tests**

```typescript
// src/knowledge-freshness/audit-apply.test.ts
import { describe, it, expect } from 'vitest'
import { applyVerdictToEntry } from './audit-apply.js'

describe('applyVerdictToEntry', () => {
  const baseEntry = `---
name: x
description: y
topics: []
volatility: fast-moving
last-reviewed: null
sources:
  - url: https://x
    hash: 'old'
---

## Summary

## Deep Guidance

Old content.
`

  it('updates last-reviewed to verdict.audit_date', () => {
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'current' as const, sources_checked: [], findings: [],
      proposed_changes: [], preserve_warnings: [],
    }
    const out = applyVerdictToEntry(baseEntry, verdict)
    // yaml.dump with JSON_SCHEMA emits the date unquoted (e.g. `last-reviewed: 2026-05-24`)
    // — match that, since JSON_SCHEMA is what audit-apply uses to avoid Date-coercion (F-001).
    expect(out).toContain('last-reviewed: 2026-05-24')
  })

  it('applies an insert kind by appending new text after the targeted section', () => {
    const entry = `---
name: x
description: y
topics: []
---

## Summary

## OWASP Top 10

The 2021 list.

## Deep Guidance

keep me
`
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: [], findings: [],
      proposed_changes: [
        { location: '## OWASP Top 10', kind: 'insert' as const,
          rationale: '', new_text: '> 2025 edition adds A11 Software Supply Chain Failures.' },
      ],
      preserve_warnings: [],
    }
    const out = applyVerdictToEntry(entry, verdict)
    expect(out).toContain('## OWASP Top 10')
    expect(out).toContain('The 2021 list.')
    expect(out).toContain('2025 edition adds A11')
    expect(out).toContain('## Deep Guidance')
    expect(out).toContain('keep me')
    // The insert must land between the OWASP section and the next H2,
    // not after the entire file.
    const idxOwasp = out.indexOf('## OWASP Top 10')
    const idxInsert = out.indexOf('2025 edition')
    const idxDeepGuidance = out.indexOf('## Deep Guidance')
    expect(idxOwasp).toBeLessThan(idxInsert)
    expect(idxInsert).toBeLessThan(idxDeepGuidance)
  })

  it('applies a replace proposed_change targeting "## Deep Guidance"', () => {
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: [], findings: [],
      proposed_changes: [
        { location: '## Deep Guidance', kind: 'replace' as const,
          rationale: '', new_text: '## Deep Guidance\n\nNew content with [source](https://x).\n' },
      ],
      preserve_warnings: [],
    }
    const out = applyVerdictToEntry(baseEntry, verdict)
    expect(out).toContain('New content with')
    expect(out).not.toContain('Old content.')
  })

  it('preserves the "## Deep Guidance" heading if a proposed_change tries to delete it', () => {
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: [], findings: [],
      proposed_changes: [
        { location: '## Deep Guidance', kind: 'delete' as const, rationale: '' },
      ],
      preserve_warnings: [],
    }
    expect(() => applyVerdictToEntry(baseEntry, verdict)).toThrow(/Deep Guidance/)
  })

  it('throws when a proposed_change.location does not match any heading (does not silently advance last-reviewed)', () => {
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: [], findings: [],
      proposed_changes: [
        { location: '## Nonexistent Heading', kind: 'replace' as const,
          rationale: '', new_text: '## Nonexistent Heading\n\nx' },
      ],
      preserve_warnings: [],
    }
    expect(() => applyVerdictToEntry(baseEntry, verdict)).toThrow(/did not match/)
  })

  it('applies a delete kind by removing the targeted section', () => {
    const entry = `---
name: x
description: y
topics: []
---

## Summary

## Deprecated Section

old stuff here

## Deep Guidance

keep me
`
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: [], findings: [],
      proposed_changes: [
        { location: '## Deprecated Section', kind: 'delete' as const, rationale: '' },
      ],
      preserve_warnings: [],
    }
    const out = applyVerdictToEntry(entry, verdict)
    expect(out).not.toContain('Deprecated Section')
    expect(out).not.toContain('old stuff here')
    expect(out).toContain('## Deep Guidance')
    expect(out).toContain('keep me')
  })

  it('preserves literal "$1" in new_text (no replace-string interpolation)', () => {
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: [], findings: [],
      proposed_changes: [
        { location: '## Deep Guidance', kind: 'replace' as const,
          rationale: '', new_text: '## Deep Guidance\n\nCost: $1 per request, $20/month plan.' },
      ],
      preserve_warnings: [],
    }
    const out = applyVerdictToEntry(baseEntry, verdict)
    expect(out).toContain('Cost: $1 per request, $20/month plan.')
  })

  it('throws when minor-drift or current verdicts carry proposed_changes', () => {
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'minor-drift' as const, sources_checked: [], findings: [],
      proposed_changes: [
        { location: '## Deep Guidance', kind: 'replace' as const,
          rationale: '', new_text: '## Deep Guidance\n\nNew.' },
      ],
      preserve_warnings: [],
    }
    expect(() => applyVerdictToEntry(baseEntry, verdict)).toThrow(/must have no proposed_changes/)
  })

  it('matches sources by normalized URL so anchors do not block hash updates', () => {
    const entry = `---
name: x
description: y
topics: []
sources:
  - url: https://example.org/spec
    hash: 'old'
---

## Deep Guidance

x
`
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'current' as const,
      sources_checked: [
        // Verdict's URL has an anchor; frontmatter's doesn't. Apply should still match.
        { url: 'https://example.org/spec#section-2', retrieved_at: '2026-05-24',
          content_hash: 'sha256:new', summary: '' },
      ],
      findings: [], proposed_changes: [], preserve_warnings: [],
    }
    const out = applyVerdictToEntry(entry, verdict)
    // yaml.dump quoting under JSON_SCHEMA is value-dependent; match by content.
    expect(out).toMatch(/hash:\s*['"]?sha256:new['"]?/)
    // Old hash must be absent in any quoting — leaving the stale value behind
    // is the bug we're guarding against.
    expect(out).not.toMatch(/hash:\s*['"]?old['"]?/)
  })

  it('prefers caller-supplied trustedHashes over LLM-claimed content_hash', () => {
    const entry = `---
name: x
description: y
topics: []
sources:
  - url: https://example.org/spec
    hash: 'old'
---

## Deep Guidance

x
`
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'current' as const,
      sources_checked: [
        { url: 'https://example.org/spec', retrieved_at: '2026-05-24',
          content_hash: 'sha256:llm-claimed-untrusted', summary: '' },
      ],
      findings: [], proposed_changes: [], preserve_warnings: [],
    }
    const trustedHashes = new Map([['https://example.org/spec', 'sha256:deterministic']])
    const out = applyVerdictToEntry(entry, verdict, { trustedHashes })
    expect(out).toMatch(/hash:\s*['"]?sha256:deterministic['"]?/)
    expect(out).not.toContain('llm-claimed-untrusted')
  })

  it('throws when trustedHashes is supplied but is missing a verdict source URL', () => {
    const entry = `---
name: x
description: y
topics: []
sources:
  - url: https://example.org/spec
    hash: 'old'
---

## Deep Guidance

x
`
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'current' as const,
      sources_checked: [
        { url: 'https://example.org/spec', retrieved_at: '2026-05-24',
          content_hash: 'sha256:llm', summary: '' },
      ],
      findings: [], proposed_changes: [], preserve_warnings: [],
    }
    // Supply trustedHashes but omit the URL → strict mode: throw rather than
    // silently fall back to the LLM-claimed hash.
    const trustedHashes = new Map<string, string>()
    expect(() => applyVerdictToEntry(entry, verdict, { trustedHashes })).toThrow(/trustedHashes/)
  })

  it('protects "## Summary" the same way it protects "## Deep Guidance"', () => {
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'major-drift' as const, sources_checked: [], findings: [],
      proposed_changes: [
        { location: '## Summary', kind: 'delete' as const, rationale: '' },
      ],
      preserve_warnings: [],
    }
    expect(() => applyVerdictToEntry(baseEntry, verdict)).toThrow(/Summary/)
  })

  it('parses unquoted ISO dates in existing entries correctly (no Date coercion)', () => {
    const entryWithUnquotedDate = `---
name: x
description: y
topics: []
last-reviewed: 2026-04-01
sources:
  - url: https://x
    hash: 'old'
---

## Deep Guidance

Old content.
`
    const verdict = {
      entry_name: 'x', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'current' as const, sources_checked: [], findings: [],
      proposed_changes: [], preserve_warnings: [],
    }
    const out = applyVerdictToEntry(entryWithUnquotedDate, verdict)
    // The new date is set, and it serializes as a string (not [object Object]).
    expect(out).toContain('last-reviewed: 2026-05-24')
    expect(out).not.toContain('[object Object]')
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/knowledge-freshness/audit-apply.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// src/knowledge-freshness/audit-apply.ts
import yaml from 'js-yaml'
import type { AuditVerdict } from './audit-runner.js'

const HEADING_RE = /^##\s+/

/** Locate a markdown heading line. `location` must be the exact heading text (e.g. "## Deep Guidance"). */
function findHeading(body: string, location: string): { start: number; end: number } | null {
  if (!HEADING_RE.test(location.trim())) return null
  const lines = body.split('\n')
  const target = location.trim()
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === target) {
      let j = i + 1
      while (j < lines.length && !HEADING_RE.test(lines[j])) j++
      return { start: i, end: j }
    }
  }
  return null
}

/** Strip a URL fragment/anchor so verdict sources match frontmatter sources reliably. */
function normalizeUrl(u: string): string {
  const idx = u.indexOf('#')
  return idx === -1 ? u : u.slice(0, idx)
}

/** Headings the assembly engine depends on — apply must preserve them verbatim. */
const PROTECTED_HEADINGS = new Set(['## Summary', '## Deep Guidance'])

export interface ApplyOptions {
  /**
   * Optional map of normalized-url → fresh sha256 hash, computed deterministically
   * by the caller (typically the CLI wrapper, which re-fetches each
   * `verdict.sources_checked.url` before calling apply). When provided, these
   * hashes are persisted to frontmatter instead of the LLM-claimed
   * `content_hash` (which is not deterministically verifiable). When omitted —
   * e.g. in unit tests — apply falls back to the LLM-claimed hash.
   */
  trustedHashes?: Map<string, string>
}

export function applyVerdictToEntry(
  original: string,
  verdict: AuditVerdict,
  opts: ApplyOptions = {},
): string {
  // Enforce the spec contract: minor-drift carries findings only, no changes.
  if ((verdict.verdict === 'current' || verdict.verdict === 'minor-drift') && verdict.proposed_changes.length > 0) {
    throw new Error(
      `verdict "${verdict.verdict}" must have no proposed_changes — got ${verdict.proposed_changes.length}. ` +
      `Use "major-drift" or "superseded" if changes are needed (also gates MMR corroboration per spec §A.4).`,
    )
  }

  const lines = original.split('\n')
  if (lines[0]?.trim() !== '---') throw new Error('entry has no frontmatter')
  let close = -1
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') { close = i; break }
  if (close === -1) throw new Error('frontmatter unclosed')

  // Parse frontmatter with a safe schema so ISO dates stay strings (round-1 F-001).
  const fmObj = yaml.load(lines.slice(1, close).join('\n'), { schema: yaml.JSON_SCHEMA }) as Record<string, unknown>
  fmObj['last-reviewed'] = verdict.audit_date

  if (Array.isArray(fmObj['sources'])) {
    const sourcesArr = fmObj['sources'] as Array<{ url?: string; hash?: string; retrieved?: string }>
    for (const s of sourcesArr) {
      // Normalize both sides so a frontmatter `url: https://x` matches a verdict
      // `url: https://x#fragment` (round-3 F-002).
      const sNormalized = s.url ? normalizeUrl(s.url) : undefined
      const match = verdict.sources_checked.find(c => normalizeUrl(c.url) === sNormalized)
      if (match) {
        const matchNormalized = normalizeUrl(match.url)
        if (opts.trustedHashes !== undefined) {
          // Strict mode: caller has taken responsibility for deterministic hashing.
          // A missing URL means the deterministic fetch failed for it — refuse to
          // persist the LLM-claimed hash as a silent fallback (round-4 F-003).
          const fresh = opts.trustedHashes.get(matchNormalized)
          if (fresh === undefined) {
            throw new Error(
              `trustedHashes was supplied but did not include "${matchNormalized}" — ` +
              `the CLI should compute hashes for every verdict.sources_checked URL before calling apply.`,
            )
          }
          s.hash = fresh
        } else {
          // Test mode (or callers that explicitly accept LLM-claimed hashes):
          // fall back to the LLM-claimed value.
          s.hash = match.content_hash
        }
        s.retrieved = match.retrieved_at
      }
    }
  }

  const newFm = yaml.dump(fmObj, { lineWidth: 120, schema: yaml.JSON_SCHEMA }).trimEnd()
  let body = lines.slice(close + 1).join('\n')

  for (const change of verdict.proposed_changes) {
    // Protect headings the assembly engine depends on (round-3 F-004 extends F-002
    // to cover ## Summary as well as ## Deep Guidance, matching the meta-prompt).
    const loc = change.location.trim()
    if (PROTECTED_HEADINGS.has(loc)) {
      if (change.kind === 'delete') {
        throw new Error(`refusing to delete "${loc}" — assembly engine depends on it`)
      }
      if (change.kind === 'replace' && !(change.new_text ?? '').trim().startsWith(loc)) {
        throw new Error(`refusing to remove "${loc}" heading in a replace — new_text must start with the same heading line`)
      }
    }

    const region = findHeading(body, change.location)
    if (!region) {
      // Throw rather than silently advance `last-reviewed` on a failed apply (F-002, F-010).
      throw new Error(`proposed_change.location "${change.location}" did not match any "## …" heading in the entry`)
    }
    const bodyLines = body.split('\n')
    const before = bodyLines.slice(0, region.start)
    const after = bodyLines.slice(region.end)

    // Splice helper — guarantees a blank line between each chunk so we don't
    // glue inserted text directly onto the next "## " heading (round-4 F-005).
    const splice = (...chunks: string[][]): string => {
      const padded: string[] = []
      for (const chunk of chunks) {
        if (chunk.length === 0) continue
        if (padded.length > 0 && padded[padded.length - 1] !== '') padded.push('')
        padded.push(...chunk)
      }
      return padded.join('\n')
    }

    if (change.kind === 'replace') {
      if (!change.new_text) throw new Error(`replace change at "${change.location}" missing new_text`)
      // Verbatim splice instead of String.replace to avoid `$&`/`$1`/`$$` interpolation in new_text (F-004).
      const replacement = change.new_text.trim().split('\n')
      body = splice(before, replacement, after)
    } else if (change.kind === 'insert') {
      if (!change.new_text) throw new Error(`insert change at "${change.location}" missing new_text`)
      const original = bodyLines.slice(region.start, region.end)
      const insertion = change.new_text.trim().split('\n')
      body = splice(before, original, insertion, after)
    } else if (change.kind === 'delete') {
      // Remove the section entirely, including its heading line (F-003).
      body = splice(before, after)
    }
  }

  return `---\n${newFm}\n---\n${body}`
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run src/knowledge-freshness/audit-apply.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire CLI**

Create `src/cli/commands/knowledge-freshness-audit-apply.ts` that takes two positional argv arguments — `<entry-path>` and `<verdict.json>` — in that order. Read both files, then:

1. Sanity-check that the verdict's `entry_name` matches the entry's frontmatter `name` (throw with a clear message if not, to catch a mismatched-pair operator error).
2. **Compute deterministic hashes**: for each normalized URL in `verdict.sources_checked`, GET the URL, sha256 the body, build a `Map<string, string>` of `normalizedUrl → sha256:…`. This is what gets persisted to frontmatter — the LLM-claimed `content_hash` is advisory only.
3. Call `applyVerdictToEntry(content, verdict, { trustedHashes })`.
4. Write the result back to `<entry-path>`.
5. Run `git diff <entry-path>` for the operator to see.

The signature is explicit (path first, verdict second) because the verdict schema intentionally does not carry a filesystem path — keeping the path out of LLM-emitted output preserves the safety property that the LLM cannot redirect writes to an unrelated file. Likewise, source hashes are recomputed in Node rather than trusted from the LLM, because LLM-emitted sha256s cannot be deterministically verified.

The hashing helper can be shared with the audit-prefilter (Task 6 step 5) — both want the same "fetch URL, sha256 body, return hex" primitive. Factor it into `src/knowledge-freshness/source-hash.ts` if it isn't already.

- [ ] **Step 6: Commit**

```bash
git add src/knowledge-freshness/audit-apply.ts src/knowledge-freshness/audit-apply.test.ts \
        src/cli/commands/knowledge-freshness-audit-apply.ts
git commit -m "feat(knowledge-freshness): apply audit verdicts to entries (Phase 1: no PR yet)"
```

---

### Task 9: End-to-end validation on `security-best-practices.md`

This is the gate to Phase 2. The audit loop runs against one real entry, against the live web, with real MMR corroboration. Cost: one `claude -p` invocation plus an MMR review.

- [ ] **Step 1: Confirm prerequisites**

Run: `make validate-knowledge`
Expected: no errors. `security-best-practices.md` has `volatility: fast-moving` and at least one `sources:` entry.

- [ ] **Step 2: Pre-filter**

Run: `node dist/index.js knowledge-freshness audit-prefilter --max=5`
Expected: stdout JSON includes `security-best-practices`.

- [ ] **Step 3: Run the grounded audit**

Run: `node dist/index.js knowledge-freshness audit-run-entry content/knowledge/core/security-best-practices.md > /tmp/verdict.json`

Inspect `/tmp/verdict.json`. Expected: a verdict object validating against the schema. Given the OWASP 2025 release referenced in the planning prompt, `verdict` is plausibly `superseded`; if it is `current`, that itself is a finding — verify the source URL really reflects the 2025 edition.

- [ ] **Step 4: Multi-model corroboration via MMR**

Apply the verdict to a working copy, generate a patch, run MMR review:

```bash
node dist/index.js knowledge-freshness audit-apply \
  content/knowledge/core/security-best-practices.md \
  /tmp/verdict.json
git diff content/knowledge/core/security-best-practices.md > /tmp/freshness.patch
mmr review --diff /tmp/freshness.patch --sync --format json \
  --focus "Are the proposed changes justified by retrieved evidence? Are any new claims unsourced?" \
  > /tmp/mmr-verdict.json
```

Expected: an MMR verdict with channels run, no P0 findings about invented claims.

- [ ] **Step 5: Open PR manually (direct to main)**

```bash
git checkout -b knowledge-freshness/security-best-practices-2026-05-24 main
git add content/knowledge/core/security-best-practices.md
git commit -m "chore(knowledge): refresh security-best-practices against OWASP 2025"
git push -u origin HEAD
gh pr create --base main \
  --title "chore(knowledge): refresh security-best-practices against OWASP 2025" \
  --body "$(cat <<'EOF'
## Summary
Grounded audit of security-best-practices.md against owasp.org/Top10/.

## Verdict
<paste verdict.verdict, audit_date, model>

## Findings
<paste findings table from verdict.findings>

## MMR
<paste mmr-verdict job id and result>

## Sources
<list verdict.sources_checked URLs and content_hash values>
EOF
)"
```

- [ ] **Step 6: Evaluate**

Manually review the PR. Acceptance criteria for Phase 1 completion:
1. Verdict JSON validates against the schema.
2. Every finding in the verdict has a verifiable `evidence_url` and `source_excerpt` traceable to the live OWASP page.
3. The proposed changes preserve `## Summary` and `## Deep Guidance` headings.
4. MMR verdict is `pass` or `degraded-pass`; no P0 "invented claim" findings.
5. The PR description's source URLs all return 2xx when clicked.

If all five pass, Phase 1 is complete and Phase 2 (scheduling + gates) can begin. If any fail, the failure is itself the most important data — fix the underlying issue (prompt wording, dispatcher behavior, validator strictness) before moving on, do not paper over.

---

## Phase 2 — Scheduling, CI Gates, Wider Backfill

Scoped tasks; expand to bite-sized steps in the next planning round once Phase 1 lands.

- [ ] **Task 10:** Add `.github/workflows/knowledge-freshness-audit.yml` — daily cron at 09:00 UTC. Runs build, pre-filter (max=10), and for each candidate runs the audit + MMR + opens a PR direct to `main`. Acceptance: a manual `workflow_dispatch` invocation produces a PR end-to-end.
- [ ] **Task 11:** Implement automated PR gates as CI checks on `knowledge-freshness/*` branches: knowledge-validator, source link-check, "no unsourced new claims" lint, anti-over-rewrite (volatility-aware diff-size cap), Deep-Guidance-preserved check. Acceptance: a deliberately-bad test PR (a P0 invented-claim diff) gets blocked by at least one gate.
- [ ] **Task 12:** Bump `content/knowledge/VERSION` automatically when a `knowledge-freshness/*` PR is merged. Use Conventional Commits prefix on the PR title (`chore(knowledge):` → patch, `feat(knowledge):` → minor, `BREAKING CHANGE:` → major). Acceptance: merge a Phase-1-style PR and verify the file gets a SemVer patch/minor bump.
- [ ] **Task 13:** Backfill the next 20 entries (next-most-fast-moving in core/ plus the multi-service cluster). One commit per entry, runs through the validator clean. Acceptance: `make validate-knowledge` reports zero "fast-moving with empty sources" warnings across `core/`.
- [ ] **Task 14:** Document the `knowledge-freshness` workflow in `docs/knowledge-freshness/operations.md` — how to run manually, how to skip an audit, how to add an entry to the freshness system, how to expand the source allowlist. Acceptance: a new contributor can follow the doc and produce a freshness PR without asking questions.

---

## Phase 3 — Gap Detection (Lens I)

- [ ] **Task 15:** Add new observability event type `knowledge_gap_signal` to `src/observability/engine/event-schemas.ts`. Acceptance: `scaffold observe gap-signal --topic=X --step=Y --reason=Z` writes a valid ledger entry, and `SCAFFOLD_GAP_SIGNAL_QUIET=1` suppresses emission.
- [ ] **Task 16:** Wire emission into pipeline meta-prompts: append a single instruction to every pipeline step that references `knowledge-base:` telling the executing agent to call the gap-signal command on missed lookups. Always-on per decisions-locked. Acceptance: a contrived pipeline run with a missing topic emits the event.
- [ ] **Task 17:** Implement `src/observability/checks/lens-i-knowledge-gaps.ts` — aggregates `knowledge_gap_signal` events from the ledger over a rolling 90-day window; emits findings for topics with ≥3 signals across ≥2 distinct projects (P2). Acceptance: lens runs in `scaffold observe audit` output.
- [ ] **Task 18:** Add the `tasks/lessons.md` scanner as a secondary signal source. Acceptance: recurring patterns in lessons.md (≥3 mentions of same topic) emit gap signals.

---

## Phase 4 — Full Backfill

- [ ] **Task 19:** Backfill all remaining knowledge entries with `volatility` and (where applicable) `sources`. Use a tracking issue. Acceptance: `make validate-knowledge` reports zero warnings across all knowledge entries (live count).

---

## Phase 5 — Roadmap (Specs Only)

- [ ] **Task 20:** Design native MMR `knowledge-freshness` channel in the sibling `mmr` repo (separate plan). Acceptance: design doc in the MMR repo's `docs/superpowers/specs/`.
- [ ] **Task 21:** Frontier scan tool meta-prompt (`content/tools/knowledge-frontier-scan.md`). Acceptance: design doc.
- [ ] **Task 22:** Taxonomy cross-reference against OWASP 2025, NIST SSDF, AWS Well-Architected. Acceptance: design doc.

---

## Self-Review Notes

- **Spec coverage:** All seven numbered requirements in the spec's Part A and B are addressed. A.1 → Task 1+2+3. A.2 → Task 6. A.3 → Task 5+7. A.4 → Task 9 step 4 (Phase 1) and Task 11 (Phase 2 gates). A.5 → Task 8 (apply) + Task 10 (cron PR) + Task 11 (gates). A.6 → Task 4. A.7 → Task 4 step 1. B.1 → Task 15–18. B.2/B.3 → Task 21–22.
- **Decisions coverage:** Each of the 10 resolved decisions in the spec maps to concrete plan tasks. #1 (naming) → all file paths use `knowledge-freshness`. #2 (direct to main) → Task 9 step 5 and Task 10. #3 (--diff in Phase 1) → Task 9 step 4. #4 (allowlist) → Task 4 step 1. #5 (backfill list) → Task 4 step 2. #6 (KB SemVer single) → Task 3 + Task 12. #7 (LLM dispatcher reuse) → Task 7 step 5. #8 (10/day ceiling) → Task 10 (cron max=10). #9 (gap signal always-on) → Task 16. #10 (CLAUDE.md fix) → Task 0.
- **Type consistency:** `AuditVerdict` exported from `audit-runner.ts` used by `audit-apply.ts`; `KnowledgeEntry` extended in Task 1 used by `audit-prefilter.ts` in Task 6. `Dispatcher` type consistent. `applyVerdictToEntry` signature matches what `audit-apply.ts` consumes from `audit-runner.ts`.
- **Placeholder scan:** Task 6 step 5 and Task 7 step 5 describe the CLI-wiring step in prose rather than full code because it is mechanical glue against an existing dispatch pattern that the executing engineer can read directly from `src/cli/commands/complete.ts`. This is acceptable per the writing-plans rule ("complete code in every step that *changes code*"). The CLI-wiring file is created but its content is determined by the existing dispatch pattern; no design decisions are deferred.

## Execution Handoff

This plan is saved in worktree `feat+knowledge-freshness` on branch `worktree-feat+knowledge-freshness`. **All ten design decisions are locked.** Execution can begin with Task 0.

Execution options:

1. **Subagent-Driven** — dispatch a fresh subagent per task, two-stage review between tasks. Recommended for Tasks 1–8 (TDD-shaped, well-bounded, parallelizable in pairs).
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch with checkpoints. Recommended for Task 0 (5 minutes) and Task 9 (interactive validation).

When you give the go-ahead, indicate which approach and which task to start with — by default I would start with Task 0 inline (since it's tiny and blocks Phase 1) and then dispatch Task 1 to a subagent.
