# Build Observability — Renderers + Audit History Implementation Plan (Plan 4 of N)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the markdown + dashboard renderers, JSON sidecars, and the audit-history adapter loop. After this plan: `scaffold observe progress` writes `docs/build-status/<date>.md` + `<date>.json` sidecars; `scaffold observe audit` writes `docs/audits/<date>-<profile>-<scope>.md` + sidecars; `scripts/generate-dashboard.sh` renders new "Build Progress" and "Audit" panels via fragment injection; the `audit-history` adapter (stub since Plan 1) actually reads sidecars for trend data; Lens E's must-priority check is refined to property-level using new `file_to_token_use` edge metadata.

**Architecture:** A new `src/observability/renderers/markdown.ts` module produces markdown reports for progress and audit, paired with a JSON sidecar writer. A new `src/observability/renderers/dashboard.ts` module emits HTML fragments consumed by `scripts/generate-dashboard.sh` via two named anchors and a `scaffold observe <subcmd> --render=dashboard-fragment[-audit]` invocation. The audit-history adapter (currently stub-only) gains a real `listSidecars` + parse implementation that surfaces severity-tier trajectories and lens-skipped streaks. The `file_to_token_use` edge type gains an optional `property` payload field; Lens E uses it to emit P0 only when a literal violates a *must-priority* token's specific property category.

**Tech Stack:** TypeScript (vitest, no new runtime deps — `js-yaml` already pulled in by Plan 2, `unified`+`remark-stringify` already pulled in by Plan 2), bats-core for end-to-end tests, shell additions to `scripts/generate-dashboard.sh`, CSS additions to `lib/dashboard-theme.css`.

**Spec:** [`docs/superpowers/specs/2026-04-30-build-observability-design.md`](../specs/2026-04-30-build-observability-design.md)

**Depends on:** [`Plan 1`](2026-04-30-build-observability-foundation.md), [`Plan 2`](2026-04-30-build-observability-audit-mvp.md), [`Plan 3`](2026-05-04-build-observability-full-lens-suite.md). Plan 4 reuses the Plan 1 redactor (`redactRendered`), the Plan 1 terminal renderer's `_lib.ts` helpers (`availabilityLine`, `severityBadge`, `verdictToken`), and the Plan 3 audit pipeline. It does not modify the `EngineOutput` shape from Plan 1's spec §2.5 — it only adds `property?` to the `file_to_token_use` edge variant.

**Subsequent plans:** Plan 5 — replay timeline + stall detection. Plan 6 — phase-boundary triggers + `StateManager.markCompleted` refactor. Plan 7 — MMR `doc-conformance` channel. Plan 8 — `--fix` flow + worktree teardown.

---

## Pre-flight

Verify Plans 1+2+3 are on the current branch:

```bash
test -f src/observability/renderers/terminal.ts && \
  test -f src/observability/checks/lens-g-decisions.ts && \
  test -f src/observability/engine/checks/observability-config.ts && \
  test -f src/observability/engine/doc-graph/token-use-detector.ts && \
  echo "Plans 1+2+3 present" || echo "missing — abort"
```

Worktree (recommended):

```bash
scripts/setup-agent-worktree.sh observability-renderers-history
cd ../scaffold-observability-renderers-history
```

No new dependencies are required; Plan 4 reuses existing ones.

---

## File Structure

```
src/observability/renderers/
  markdown.ts                    markdown.test.ts            (new)
  sidecar.ts                     sidecar.test.ts             (new)
  dashboard.ts                   dashboard.test.ts           (new)
  _lib.ts                        (modify) add date/path helpers + verdict-to-sev mapping

src/observability/engine/
  types.ts                       (modify) optional `property` on file_to_token_use edge
  doc-graph/edge-builder.ts      (modify) propagate property
  doc-graph/token-use-detector.ts (already emits property — surface it through to edges)

src/observability/adapters/audit-history.ts  (modify) parse sidecars, expose trend helpers
src/observability/adapters/audit-history.test.ts  (modify) test parsed trend data

src/observability/checks/lens-e-design.ts          (modify) property-level must-priority check
src/observability/checks/lens-e-design.test.ts     (modify) covers refined behavior

src/observability/engine/api.ts            (modify) write sidecars; --render flag through args
src/cli/commands/observe.ts                (modify) --output flag, --render flag, sidecar writing on default invocations
src/cli/commands/observe.test.ts           (modify) cover sidecar paths

scripts/generate-dashboard.sh              (modify) add observe:progress + observe:audit anchors
lib/dashboard-theme.css                    (modify) add --sev-p0|p1|p2|p3|pass tokens

tests/observability/audit.bats             (modify) cover sidecar + dashboard fragments
tests/observability/fixtures/projects/audit-mvp/   (no change)
```

---

## Task 1: Render-time redaction wrapper for `EngineOutput`

Plan 1 has `redactRendered(blob)` that operates on a string. We need a typed `redactEngineOutput(out)` that recursively scrubs the structured object before serialization, so JSON sidecars and dashboard fragments don't accidentally leak fields the string-based scrubber misses.

**Files:**
- Modify: `src/observability/engine/redact.ts`
- Modify: `src/observability/engine/redact.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/engine/redact.test.ts`:

```typescript
import { redactEngineOutput } from './redact'
import type { EngineOutput } from './types'

describe('redactEngineOutput (structured)', () => {
  const skeleton: EngineOutput = {
    schema_version: '1.0',
    invocation: { command: 'audit', args: { user: '/Users/alice/repo' }, started_at: '', completed_at: '', scaffold_version: '0.0.0' },
    availability: {
      git: { status: 'available' }, gh: { status: 'unavailable' },
      pipeline_docs: { status: 'available' }, tests: { status: 'available' },
      state: { status: 'available' }, beads: { status: 'unavailable' },
      mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
      ledger: { events_read: 0, malformed_lines: 0, sources: [] },
    },
    snapshot: null, replay: null,
    findings: [
      { id: 'abc12345' + '0'.repeat(8), lens_id: 'A-tdd', severity: 'P1',
        title: 'token=ghp_1234567890abcdefABCDEF1234567890abcdef',
        description: '/Users/alice/Documents/repo/src/x.ts', source_doc: '',
        evidence: { kind: 'rule_violation', rule_id: 'r', file: '/Users/alice/repo/src/x.ts' },
        confidence: 'high', first_seen: '', last_seen: '', status: 'open' },
    ],
    needs_attention: [],
    graph_stats: { nodes_by_kind: {}, edges_by_kind: {}, orphans_by_kind: {}, unsanctioned_uses: 0, ad_hoc_token_uses: 0 },
    fix_threshold: 'P2', verdict: 'pass',
    summary: { total: 1, by_severity: { P0: 0, P1: 1, P2: 0, P3: 0 },
      by_severity_status: { P0: { open: 0, acknowledged: 0, skipped: 0 }, P1: { open: 1, acknowledged: 0, skipped: 0 }, P2: { open: 0, acknowledged: 0, skipped: 0 }, P3: { open: 0, acknowledged: 0, skipped: 0 } },
      blocking: 0, acknowledged: 0, skipped_lenses: 0 },
  }

  it('scrubs secrets and rewrites paths in-depth', () => {
    const out = redactEngineOutput(skeleton)
    expect(JSON.stringify(out)).not.toContain('ghp_1234567890abcdefABCDEF1234567890abcdef')
    expect(JSON.stringify(out)).not.toContain('/Users/alice')
    expect(JSON.stringify(out)).toContain('~')
    expect(JSON.stringify(out)).toContain('[REDACTED:')
  })

  it('does not mutate the input', () => {
    const before = JSON.stringify(skeleton)
    redactEngineOutput(skeleton)
    expect(JSON.stringify(skeleton)).toBe(before)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/engine/redact.test.ts
```

Expected: FAIL — `redactEngineOutput` not exported.

- [ ] **Step 3: Implement `redactEngineOutput`**

Append to `src/observability/engine/redact.ts`:

```typescript
import type { EngineOutput } from './types'

/** Render-time redaction of a structured EngineOutput. Recurses through every string field. */
export function redactEngineOutput(out: EngineOutput): EngineOutput {
  return recursivelyTransform(structuredClone(out), (s) => sanitizePath(scrubSecrets(s))) as EngineOutput
}
```

If `structuredClone` is not available in the project's Node version, swap to `JSON.parse(JSON.stringify(out))` (lossy for Date objects but fine here — `EngineOutput` has no Dates).

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/engine/redact.test.ts
```

Expected: PASS, all redact tests including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/observability/engine/redact.ts src/observability/engine/redact.test.ts
git commit -m "observability: add redactEngineOutput (structured render-time redaction over EngineOutput)"
```

---

## Task 2: Markdown progress renderer

**Files:**
- Create: `src/observability/renderers/markdown.ts`
- Create: `src/observability/renderers/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/renderers/markdown.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { renderProgressMarkdown } from './markdown'
import type { EngineOutput } from '../engine/types'

const fixture: EngineOutput = {
  schema_version: '1.0',
  invocation: { command: 'progress', args: { sinceHours: 24 }, started_at: '2026-05-04T14:00:00Z', completed_at: '2026-05-04T14:00:01Z', scaffold_version: '3.25.1' },
  availability: {
    git: { status: 'available' }, gh: { status: 'unavailable', reason: 'gh not installed' },
    pipeline_docs: { status: 'available' }, tests: { status: 'available' },
    state: { status: 'available' }, beads: { status: 'unavailable' },
    mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
    ledger: { events_read: 4, malformed_lines: 0, sources: [{ worktree_id: 'wid-a', events: 4 }] },
  },
  snapshot: {
    current_phase: 'build',
    active_agents: [{ worktree_id: 'wid-a', actor_label: 'agent-alice', branch: 'feat-auth',
      current_task: { id: 'T-031', title: 'refresh token rotation', claimed_at: '2026-05-04T13:55:00Z' }, open_pr: null }],
    completed_in_window: [{ task_id: 'T-029', task_title: 'login bug', outcome: 'pr_submitted', pr_number: 40, by: 'agent-alice' }],
    in_flight: [{ task_id: 'T-031', task_title: 'refresh token rotation', by: 'agent-alice', claimed_at: '2026-05-04T13:55:00Z', age_hours: 0.1, branch: 'feat-auth' }],
    blocked: [], upcoming: [],
    recent_decisions: [{ decision_id: 'decision:foo', key: 'foo', summary: 'bar', recorded_at: '2026-05-04T13:00:00Z', affects: ['src/foo/**'] }],
    story_coverage: [],
  },
  replay: null, findings: [], needs_attention: [],
  graph_stats: { nodes_by_kind: {}, edges_by_kind: {}, orphans_by_kind: {}, unsanctioned_uses: 0, ad_hoc_token_uses: 0 },
  fix_threshold: 'P2', verdict: 'pass',
  summary: { total: 0, by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 },
    by_severity_status: { P0: { open: 0, acknowledged: 0, skipped: 0 }, P1: { open: 0, acknowledged: 0, skipped: 0 }, P2: { open: 0, acknowledged: 0, skipped: 0 }, P3: { open: 0, acknowledged: 0, skipped: 0 } },
    blocking: 0, acknowledged: 0, skipped_lenses: 0 },
}

describe('renderProgressMarkdown', () => {
  it('produces a heading + sections + availability table', () => {
    const md = renderProgressMarkdown(fixture)
    expect(md).toMatch(/^# Build Observability — Progress/m)
    expect(md).toContain('**Window:**')
    expect(md).toContain('## Active Agents')
    expect(md).toContain('agent-alice')
    expect(md).toContain('## Completed in Window')
    expect(md).toContain('PR #40')
    expect(md).toContain('## Recent Decisions')
    expect(md).toContain('## Availability')
    expect(md).toMatch(/\| git \|/)
    expect(md).toMatch(/\| gh \| .*unavailable/)
  })

  it('omits empty sections', () => {
    const empty = { ...fixture, snapshot: { ...fixture.snapshot!, active_agents: [], in_flight: [], completed_in_window: [], recent_decisions: [] } }
    const md = renderProgressMarkdown(empty)
    expect(md).not.toContain('## Active Agents')
    expect(md).not.toContain('## Completed in Window')
  })

  it('redacts secrets in narrative content', () => {
    const tainted = JSON.parse(JSON.stringify(fixture)) as EngineOutput
    tainted.snapshot!.recent_decisions[0].summary = 'token=ghp_1234567890abcdefABCDEF1234567890abcdef'
    const md = renderProgressMarkdown(tainted)
    expect(md).not.toContain('ghp_1234567890abcdefABCDEF1234567890abcdef')
    expect(md).toContain('[REDACTED:')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/renderers/markdown.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the progress side of `markdown.ts`**

Create `src/observability/renderers/markdown.ts`:

```typescript
import type { EngineOutput, AvailabilityMap, AdapterStatus } from '../engine/types'
import { scrubSecrets, sanitizePath } from '../engine/redact'

function fmtDate(iso: string): string {
  const d = new Date(iso); if (isNaN(d.valueOf())) return iso
  return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC')
}
function header(out: EngineOutput, kind: 'Progress' | 'Audit'): string {
  const lines = [
    `# Build Observability — ${kind}`,
    '',
    `**Generated:** ${fmtDate(out.invocation.started_at)}`,
    `**Scaffold version:** ${out.invocation.scaffold_version}`,
  ]
  return lines.join('\n')
}

function availabilityTable(a: AvailabilityMap): string {
  const ord: (keyof AvailabilityMap)[] = ['git', 'gh', 'pipeline_docs', 'tests', 'state', 'beads', 'mmr', 'audit_history']
  const rows = ord.map((k) => {
    const s = a[k] as AdapterStatus
    const reason = s.reason ? sanitizePath(s.reason) : ''
    return `| ${k} | ${s.status} | ${reason} |`
  })
  return ['## Availability', '', '| Adapter | Status | Reason / Notes |', '|---|---|---|', ...rows].join('\n')
}

function ledgerSummary(a: AvailabilityMap): string {
  const lines = [
    '## Ledger',
    '',
    `- Events read: ${a.ledger.events_read}`,
    `- Malformed lines: ${a.ledger.malformed_lines}`,
    `- Sources:`,
    ...a.ledger.sources.map((s) => `  - \`${s.worktree_id}\` — ${s.events} events${s.harvested_at ? ` (harvested ${fmtDate(s.harvested_at)})` : ''}`),
  ]
  return lines.join('\n')
}

function activeAgentsSection(out: EngineOutput): string {
  const ag = out.snapshot?.active_agents ?? []
  if (ag.length === 0) return ''
  const rows = ag.map((a) => {
    const task = a.current_task ? `${a.current_task.id ?? '(unplanned)'} — ${a.current_task.title}` : 'idle'
    const pr = a.open_pr ? ` (PR #${a.open_pr.number})` : ''
    return `| ${a.actor_label} | ${a.branch} | ${task}${pr} |`
  })
  return ['## Active Agents', '', '| Actor | Branch | Current Task |', '|---|---|---|', ...rows].join('\n')
}

function completedSection(out: EngineOutput): string {
  const cs = out.snapshot?.completed_in_window ?? []
  if (cs.length === 0) return ''
  const rows = cs.map((c) => {
    const pr = c.pr_number ? `PR #${c.pr_number}` : '—'
    return `| ${c.task_id ?? '(unplanned)'} | ${c.task_title} | ${c.outcome} | ${pr} | ${c.by} |`
  })
  return ['## Completed in Window', '', '| Task | Title | Outcome | PR | By |', '|---|---|---|---|---|', ...rows].join('\n')
}

function inFlightSection(out: EngineOutput): string {
  const ts = out.snapshot?.in_flight ?? []
  if (ts.length === 0) return ''
  const rows = ts.map((t) => `| ${t.task_id} | ${t.task_title} | ${t.by} | ${t.age_hours}h | ${t.branch} |`)
  return ['## In Flight', '', '| Task | Title | By | Age | Branch |', '|---|---|---|---|---|', ...rows].join('\n')
}

function decisionsSection(out: EngineOutput): string {
  const ds = out.snapshot?.recent_decisions ?? []
  if (ds.length === 0) return ''
  const rows = ds.slice(0, 10).map((d) =>
    `| \`${d.key}\` | ${d.summary} | ${fmtDate(d.recorded_at)} | ${d.affects.length > 0 ? d.affects.join(', ') : '—'} |`)
  return ['## Recent Decisions', '', '| Key | Summary | Recorded | Affects |', '|---|---|---|---|', ...rows].join('\n')
}

export function renderProgressMarkdown(out: EngineOutput): string {
  const sinceHours = Number(out.invocation.args.sinceHours ?? 24)
  const windowEnd = fmtDate(out.invocation.started_at)
  const sections = [
    header(out, 'Progress'),
    '',
    `**Window:** last ${sinceHours} hours (ending ${windowEnd})`,
    `**Phase:** ${out.snapshot?.current_phase ?? '(unknown)'}`,
    '',
    activeAgentsSection(out),
    inFlightSection(out),
    completedSection(out),
    decisionsSection(out),
    availabilityTable(out.availability),
    '',
    ledgerSummary(out.availability),
  ].filter(Boolean)
  return scrubSecrets(sections.join('\n\n')) + '\n'
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/renderers/markdown.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/renderers/markdown.ts src/observability/renderers/markdown.test.ts
git commit -m "observability: markdown progress renderer (header + sections + availability + ledger summary; redacted)"
```

---

## Task 3: Markdown audit renderer

**Files:**
- Modify: `src/observability/renderers/markdown.ts`
- Modify: `src/observability/renderers/markdown.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/renderers/markdown.test.ts`:

```typescript
import { renderAuditMarkdown } from './markdown'

describe('renderAuditMarkdown', () => {
  const auditFixture: EngineOutput = {
    ...fixture,
    invocation: { ...fixture.invocation, command: 'audit', args: { profile: 'fast', scope: 'all' } },
    snapshot: null,
    findings: [
      { id: '3a8c1f0211223344', lens_id: 'B-ac-coverage', severity: 'P0',
        title: 'AC has failing test', description: 'src/auth/test.spec.ts is failing.',
        source_doc: 'docs/user-stories.md#user-auth-1',
        evidence: { kind: 'rule_violation', rule_id: 'ac-test-failing', file: 'file:src/auth/test.spec.ts' },
        confidence: 'high', first_seen: '2026-05-04T00:00:00Z', last_seen: '2026-05-04T00:00:00Z', status: 'open',
        fix_hint: { kind: 'add_test', target: 'src/auth/test.spec.ts', prompt: 'Re-enable test' } },
      { id: '9d1e02f455667788', lens_id: 'A-tdd', severity: 'P1',
        title: 'AC without test', description: 'AC has no test.', source_doc: 'docs/user-stories.md#story-s-1',
        evidence: { kind: 'ac_not_covered', story_id: 'story:s-1', ac_id: 'ac:s-1.1', missing_tests: [] },
        confidence: 'medium', first_seen: '2026-05-04T00:00:00Z', last_seen: '2026-05-04T00:00:00Z', status: 'acknowledged', ack_note: 'tracked separately' },
    ],
    fix_threshold: 'P1', verdict: 'blocked',
    summary: {
      total: 2, by_severity: { P0: 1, P1: 1, P2: 0, P3: 0 },
      by_severity_status: {
        P0: { open: 1, acknowledged: 0, skipped: 0 }, P1: { open: 0, acknowledged: 1, skipped: 0 },
        P2: { open: 0, acknowledged: 0, skipped: 0 }, P3: { open: 0, acknowledged: 0, skipped: 0 },
      },
      blocking: 1, acknowledged: 1, skipped_lenses: 0,
    },
  }

  it('renders verdict, threshold, summary table, and one section per finding', () => {
    const md = renderAuditMarkdown(auditFixture)
    expect(md).toMatch(/^# Build Observability — Audit/m)
    expect(md).toContain('**Verdict:** blocked')
    expect(md).toContain('**Profile:** fast')
    expect(md).toContain('**Scope:** all')
    expect(md).toContain('**Fix threshold:** P1')
    expect(md).toContain('## Summary')
    expect(md).toMatch(/\| P0 \| 1 \| 1 \| 0 \|/)
    expect(md).toContain('## Findings')
    expect(md).toContain('### [P0] B-ac-coverage — AC has failing test')
    expect(md).toContain('`3a8c1f02')
    expect(md).toContain('## Acknowledged')
    expect(md).toContain('tracked separately')
  })

  it('omits Acknowledged section when there are none', () => {
    const out = JSON.parse(JSON.stringify(auditFixture)) as EngineOutput
    out.findings = out.findings.filter((f) => f.status !== 'acknowledged')
    out.summary.acknowledged = 0
    out.summary.by_severity_status.P1 = { open: 1, acknowledged: 0, skipped: 0 }
    const md = renderAuditMarkdown(out)
    expect(md).not.toContain('## Acknowledged')
  })

  it('emits a Skipped Lenses section when any lens skipped', () => {
    const out = JSON.parse(JSON.stringify(auditFixture)) as EngineOutput
    out.findings.push({
      id: 'ffeeddccbbaa9988', lens_id: 'D-stack', severity: 'P3',
      title: 'D-stack: skipped', description: 'pipeline_docs unavailable',
      source_doc: '', evidence: { kind: 'lens_skipped', reason: 'adapter_unavailable', needed: ['pipeline_docs'] },
      confidence: 'high', first_seen: '', last_seen: '', status: 'skipped',
    })
    out.summary.skipped_lenses = 1
    const md = renderAuditMarkdown(out)
    expect(md).toContain('## Skipped Lenses')
    expect(md).toContain('D-stack')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/renderers/markdown.test.ts
```

Expected: FAIL — `renderAuditMarkdown` not exported.

- [ ] **Step 3: Append `renderAuditMarkdown` to `markdown.ts`**

Append to `src/observability/renderers/markdown.ts`:

```typescript
import type { Finding, Severity } from '../engine/types'

const SEVERITIES: Severity[] = ['P0', 'P1', 'P2', 'P3']

function summaryTable(out: EngineOutput): string {
  const rows = SEVERITIES.map((s) => {
    const total = out.summary.by_severity[s]
    const stat = out.summary.by_severity_status[s]
    const visible = stat.open
    return `| ${s} | ${total} | ${visible} | ${stat.acknowledged} |`
  })
  const header = [
    '## Summary',
    '',
    `${out.summary.total} findings · ${out.summary.blocking} blocking (severity at or above ${out.fix_threshold}) · ${out.summary.acknowledged} acknowledged · ${out.summary.skipped_lenses} skipped lenses.`,
    '',
    '| Severity | Total | Visible | Acknowledged |',
    '|---|---|---|---|',
    ...rows,
  ]
  return header.join('\n')
}

function findingSection(f: Finding): string {
  const idShort = f.id.slice(0, 8)
  const lines = [
    `### [${f.severity}] ${f.lens_id} — ${f.title}`,
    '',
    `\`${idShort}\` · *source:* \`${f.source_doc || '—'}\` · *confidence:* ${f.confidence}`,
    '',
    f.description,
    '',
    '**Evidence:**',
    '',
    '```json',
    JSON.stringify(f.evidence, null, 2),
    '```',
  ]
  if (f.fix_hint) {
    lines.push('', '**Fix hint:**', '', '```json', JSON.stringify(f.fix_hint, null, 2), '```')
  }
  return lines.join('\n')
}

function findingsSection(out: EngineOutput): string {
  const visible = out.findings.filter((f) => f.status !== 'acknowledged' && f.status !== 'skipped')
  if (visible.length === 0) return '## Findings\n\nNo open findings.'
  const grouped: string[] = ['## Findings']
  for (const sev of SEVERITIES) {
    const inSev = visible.filter((f) => f.severity === sev)
    if (inSev.length === 0) continue
    grouped.push('', `### Severity ${sev} (${inSev.length})`, '')
    for (const f of inSev) grouped.push(findingSection(f), '')
  }
  return grouped.join('\n')
}

function acknowledgedSection(out: EngineOutput): string {
  const acks = out.findings.filter((f) => f.status === 'acknowledged')
  if (acks.length === 0) return ''
  const rows = acks.map((f) => `| \`${f.id.slice(0, 8)}\` | ${f.severity} | ${f.lens_id} | ${f.title} | ${f.ack_note ?? ''} |`)
  return ['## Acknowledged', '', '| ID | Severity | Lens | Title | Note |', '|---|---|---|---|---|', ...rows].join('\n')
}

function skippedSection(out: EngineOutput): string {
  const skipped = out.findings.filter((f) => f.status === 'skipped')
  if (skipped.length === 0) return ''
  const rows = skipped.map((f) => `| ${f.lens_id} | ${(f.evidence as { reason?: string }).reason ?? '—'} |`)
  return ['## Skipped Lenses', '', '| Lens | Reason |', '|---|---|', ...rows].join('\n')
}

export function renderAuditMarkdown(out: EngineOutput): string {
  const args = out.invocation.args as { profile?: string; scope?: string }
  const sections = [
    header(out, 'Audit'),
    '',
    `**Verdict:** ${out.verdict}`,
    `**Profile:** ${args.profile ?? '?'}`,
    `**Scope:** ${args.scope ?? '?'}`,
    `**Fix threshold:** ${out.fix_threshold}`,
    '',
    summaryTable(out),
    findingsSection(out),
    acknowledgedSection(out),
    skippedSection(out),
    availabilityTable(out.availability),
  ].filter(Boolean)
  return scrubSecrets(sections.join('\n\n')) + '\n'
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/renderers/markdown.test.ts
```

Expected: PASS, 6 tests total (3 from Task 2 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/observability/renderers/markdown.ts src/observability/renderers/markdown.test.ts
git commit -m "observability: markdown audit renderer (verdict + summary table + grouped findings + acknowledged + skipped sections)"
```

---

## Task 4: JSON sidecar writer

**Files:**
- Create: `src/observability/renderers/sidecar.ts`
- Create: `src/observability/renderers/sidecar.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/renderers/sidecar.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeSidecar, sidecarPath, deriveReportId } from './sidecar'
import type { EngineOutput } from '../engine/types'

const baseOut: EngineOutput = {
  schema_version: '1.0',
  invocation: { command: 'audit', args: { profile: 'fast', scope: 'all' }, started_at: '2026-05-04T14:22:00Z', completed_at: '2026-05-04T14:22:01Z', scaffold_version: '3.25.1' },
  availability: {
    git: { status: 'available' }, gh: { status: 'unavailable' },
    pipeline_docs: { status: 'available' }, tests: { status: 'available' },
    state: { status: 'available' }, beads: { status: 'unavailable' },
    mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
    ledger: { events_read: 0, malformed_lines: 0, sources: [] },
  },
  snapshot: null, replay: null, findings: [], needs_attention: [],
  graph_stats: { nodes_by_kind: {}, edges_by_kind: {}, orphans_by_kind: {}, unsanctioned_uses: 0, ad_hoc_token_uses: 0 },
  fix_threshold: 'P2', verdict: 'pass',
  summary: { total: 0, by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 },
    by_severity_status: { P0: { open: 0, acknowledged: 0, skipped: 0 }, P1: { open: 0, acknowledged: 0, skipped: 0 }, P2: { open: 0, acknowledged: 0, skipped: 0 }, P3: { open: 0, acknowledged: 0, skipped: 0 } },
    blocking: 0, acknowledged: 0, skipped_lenses: 0 },
}

describe('sidecar', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-sc-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('deriveReportId formats audit ids by date + profile + scope', () => {
    expect(deriveReportId(baseOut)).toMatch(/^audit-\d{4}-\d{2}-\d{2}-\d{4}-fast-all$/)
  })

  it('deriveReportId formats single-lens audits as audit-<date>-<profile>-lens-<id>', () => {
    const out = { ...baseOut, invocation: { ...baseOut.invocation, args: { profile: 'fast', scope: 'all', lensIds: ['B-ac-coverage'] } } }
    expect(deriveReportId(out)).toMatch(/^audit-\d{4}-\d{2}-\d{2}-\d{4}-fast-lens-B-ac-coverage$/)
  })

  it('deriveReportId formats progress reports as progress-<date>', () => {
    const out = { ...baseOut, invocation: { ...baseOut.invocation, command: 'progress' as const, args: {} } }
    expect(deriveReportId(out)).toMatch(/^progress-\d{4}-\d{2}-\d{2}-\d{4}$/)
  })

  it('sidecarPath returns docs/audits/<id>.json for audit, docs/build-status/<id>.json for progress', () => {
    expect(sidecarPath(deriveReportId(baseOut), 'audit')).toMatch(/^docs\/audits\/audit-/)
    const pOut = { ...baseOut, invocation: { ...baseOut.invocation, command: 'progress' as const, args: {} } }
    expect(sidecarPath(deriveReportId(pOut), 'progress')).toMatch(/^docs\/build-status\/progress-/)
  })

  it('writeSidecar writes a redacted EngineOutput wrapped under engine_output', async () => {
    const path = await writeSidecar(dir, baseOut)
    expect(existsSync(path)).toBe(true)
    const obj = JSON.parse(readFileSync(path, 'utf8')) as { report_id: string; engine_output: EngineOutput }
    expect(obj.report_id).toBe(deriveReportId(baseOut))
    expect(obj.engine_output.schema_version).toBe('1.0')
    expect(obj.engine_output.verdict).toBe('pass')
  })

  it('writeSidecar redacts paths/secrets in the persisted file', async () => {
    const tainted = JSON.parse(JSON.stringify(baseOut)) as EngineOutput
    tainted.invocation.args = { ...tainted.invocation.args, dirty: '/Users/alice/Documents/repo/file.ts' }
    const path = await writeSidecar(dir, tainted)
    const text = readFileSync(path, 'utf8')
    expect(text).not.toContain('/Users/alice')
    expect(text).toContain('~')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/renderers/sidecar.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `sidecar.ts`**

Create `src/observability/renderers/sidecar.ts`:

```typescript
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { EngineOutput } from '../engine/types'
import { redactEngineOutput } from '../engine/redact'

function dateStamp(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
}

export function deriveReportId(out: EngineOutput): string {
  const stamp = dateStamp(out.invocation.started_at)
  if (out.invocation.command === 'progress') return `progress-${stamp}`
  const args = out.invocation.args as { profile?: string; scope?: string; lensIds?: string[] }
  const profile = args.profile ?? 'fast'
  if (Array.isArray(args.lensIds) && args.lensIds.length === 1) {
    return `audit-${stamp}-${profile}-lens-${args.lensIds[0]}`
  }
  return `audit-${stamp}-${profile}-${args.scope ?? 'all'}`
}

export function sidecarPath(reportId: string, command: 'progress' | 'audit'): string {
  const dir = command === 'progress' ? 'docs/build-status' : 'docs/audits'
  return `${dir}/${reportId}.json`
}

export async function writeSidecar(cwd: string, out: EngineOutput, overridePath?: string): Promise<string> {
  const reportId = deriveReportId(out)
  const relPath = overridePath ?? sidecarPath(reportId, out.invocation.command)
  const absPath = join(cwd, relPath)
  mkdirSync(dirname(absPath), { recursive: true })
  const redacted = redactEngineOutput(out)
  const wrapper = { report_id: reportId, engine_output: redacted }
  writeFileSync(absPath, JSON.stringify(wrapper, null, 2) + '\n', { mode: 0o644 })
  return absPath
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/renderers/sidecar.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/observability/renderers/sidecar.ts src/observability/renderers/sidecar.test.ts
git commit -m "observability: JSON sidecar writer (deriveReportId + sidecarPath + redacted wrapper write)"
```

---

## Task 5: Integrate markdown + sidecar writes into CLI handlers

When `progress` and `audit` are invoked without `--json`, they should write the markdown report + sidecar in addition to printing the terminal view. `--json` mode prints JSON to stdout but **also** writes the sidecar (so audit-history has trend data even when consumers never read the markdown). `--output=<path>` overrides the markdown destination; the sidecar still goes to its standard `docs/audits/` or `docs/build-status/` location.

**Files:**
- Modify: `src/cli/commands/observe.ts`
- Modify: `src/cli/commands/observe.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/cli/commands/observe.test.ts`:

```typescript
describe('observe progress + audit write markdown reports and sidecars', () => {
  let proj: string
  beforeEach(async () => {
    proj = mkdtempSync(join(tmpdir(), 'observe-md-'))
    execSync('git init -q', { cwd: proj })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: proj, shell: '/bin/sh' })
    ensureIdentity(proj, 'primary')
    mkdirSync(join(proj, 'docs'), { recursive: true })
    writeFileSync(join(proj, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }))
    writeFileSync(join(proj, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: must]\n')
    writeFileSync(join(proj, 'docs/user-stories.md'),
`## Story s-1: T [priority: must]\n\n### AC 1: t\nGiven X.\n`)
    writeFileSync(join(proj, 'docs/tdd-standards.md'), '# TDD\n')
    await writeEvent(proj, { type: 'task_claimed', branch: 'a', task_id: 'T-1', payload: { task_title: 'A' } })
    // (no harvest needed; primary worktree's ledger is read directly by the synthesizer when no central archive exists)
  })
  afterEach(() => { rmSync(proj, { recursive: true, force: true }) })

  it('progress writes docs/build-status/<id>.md and .json', async () => {
    const code = await handleProgress({ cwd: proj, json: false, sinceHours: 24, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    expect(code).toBe(0)
    const files = readdirSync(join(proj, 'docs/build-status'))
    expect(files.find((f) => /^progress-.*\.md$/.test(f))).toBeDefined()
    expect(files.find((f) => /^progress-.*\.json$/.test(f))).toBeDefined()
  })

  it('audit writes docs/audits/<id>.md and .json', async () => {
    const code = await handleAudit({
      cwd: proj, json: false, profile: 'fast', scope: 'all', sinceHours: 24,
      ghBin: '/no/such/gh', bdBin: '/no/such/bd',
    })
    expect([0, 1]).toContain(code)
    const files = readdirSync(join(proj, 'docs/audits'))
    expect(files.find((f) => /^audit-.*\.md$/.test(f))).toBeDefined()
    expect(files.find((f) => /^audit-.*\.json$/.test(f))).toBeDefined()
  })

  it('--json still writes the sidecar (so audit-history has trend data)', async () => {
    let captured = ''
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((s: string | Uint8Array) => { captured += String(s); return true }) as never
    try {
      await handleAudit({ cwd: proj, json: true, profile: 'fast', scope: 'all', sinceHours: 24, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    } finally { process.stdout.write = origWrite }
    expect(JSON.parse(captured).schema_version).toBe('1.0')
    const files = readdirSync(join(proj, 'docs/audits'))
    expect(files.find((f) => /\.json$/.test(f))).toBeDefined()
  })

  it('--output=<path> overrides the markdown path but keeps the standard sidecar location', async () => {
    const customMd = join(proj, 'tmp-out.md')
    await handleProgress({ cwd: proj, json: false, sinceHours: 24, output: customMd, ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    expect(existsSync(customMd)).toBe(true)
    expect(readdirSync(join(proj, 'docs/build-status')).find((f) => f.endsWith('.json'))).toBeDefined()
  })
})
```

(Add `import { readdirSync, existsSync } from 'node:fs'` at the top of the test file if not already imported.)

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: FAIL — handlers don't yet write markdown/sidecars.

- [ ] **Step 3: Update handlers**

In `src/cli/commands/observe.ts`, update `HandleProgressInput` and `HandleAuditInput` to accept `output?: string`, and modify the bodies:

```typescript
import { renderProgressMarkdown, renderAuditMarkdown } from '../../observability/renderers/markdown'
import { writeSidecar, deriveReportId, sidecarPath } from '../../observability/renderers/sidecar'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join as joinPath } from 'node:path'

export interface HandleProgressInput {
  cwd: string
  json: boolean
  sinceHours: number
  maskPaths?: boolean
  output?: string         // explicit markdown destination
  ghBin?: string
  bdBin?: string
}

export interface HandleAuditInput {
  cwd: string
  json: boolean
  profile: 'fast' | 'full'
  scope: 'docs' | 'code' | 'all'
  sinceHours: number
  lensIds?: string[]
  fixThresholdOverride?: string
  maskPaths?: boolean
  showAcknowledged?: boolean
  output?: string
  ghBin?: string
  bdBin?: string
}

function writeMarkdownReport(cwd: string, out: EngineOutput, body: string, overridePath?: string): string {
  const relPath = overridePath ?? sidecarPath(deriveReportId(out), out.invocation.command).replace(/\.json$/, '.md')
  const absPath = overridePath && overridePath.startsWith('/') ? overridePath : joinPath(cwd, relPath)
  mkdirSync(dirname(absPath), { recursive: true })
  writeFileSync(absPath, body, { mode: 0o644 })
  return absPath
}

export async function handleProgress(input: HandleProgressInput): Promise<number> {
  try {
    const out = await runProgress({
      primaryRoot: input.cwd, sinceHours: input.sinceHours,
      ghBin: input.ghBin, bdBin: input.bdBin,
      args: { sinceHours: input.sinceHours },
    })
    const sidecarFinal = await writeSidecar(input.cwd, out)
    if (input.json) {
      const blob = JSON.stringify(out, null, 2)
      process.stdout.write((input.maskPaths ? redactRendered(blob) : blob) + '\n')
    } else {
      const md = renderProgressMarkdown(out)
      const mdFinal = writeMarkdownReport(input.cwd, out, md, input.output)
      process.stdout.write(renderProgressTerminal(out) + '\n')
      process.stdout.write(`\n(written: ${mdFinal} + ${sidecarFinal})\n`)
    }
    return 0
  } catch (err: unknown) {
    process.stderr.write(`scaffold observe progress: ${(err as Error).message}\n`)
    return 3
  }
}

export async function handleAudit(input: HandleAuditInput): Promise<number> {
  try {
    const out = await runAudit({
      primaryRoot: input.cwd, profile: input.profile, scope: input.scope,
      sinceHours: input.sinceHours, lensIds: input.lensIds,
      fixThresholdOverride: input.fixThresholdOverride,
      ghBin: input.ghBin, bdBin: input.bdBin,
      args: { profile: input.profile, scope: input.scope, lensIds: input.lensIds, fixThreshold: input.fixThresholdOverride },
    })
    const sidecarFinal = await writeSidecar(input.cwd, out)
    if (input.json) {
      const blob = JSON.stringify(out, null, 2)
      process.stdout.write((input.maskPaths ? redactRendered(blob) : blob) + '\n')
    } else {
      const md = renderAuditMarkdown(out)
      const mdFinal = writeMarkdownReport(input.cwd, out, md, input.output)
      process.stdout.write(renderAuditTerminal(out, { showAcknowledged: input.showAcknowledged ?? false }) + '\n')
      process.stdout.write(`\n(written: ${mdFinal} + ${sidecarFinal})\n`)
    }
    return out.verdict === 'blocked' ? 1 : 0
  } catch (err: unknown) {
    process.stderr.write(`scaffold observe audit: ${(err as Error).message}\n`)
    return 3
  }
}
```

- [ ] **Step 4: Update CLI registration in `src/cli/index.ts`**

Add `--output` option to both `progress` and `audit` subcommand builders. Inside the existing yargs builder fragment from Plan 1 Task 25 / Plan 2 Task 25:

```typescript
.option('output', { type: 'string', describe: 'Override markdown report destination path' })
```

Pass the value into the handler call:

```typescript
output: argv.output as string | undefined,
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: PASS, all CLI tests.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/observe.ts src/cli/commands/observe.test.ts src/cli/index.ts
git commit -m "observability: progress/audit handlers write markdown + sidecar; --output overrides markdown path"
```

---

## Task 6: `audit-history` adapter — populate sidecar parsing + trend helpers

Plan 1's adapter only checks for sidecar presence. Now that Plan 4 writes sidecars, the adapter exposes parsed trend data: severity-tier counts over time, lens-skipped streaks (used by stall detection in Plan 5).

**Files:**
- Modify: `src/observability/adapters/audit-history.ts`
- Modify: `src/observability/adapters/audit-history.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/adapters/audit-history.test.ts`:

```typescript
import { auditHistoryAdapter } from './audit-history'

describe('audit_history adapter — parse trend data', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-ah2-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('listSidecars returns sidecar paths sorted newest-first', async () => {
    mkdirSync(join(dir, 'docs/audits'), { recursive: true })
    writeFileSync(join(dir, 'docs/audits/audit-2026-04-30-1422-fast-all.json'), JSON.stringify({
      report_id: 'audit-2026-04-30-1422-fast-all',
      engine_output: { schema_version: '1.0', invocation: { command: 'audit', started_at: '2026-04-30T14:22:00Z' }, summary: { total: 5 } },
    }))
    await new Promise((r) => setTimeout(r, 30))
    writeFileSync(join(dir, 'docs/audits/audit-2026-05-01-0900-fast-all.json'), JSON.stringify({
      report_id: 'audit-2026-05-01-0900-fast-all',
      engine_output: { schema_version: '1.0', invocation: { command: 'audit', started_at: '2026-05-01T09:00:00Z' }, summary: { total: 3 } },
    }))
    const list = await auditHistoryAdapter.listSidecars(dir)
    expect(list[0]).toMatch(/2026-05-01/)
  })

  it('readTrends returns severity counts over time, newest first', async () => {
    mkdirSync(join(dir, 'docs/audits'), { recursive: true })
    writeFileSync(join(dir, 'docs/audits/audit-2026-04-30-1422-fast-all.json'), JSON.stringify({
      report_id: 'audit-2026-04-30-1422-fast-all',
      engine_output: { schema_version: '1.0',
        invocation: { command: 'audit', started_at: '2026-04-30T14:22:00Z' },
        summary: { total: 5, by_severity: { P0: 1, P1: 2, P2: 2, P3: 0 }, blocking: 3, acknowledged: 0, skipped_lenses: 0 } },
    }))
    writeFileSync(join(dir, 'docs/audits/audit-2026-05-01-0900-fast-all.json'), JSON.stringify({
      report_id: 'audit-2026-05-01-0900-fast-all',
      engine_output: { schema_version: '1.0',
        invocation: { command: 'audit', started_at: '2026-05-01T09:00:00Z' },
        summary: { total: 3, by_severity: { P0: 0, P1: 1, P2: 2, P3: 0 }, blocking: 1, acknowledged: 0, skipped_lenses: 0 } },
    }))
    const trends = await auditHistoryAdapter.readTrends(dir)
    expect(trends).toHaveLength(2)
    expect(trends[0]).toMatchObject({ ts: '2026-05-01T09:00:00Z', total: 3, blocking: 1 })
    expect(trends[1]).toMatchObject({ ts: '2026-04-30T14:22:00Z', total: 5, blocking: 3 })
  })

  it('lensSkippedStreaks counts consecutive recent runs where a lens was skipped', async () => {
    mkdirSync(join(dir, 'docs/audits'), { recursive: true })
    const mkRun = (path: string, ts: string, skippedLenses: string[]) =>
      writeFileSync(join(dir, path), JSON.stringify({
        report_id: path.replace(/^docs\/audits\//, '').replace(/\.json$/, ''),
        engine_output: {
          schema_version: '1.0',
          invocation: { command: 'audit', started_at: ts },
          summary: { total: 0, by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 }, blocking: 0, acknowledged: 0, skipped_lenses: skippedLenses.length },
          findings: skippedLenses.map((id) => ({ id: `skipped-${id}`, lens_id: id, severity: 'P3', status: 'skipped',
            evidence: { kind: 'lens_skipped', reason: 'adapter_unavailable', needed: ['gh'] },
            confidence: 'high', title: '', description: '', source_doc: '', first_seen: '', last_seen: '' })),
        },
      }))
    mkRun('docs/audits/audit-2026-04-29-fast-all.json', '2026-04-29T00:00:00Z', ['B-ac-coverage'])
    mkRun('docs/audits/audit-2026-04-30-fast-all.json', '2026-04-30T00:00:00Z', ['B-ac-coverage'])
    mkRun('docs/audits/audit-2026-05-01-fast-all.json', '2026-05-01T00:00:00Z', ['B-ac-coverage', 'F-scope'])
    const streaks = await auditHistoryAdapter.lensSkippedStreaks(dir)
    expect(streaks['B-ac-coverage']).toBe(3)
    expect(streaks['F-scope']).toBe(1)
  })

  it('probe returns available when sidecars exist (regression of Plan 1 contract)', async () => {
    mkdirSync(join(dir, 'docs/audits'), { recursive: true })
    writeFileSync(join(dir, 'docs/audits/x.json'), '{}')
    expect((await auditHistoryAdapter.probe(dir)).status).toBe('available')
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/adapters/audit-history.test.ts
```

Expected: FAIL — `readTrends` and `lensSkippedStreaks` not exported.

- [ ] **Step 3: Implement the trend helpers**

Replace `src/observability/adapters/audit-history.ts`:

```typescript
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types'
import type { Severity } from '../engine/types'

const DIR = 'docs/audits'

interface SidecarShape {
  engine_output: {
    schema_version: string
    invocation: { command: 'audit' | 'progress'; started_at: string }
    summary?: {
      total: number
      by_severity: Record<Severity, number>
      blocking: number
      acknowledged: number
      skipped_lenses: number
    }
    findings?: Array<{ lens_id: string; status: string; evidence?: { kind?: string } }>
  }
}

function listJsonFiles(cwd: string): string[] {
  const d = join(cwd, DIR)
  if (!existsSync(d)) return []
  return readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => join(d, f))
}

function safeRead(path: string): SidecarShape | null {
  try { return JSON.parse(readFileSync(path, 'utf8')) as SidecarShape } catch { return null }
}

export interface AuditTrendPoint {
  ts: string
  total: number
  blocking: number
  acknowledged: number
  skipped_lenses: number
  by_severity: Record<Severity, number>
}

export const auditHistoryAdapter: BaseAdapter & {
  listSidecars(cwd: string): Promise<string[]>
  readTrends(cwd: string): Promise<AuditTrendPoint[]>
  lensSkippedStreaks(cwd: string): Promise<Record<string, number>>
} = {
  id: 'audit_history',

  async probe(cwd: string): Promise<AdapterStatus> {
    const files = listJsonFiles(cwd)
    if (files.length === 0) return { status: 'unavailable', reason: 'no audit JSON sidecars under docs/audits/' }
    return { status: 'available', evidence_paths: [DIR] }
  },

  async listSidecars(cwd: string): Promise<string[]> {
    const files = listJsonFiles(cwd)
    return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  },

  async readTrends(cwd: string): Promise<AuditTrendPoint[]> {
    const files = listJsonFiles(cwd)
    const points: AuditTrendPoint[] = []
    for (const f of files) {
      const s = safeRead(f)
      if (!s?.engine_output?.summary) continue
      if (s.engine_output.invocation.command !== 'audit') continue
      points.push({
        ts: s.engine_output.invocation.started_at,
        total: s.engine_output.summary.total,
        blocking: s.engine_output.summary.blocking,
        acknowledged: s.engine_output.summary.acknowledged,
        skipped_lenses: s.engine_output.summary.skipped_lenses,
        by_severity: s.engine_output.summary.by_severity,
      })
    }
    return points.sort((a, b) => b.ts.localeCompare(a.ts))
  },

  async lensSkippedStreaks(cwd: string): Promise<Record<string, number>> {
    const files = listJsonFiles(cwd)
    const sidecars = files
      .map((f) => safeRead(f))
      .filter((s): s is SidecarShape => Boolean(s?.engine_output))
      .filter((s) => s.engine_output.invocation.command === 'audit')
      .sort((a, b) => b.engine_output.invocation.started_at.localeCompare(a.engine_output.invocation.started_at))

    const streaks: Record<string, number> = {}
    const stillStreaking = new Set<string>()
    let firstRun = true
    for (const s of sidecars) {
      const skippedThisRun = new Set(
        (s.engine_output.findings ?? [])
          .filter((f) => f.status === 'skipped' && f.evidence?.kind === 'lens_skipped')
          .map((f) => f.lens_id),
      )
      if (firstRun) {
        for (const id of skippedThisRun) { streaks[id] = 1; stillStreaking.add(id) }
        firstRun = false
      } else {
        for (const id of [...stillStreaking]) {
          if (skippedThisRun.has(id)) streaks[id] = (streaks[id] ?? 0) + 1
          else stillStreaking.delete(id)
        }
      }
    }
    return streaks
  },
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/adapters/audit-history.test.ts
```

Expected: PASS, 7 tests total (3 from Plan 1 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/observability/adapters/audit-history.ts src/observability/adapters/audit-history.test.ts
git commit -m "observability: audit_history adapter — readTrends + lensSkippedStreaks (closes the trend loop)"
```

---

## Task 7: `file_to_token_use` edge gains optional `property` payload

**Files:**
- Modify: `src/observability/engine/types.ts`
- Modify: `src/observability/engine/types.test.ts`
- Modify: `src/observability/engine/doc-graph/edge-builder.ts`
- Modify: `src/observability/engine/doc-graph/edge-builder.test.ts`

- [ ] **Step 1: Update the edge type**

In `src/observability/engine/types.ts`, replace the `file_to_token_use` edge variant in the `Edge` union:

```typescript
  | { kind: 'file_to_token_use';         from: FileNodeId;     to: TokenId | 'ad_hoc'; property?: string }
```

(`property` is optional — older Plan 3 callers that don't pass it stay valid; new Lens E logic depends on it being present.)

- [ ] **Step 2: Append the failing edge-builder test**

Append to `src/observability/engine/doc-graph/edge-builder.test.ts`:

```typescript
it('preserves the `property` field on file_to_token_use edges when provided by the detector', () => {
  const tokenUses = [
    { file: 'src/styles/btn.css', property: 'color',   value: '#4f46e5', token_id: 'token:--color-primary' },
    { file: 'src/styles/btn.css', property: 'padding', value: '8px',     token_id: 'ad_hoc' },
  ]
  const result = buildEdges({ ...minimalInput, token_uses: tokenUses } as never)
  const edges = result.edges.filter((e) => e.kind === 'file_to_token_use') as Array<{ kind: 'file_to_token_use'; from: string; to: string; property?: string }>
  expect(edges[0].property).toBe('color')
  expect(edges[1].property).toBe('padding')
})
```

- [ ] **Step 3: Run the edge-builder test to confirm it fails**

```bash
npx vitest run src/observability/engine/doc-graph/edge-builder.test.ts
```

Expected: FAIL — `property` not propagated.

- [ ] **Step 4: Update the edge builder**

In `src/observability/engine/doc-graph/edge-builder.ts`, change the `file_to_token_use` block:

```typescript
  for (const use of input.token_uses ?? []) {
    const fileId = fileIdByPath.get(use.file) ?? `file:${use.file}`
    edges.push({ kind: 'file_to_token_use', from: fileId, to: use.token_id as never, property: use.property })
  }
```

- [ ] **Step 5: Run all doc-graph tests**

```bash
npx vitest run src/observability/engine/doc-graph/
```

Expected: PASS — all existing + the new property-propagation test.

- [ ] **Step 6: Commit**

```bash
git add src/observability/engine/types.ts src/observability/engine/doc-graph/edge-builder.ts src/observability/engine/doc-graph/edge-builder.test.ts
git commit -m "observability: file_to_token_use edges carry optional property payload (used by Lens E refinement)"
```

---

## Task 8: Refine Lens E — property-level must-priority check

Replace Plan 3's file-level "any must-priority category triggers P0" heuristic with a precise check: emit P0 only when the *specific* property on the ad-hoc edge belongs to a category that has a `priority: must` token in the design system.

**Files:**
- Modify: `src/observability/checks/lens-e-design.ts`
- Modify: `src/observability/checks/lens-e-design.test.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/observability/checks/lens-e-design.test.ts`:

```typescript
it('emits P0 only for ad-hoc uses on properties whose category has a must-priority token', async () => {
  mkdirSync(join(dir, 'docs'), { recursive: true })
  mkdirSync(join(dir, 'src/components'), { recursive: true })
  mkdirSync(join(dir, '.scaffold'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), '{}')
  // Only color is must-priority; spacing is not in the design system at all.
  writeFileSync(join(dir, 'docs/design-system.md'),
`## Colors\n\n| Token | Value | Priority |\n|---|---|---|\n| --color-primary | #4f46e5 | must |\n`)
  writeFileSync(join(dir, '.scaffold/observability.yaml'),
    'lenses:\n  E-design:\n    ui_glob: "src/components/**/*.tsx"\n    ad_hoc_token_threshold: 100\n')  // disable file-level
  writeFileSync(join(dir, 'src/components/Btn.tsx'),
    `export const Btn = () => <button style={{ color: '#zz0011', padding: '13px' }} />`)
  const graph = await buildDocGraph(dir)
  const findings = await lensEDesign(graph, { events: [] }, stubAvail, [], new Set(['E-design']))
  // Property `color` is in a must category → P0; `padding` is not → no P0 for spacing.
  expect(findings.find((f) => /must-priority/i.test(f.title) && /color/i.test(f.description))?.severity).toBe('P0')
  expect(findings.find((f) => /must-priority/i.test(f.title) && /padding/i.test(f.description))).toBeUndefined()
})

it('does NOT emit must-priority P0 when the design-system declares no must tokens', async () => {
  mkdirSync(join(dir, 'docs'), { recursive: true })
  mkdirSync(join(dir, 'src/components'), { recursive: true })
  mkdirSync(join(dir, '.scaffold'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), '{}')
  writeFileSync(join(dir, 'docs/design-system.md'),
`## Colors\n\n| Token | Value | Priority |\n|---|---|---|\n| --color-primary | #4f46e5 | should |\n`)
  writeFileSync(join(dir, '.scaffold/observability.yaml'),
    'lenses:\n  E-design:\n    ui_glob: "src/components/**/*.tsx"\n')
  writeFileSync(join(dir, 'src/components/Btn.tsx'),
    `export const Btn = () => <button style={{ color: '#aaa', background: '#bbb', borderColor: '#ccc', padding: '11px' }} />`)
  const graph = await buildDocGraph(dir)
  const findings = await lensEDesign(graph, { events: [] }, stubAvail, [], new Set(['E-design']))
  expect(findings.find((f) => /must-priority/i.test(f.title))).toBeUndefined()
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/checks/lens-e-design.test.ts
```

Expected: FAIL — current implementation is file-level.

- [ ] **Step 3: Replace the must-priority block in `lens-e-design.ts`**

Replace the must-priority section (the loop that emits `must-priority` findings) with a property-aware version. The full updated `lensEDesign` body becomes:

```typescript
const COLOR_PROPS = new Set(['color', 'background', 'background-color', 'border-color', 'fill', 'stroke'])
const SPACING_PROPS = new Set(['margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap', 'top', 'right', 'bottom', 'left'])
const TYPOGRAPHY_PROPS = new Set(['font-size', 'font-family', 'font-weight', 'line-height'])

function categoryOfProp(prop: string | undefined): 'color' | 'spacing' | 'typography' | null {
  if (!prop) return null
  if (COLOR_PROPS.has(prop)) return 'color'
  if (SPACING_PROPS.has(prop)) return 'spacing'
  if (TYPOGRAPHY_PROPS.has(prop)) return 'typography'
  return null
}

export const lensEDesign: LensFn = async (graph) => {
  const findings: Finding[] = []
  const now = new Date().toISOString()
  const config = loadObservabilityConfig(process.cwd())
  const threshold = config.lenses['E-design']?.ad_hoc_token_threshold ?? 3

  // (a) per-file ad-hoc threshold
  const adHocByFile = new Map<string, number>()
  for (const e of graph.edges) {
    if (e.kind !== 'file_to_token_use') continue
    if ((e as { to: string }).to !== 'ad_hoc') continue
    const fileId = (e as { from: string }).from
    adHocByFile.set(fileId, (adHocByFile.get(fileId) ?? 0) + 1)
  }
  for (const [fileId, count] of adHocByFile) {
    if (count <= threshold) continue
    findings.push({
      id: makeFindingId([lensId, 'ad-hoc', fileId]),
      lens_id: lensId, severity: 'P1',
      title: `${count} ad-hoc design values in ${fileId.replace(/^file:/, '')} (threshold: ${threshold})`,
      description: `${fileId.replace(/^file:/, '')} has ${count} style values that don't resolve to design-system tokens.`,
      source_doc: 'docs/design-system.md',
      evidence: { kind: 'rule_violation', rule_id: 'design-ad-hoc-threshold', file: fileId },
      confidence: 'high', first_seen: now, last_seen: now, status: 'open',
      fix_hint: { kind: 'rename_token', target: fileId.replace(/^file:/, ''), prompt: `Replace ad-hoc values with design-system tokens in ${fileId.replace(/^file:/, '')}.` },
    })
  }

  // (b) per-property must-priority bypass — uses the new `property` field on the edge
  const mustCategories = new Set(graph.tokens.filter((t) => t.priority === 'must').map((t) => t.category))
  if (mustCategories.size > 0) {
    for (const e of graph.edges) {
      if (e.kind !== 'file_to_token_use') continue
      if ((e as { to: string }).to !== 'ad_hoc') continue
      const ed = e as { from: string; to: string; property?: string }
      const cat = categoryOfProp(ed.property)
      if (!cat || !mustCategories.has(cat)) continue
      findings.push({
        id: makeFindingId([lensId, 'must-priority', ed.from, ed.property ?? '']),
        lens_id: lensId, severity: 'P0',
        title: `must-priority token bypassed in ${ed.from.replace(/^file:/, '')} (property: ${ed.property})`,
        description: `${ed.from.replace(/^file:/, '')} uses an ad-hoc value for property "${ed.property}" whose category (${cat}) has a must-priority token.`,
        source_doc: 'docs/design-system.md',
        evidence: { kind: 'rule_violation', rule_id: 'design-must-token', file: ed.from },
        confidence: 'high', first_seen: now, last_seen: now, status: 'open',
        fix_hint: { kind: 'rename_token', target: ed.from.replace(/^file:/, ''), prompt: `Replace the ad-hoc ${ed.property} value with the corresponding must-priority token.` },
      })
    }
  }

  return findings
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/checks/lens-e-design.test.ts
```

Expected: PASS — original tests + 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/observability/checks/lens-e-design.ts src/observability/checks/lens-e-design.test.ts
git commit -m "observability: lens E refinement — property-level must-priority check using new edge payload"
```

---

## Task 9: Add severity + verdict tokens to `lib/dashboard-theme.css`

**Files:**
- Modify: `lib/dashboard-theme.css`

- [ ] **Step 1: Read the existing theme file**

```bash
head -60 lib/dashboard-theme.css
```

Locate the section where existing CSS custom properties are declared (typically `:root { --bg: …; --fg: …; }` and a matching `[data-theme="dark"]` block).

- [ ] **Step 2: Add severity + verdict tokens**

Append the following two blocks to `lib/dashboard-theme.css` (preserving the existing convention of light/dark variants):

```css
/* Build-observability severity + verdict tokens (Plan 4) */
:root {
  --sev-p0: #dc2626;        /* red 600 */
  --sev-p1: #ea580c;        /* orange 600 */
  --sev-p2: #ca8a04;        /* yellow 600 */
  --sev-p3: #2563eb;        /* blue 600 */
  --sev-pass: #16a34a;      /* green 600 */
}
[data-theme="dark"] {
  --sev-p0: #f87171;
  --sev-p1: #fb923c;
  --sev-p2: #facc15;
  --sev-p3: #60a5fa;
  --sev-pass: #4ade80;
}
```

- [ ] **Step 3: Verify with shellcheck (and the existing CSS lint pass, if any)**

```bash
make lint
```

Expected: no new lint issues.

- [ ] **Step 4: Commit**

```bash
git add lib/dashboard-theme.css
git commit -m "dashboard-theme: add --sev-p0|p1|p2|p3 + --sev-pass tokens (light + dark)"
```

---

## Task 10: Dashboard fragment renderer

The dashboard renderer emits two named HTML fragments — Build Progress and Audit — designed to be injected at named anchors in `scripts/generate-dashboard.sh`.

**Files:**
- Create: `src/observability/renderers/dashboard.ts`
- Create: `src/observability/renderers/dashboard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/observability/renderers/dashboard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { renderProgressFragment, renderAuditFragment, verdictToSeverityToken } from './dashboard'
import type { EngineOutput } from '../engine/types'

const baseOut: EngineOutput = {
  schema_version: '1.0',
  invocation: { command: 'progress', args: { sinceHours: 24 }, started_at: '2026-05-04T14:00:00Z', completed_at: '2026-05-04T14:00:01Z', scaffold_version: '3.25.1' },
  availability: {
    git: { status: 'available' }, gh: { status: 'unavailable' },
    pipeline_docs: { status: 'available' }, tests: { status: 'available' },
    state: { status: 'available' }, beads: { status: 'unavailable' },
    mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
    ledger: { events_read: 4, malformed_lines: 0, sources: [{ worktree_id: 'wid-a', events: 4 }] },
  },
  snapshot: {
    current_phase: 'build',
    active_agents: [{ worktree_id: 'wid-a', actor_label: 'agent-alice', branch: 'feat-auth',
      current_task: { id: 'T-031', title: 'refresh token rotation', claimed_at: '2026-05-04T13:55:00Z' }, open_pr: null }],
    completed_in_window: [], in_flight: [], blocked: [], upcoming: [],
    recent_decisions: [{ decision_id: 'decision:foo', key: 'foo', summary: 'bar', recorded_at: '2026-05-04T13:00:00Z', affects: [] }],
    story_coverage: [],
  },
  replay: null, findings: [], needs_attention: [],
  graph_stats: { nodes_by_kind: {}, edges_by_kind: {}, orphans_by_kind: {}, unsanctioned_uses: 0, ad_hoc_token_uses: 0 },
  fix_threshold: 'P2', verdict: 'pass',
  summary: { total: 0, by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 },
    by_severity_status: { P0: { open: 0, acknowledged: 0, skipped: 0 }, P1: { open: 0, acknowledged: 0, skipped: 0 }, P2: { open: 0, acknowledged: 0, skipped: 0 }, P3: { open: 0, acknowledged: 0, skipped: 0 } },
    blocking: 0, acknowledged: 0, skipped_lenses: 0 },
}

describe('verdictToSeverityToken', () => {
  it('maps blocked to --sev-p0', () => { expect(verdictToSeverityToken('blocked')).toBe('--sev-p0') })
  it('maps degraded-pass to --sev-p2', () => { expect(verdictToSeverityToken('degraded-pass')).toBe('--sev-p2') })
  it('maps pass to --sev-pass', () => { expect(verdictToSeverityToken('pass')).toBe('--sev-pass') })
})

describe('renderProgressFragment', () => {
  it('emits a self-contained <section id="build-progress"> with active-agents data', () => {
    const html = renderProgressFragment(baseOut)
    expect(html).toMatch(/<section id="build-progress"/)
    expect(html).toContain('agent-alice')
    expect(html).toContain('T-031')
    expect(html).toContain('refresh token rotation')
  })

  it('escapes HTML special characters in user-controlled fields', () => {
    const tainted = JSON.parse(JSON.stringify(baseOut)) as EngineOutput
    tainted.snapshot!.active_agents[0].current_task!.title = 'evil <script>alert(1)</script>'
    const html = renderProgressFragment(tainted)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('renderAuditFragment', () => {
  const auditOut: EngineOutput = { ...baseOut,
    invocation: { ...baseOut.invocation, command: 'audit', args: { profile: 'fast', scope: 'all' } },
    snapshot: null, verdict: 'blocked', fix_threshold: 'P1',
    findings: [
      { id: '3a8c1f02aabbccdd', lens_id: 'B-ac-coverage', severity: 'P0',
        title: 'AC failing', description: 'd', source_doc: 'docs/user-stories.md#s-1',
        evidence: { kind: 'rule_violation', rule_id: 'r', file: 'f' },
        confidence: 'high', first_seen: '', last_seen: '', status: 'open' },
    ],
    summary: { total: 1, by_severity: { P0: 1, P1: 0, P2: 0, P3: 0 },
      by_severity_status: { P0: { open: 1, acknowledged: 0, skipped: 0 }, P1: { open: 0, acknowledged: 0, skipped: 0 }, P2: { open: 0, acknowledged: 0, skipped: 0 }, P3: { open: 0, acknowledged: 0, skipped: 0 } },
      blocking: 1, acknowledged: 0, skipped_lenses: 0 },
  }

  it('emits a self-contained <section id="build-audit"> with verdict + finding data', () => {
    const html = renderAuditFragment(auditOut)
    expect(html).toMatch(/<section id="build-audit"/)
    expect(html).toContain('blocked')
    expect(html).toContain('B-ac-coverage')
    expect(html).toContain('3a8c1f02')
    expect(html).toContain('data-verdict="blocked"')
  })

  it('renders empty-state when no findings', () => {
    const out = { ...auditOut, findings: [], verdict: 'pass' as const,
      summary: { ...auditOut.summary, total: 0, blocking: 0, by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 } } }
    const html = renderAuditFragment(out)
    expect(html).toMatch(/no findings/i)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/observability/renderers/dashboard.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `dashboard.ts`**

Create `src/observability/renderers/dashboard.ts`:

```typescript
import type { EngineOutput, Verdict, Severity } from '../engine/types'
import { redactRendered } from '../engine/redact'

export function verdictToSeverityToken(v: Verdict): string {
  return { blocked: '--sev-p0', 'degraded-pass': '--sev-p2', pass: '--sev-pass' }[v]
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const SEVERITIES: Severity[] = ['P0', 'P1', 'P2', 'P3']

export function renderProgressFragment(out: EngineOutput): string {
  const snap = out.snapshot
  const agents = (snap?.active_agents ?? []).map((a) => {
    const task = a.current_task ? `${escape(a.current_task.id ?? '(unplanned)')} — ${escape(a.current_task.title)}` : '<em>idle</em>'
    return `<li><code>${escape(a.actor_label)}</code> · ${escape(a.branch)} · ${task}</li>`
  }).join('') || '<li><em>none</em></li>'

  const decisions = (snap?.recent_decisions ?? []).slice(0, 5).map((d) =>
    `<li><code>${escape(d.key)}</code>: ${escape(d.summary)}</li>`
  ).join('') || '<li><em>none</em></li>'

  const fragment = `<section id="build-progress" class="panel">
  <header>
    <h2>Build Progress</h2>
    <span class="meta">last 24h · phase: ${escape(snap?.current_phase ?? '(unknown)')}</span>
  </header>
  <div class="grid grid-2">
    <div class="card"><h3>Active Agents</h3><ul>${agents}</ul></div>
    <div class="card"><h3>Recent Decisions</h3><ul>${decisions}</ul></div>
  </div>
</section>`
  return redactRendered(fragment)
}

export function renderAuditFragment(out: EngineOutput): string {
  const args = out.invocation.args as { profile?: string; scope?: string }
  const findings = out.findings.filter((f) => f.status !== 'skipped')

  const filterButtons = ['all', 'blocking', ...SEVERITIES].map((f) => {
    const count = f === 'all' ? out.summary.total
      : f === 'blocking' ? out.summary.blocking
      : out.summary.by_severity[f as Severity]
    return `<button data-filter="${escape(f)}">${escape(f)} (${count})</button>`
  }).join(' ')

  const findingItems = findings.length === 0
    ? '<p class="empty">No findings.</p>'
    : `<ol class="findings">${findings.map((f) => {
        const idShort = escape(f.id.slice(0, 8))
        return `<li class="finding severity-${escape(f.severity)}" data-status="${escape(f.status)}" data-severity="${escape(f.severity)}">
          <header>
            <span class="badge" style="color: var(--sev-${f.severity.toLowerCase()})">${escape(f.severity)}</span>
            <code class="finding-id" title="run scaffold observe ack ${idShort} to acknowledge">${idShort}</code>
            <span class="lens">[${escape(f.lens_id)}]</span>
            <span class="title">${escape(f.title)}</span>
          </header>
          <p>${escape(f.description)}</p>
        </li>`
      }).join('')}</ol>`

  const fragment = `<section id="build-audit" class="panel" data-verdict="${escape(out.verdict)}" style="--verdict-color: var(${verdictToSeverityToken(out.verdict)})">
  <header>
    <h2>Audit</h2>
    <span class="badge" style="color: var(${verdictToSeverityToken(out.verdict)})">${escape(out.verdict)}</span>
    <span class="meta">${out.summary.blocking} blocking · threshold ${escape(out.fix_threshold)} · profile=${escape(args.profile ?? '?')} scope=${escape(args.scope ?? '?')}</span>
  </header>
  <div class="finding-filters">${filterButtons}</div>
  ${findingItems}
</section>`
  return redactRendered(fragment)
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx vitest run src/observability/renderers/dashboard.test.ts
```

Expected: PASS, 7 tests across 3 describe blocks.

- [ ] **Step 5: Commit**

```bash
git add src/observability/renderers/dashboard.ts src/observability/renderers/dashboard.test.ts
git commit -m "observability: dashboard fragment renderer (progress + audit panels with verdict-to-token mapping + HTML escape)"
```

---

## Task 11: Add `--render=dashboard-fragment[-audit]` mode to CLI

The dashboard generator shells out to `scaffold observe progress --render=dashboard-fragment` and `scaffold observe audit --render=dashboard-fragment-audit` to fetch the HTML fragments. This task wires the flag through the CLI.

**Files:**
- Modify: `src/cli/commands/observe.ts`
- Modify: `src/cli/commands/observe.test.ts`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Append the failing test**

Append to `src/cli/commands/observe.test.ts`:

```typescript
describe('observe --render=dashboard-fragment', () => {
  let proj: string
  beforeEach(async () => {
    proj = mkdtempSync(join(tmpdir(), 'observe-frag-'))
    execSync('git init -q', { cwd: proj })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: proj, shell: '/bin/sh' })
    ensureIdentity(proj, 'primary')
    mkdirSync(join(proj, 'docs'), { recursive: true })
    writeFileSync(join(proj, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }))
    writeFileSync(join(proj, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: must]\n')
    writeFileSync(join(proj, 'docs/user-stories.md'),
`## Story s-1: T [priority: must]\n\n### AC 1: t\n`)
    writeFileSync(join(proj, 'docs/tdd-standards.md'), '# TDD\n')
  })
  afterEach(() => { rmSync(proj, { recursive: true, force: true }) })

  it('handleProgress with render=dashboard-fragment prints HTML to stdout and skips markdown/sidecar', async () => {
    let captured = ''
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((s: string | Uint8Array) => { captured += String(s); return true }) as never
    try {
      await handleProgress({ cwd: proj, json: false, sinceHours: 24, render: 'dashboard-fragment', ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    } finally { process.stdout.write = origWrite }
    expect(captured).toMatch(/<section id="build-progress"/)
    expect(existsSync(join(proj, 'docs/build-status'))).toBe(false)
  })

  it('handleAudit with render=dashboard-fragment-audit prints HTML to stdout', async () => {
    let captured = ''
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((s: string | Uint8Array) => { captured += String(s); return true }) as never
    try {
      await handleAudit({ cwd: proj, json: false, profile: 'fast', scope: 'all', sinceHours: 24, render: 'dashboard-fragment-audit', ghBin: '/no/such/gh', bdBin: '/no/such/bd' })
    } finally { process.stdout.write = origWrite }
    expect(captured).toMatch(/<section id="build-audit"/)
    expect(existsSync(join(proj, 'docs/audits'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: FAIL — `render` option not supported.

- [ ] **Step 3: Update handlers**

In `src/cli/commands/observe.ts`, extend the handler input shapes:

```typescript
import { renderProgressFragment, renderAuditFragment } from '../../observability/renderers/dashboard'

export interface HandleProgressInput {
  // ... existing fields
  render?: 'dashboard-fragment'   // when set, skip markdown/sidecar; print HTML fragment to stdout
}

export interface HandleAuditInput {
  // ... existing fields
  render?: 'dashboard-fragment-audit'
}
```

Update the bodies — at the very start of `handleProgress`/`handleAudit`, before any markdown/sidecar work:

```typescript
// inside handleProgress
const out = await runProgress({ /* ... */ })
if (input.render === 'dashboard-fragment') {
  process.stdout.write(renderProgressFragment(out) + '\n')
  return 0
}
// ... existing markdown + sidecar + terminal logic

// inside handleAudit
const out = await runAudit({ /* ... */ })
if (input.render === 'dashboard-fragment-audit') {
  process.stdout.write(renderAuditFragment(out) + '\n')
  return out.verdict === 'blocked' ? 1 : 0
}
// ... existing markdown + sidecar + terminal logic
```

- [ ] **Step 4: Update CLI registration**

In `src/cli/index.ts`, add `--render` to both `progress` and `audit` builders:

```typescript
.option('render', { type: 'string', choices: ['dashboard-fragment'] as const, describe: 'Emit HTML fragment to stdout' })
// for audit:
.option('render', { type: 'string', choices: ['dashboard-fragment-audit'] as const, describe: 'Emit HTML fragment to stdout' })
```

Pass through to handler:

```typescript
render: argv.render as 'dashboard-fragment' | undefined,
// for audit:
render: argv.render as 'dashboard-fragment-audit' | undefined,
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run src/cli/commands/observe.test.ts
```

Expected: PASS, all CLI tests.

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/observe.ts src/cli/commands/observe.test.ts src/cli/index.ts
git commit -m "observability: --render=dashboard-fragment[-audit] CLI mode (skip markdown/sidecar; emit HTML to stdout)"
```

---

## Task 12: Inject fragments into `scripts/generate-dashboard.sh`

**Files:**
- Modify: `scripts/generate-dashboard.sh`

- [ ] **Step 1: Read the existing dashboard generator**

```bash
head -80 scripts/generate-dashboard.sh
```

Locate where the HTML body is assembled (likely a heredoc or accumulating variable). Identify a stable insertion point, ideally just before the closing `</body>` tag.

- [ ] **Step 2: Add named-anchor injection logic**

Add a section near the end of the HTML-assembly block. The exact form depends on the script's existing style; here is the pattern to add:

```bash
# ─── Build-observability panels (Plan 4) ───────────────────────────────
observe_progress_html=""
observe_audit_html=""
if command -v scaffold >/dev/null 2>&1; then
    observe_progress_html="$(scaffold observe progress --render=dashboard-fragment 2>/dev/null || true)"
    observe_audit_html="$(scaffold observe audit --render=dashboard-fragment-audit 2>/dev/null || true)"
fi
```

Then in the heredoc that builds the HTML body, insert just before `</body>`:

```html
<!-- observe:progress -->
${observe_progress_html}
<!-- /observe:progress -->

<!-- observe:audit -->
${observe_audit_html}
<!-- /observe:audit -->
```

(If the existing script uses single-quoted heredocs that don't expand variables, switch the relevant block to double-quoted form, or use `printf '%s\n'` interpolation.)

- [ ] **Step 3: Run shellcheck**

```bash
make lint
```

Expected: no new ShellCheck issues.

- [ ] **Step 4: Smoke-test by generating a dashboard against a fixture**

```bash
make dashboard-test
ls tests/screenshots/dashboard-test.html | head -3
```

Open the generated HTML in a browser (or run the existing Playwright MCP smoke flow per `CLAUDE.md`) and verify the panels render. If `scaffold` isn't on PATH (or has no audit data yet), the panels are simply absent — this is the graceful-degradation path.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-dashboard.sh
git commit -m "dashboard: inject build-observability progress + audit panels via named anchors"
```

---

## Task 13: Extend bats coverage — sidecars + dashboard fragments

**Files:**
- Modify: `tests/observability/audit.bats`

- [ ] **Step 1: Append two cases to the bats suite**

Append to `tests/observability/audit.bats`:

```bash
@test "observe audit writes docs/audits/<id>.md and matching .json sidecar" {
    cat > docs/plan.md <<'EOF'
# PRD
## Features
### F [priority: must]
EOF
    cat > docs/user-stories.md <<'EOF'
## Story s-1: T [priority: must]

### AC 1: t
Given X.
EOF
    cat > docs/tdd-standards.md <<'EOF'
# TDD
EOF

    run $BIN observe audit --since-hours=24
    [ "$status" -eq 1 ] # blocked
    md_count="$(ls docs/audits/audit-*-fast-all.md 2>/dev/null | wc -l | tr -d ' ')"
    json_count="$(ls docs/audits/audit-*-fast-all.json 2>/dev/null | wc -l | tr -d ' ')"
    [ "$md_count" -ge 1 ]
    [ "$json_count" -ge 1 ]

    # Sidecar JSON contains the engine_output wrapper
    sidecar="$(ls docs/audits/audit-*-fast-all.json | head -1)"
    grep -q '"engine_output"' "$sidecar"
    grep -q '"schema_version":"1.0"' "$sidecar"
}

@test "observe audit --render=dashboard-fragment-audit prints HTML and skips persisted output" {
    rm -rf docs/audits
    run $BIN observe audit --render=dashboard-fragment-audit --since-hours=24
    [[ "$output" == *'<section id="build-audit"'* ]]
    [ ! -d docs/audits ]
}

@test "observe progress writes docs/build-status/<id>.md and .json" {
    $BIN observe event task_claimed --branch=main --task-id=T-001 --task-title="hello"
    $BIN observe harvest --worktree="$SANDBOX"

    run $BIN observe progress --since-hours=24
    [ "$status" -eq 0 ]
    md_count="$(ls docs/build-status/progress-*.md 2>/dev/null | wc -l | tr -d ' ')"
    json_count="$(ls docs/build-status/progress-*.json 2>/dev/null | wc -l | tr -d ' ')"
    [ "$md_count" -ge 1 ]
    [ "$json_count" -ge 1 ]
}
```

- [ ] **Step 2: Run the bats suite**

```bash
npm run build && bats tests/observability/audit.bats
```

Expected: PASS — all original cases + 3 new ones.

- [ ] **Step 3: Commit**

```bash
git add tests/observability/audit.bats
git commit -m "observability: bats coverage for sidecars + dashboard fragment rendering"
```

---

## Task 14: `make check-all` and follow-up fixes

- [ ] **Step 1: Run the gate**

```bash
make check-all
```

Common Plan 4 issues:
- `structuredClone` not available — replace with `JSON.parse(JSON.stringify(...))` in `redactEngineOutput` if Node version is < 17.
- Markdown formatting in `renderAuditMarkdown` produces lines that exceed 200 chars — adjust as needed; spec only requires render output to be readable, not strictly formatted.
- bats failing to find `dist/cli/index.js` — `npm run build` first, or wire it into the bats setup function.
- ESLint complaints about `as never` casts in the dashboard renderer — narrow the types or add per-line `// eslint-disable-next-line` comments with a short justification.

- [ ] **Step 2: Commit any fixes**

```bash
git add -u
git commit -m "observability: lint / type-check / coverage fixes for Plan 4"
```

(Skip if step 1 was clean.)

---

## Task 15: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the observability paragraph**

Find the paragraph last edited by Plan 3 ("Build observability lives under `src/observability/`…"). Append a new sentence:

> Plan 4 ships persisted output: `scaffold observe progress` writes `docs/build-status/<id>.md` + `<id>.json` sidecars, `scaffold observe audit` writes `docs/audits/<id>.md` + sidecars, and `scripts/generate-dashboard.sh` injects "Build Progress" and "Audit" panels via named anchors. The `audit-history` adapter reads sidecars for trend analysis (severity-tier trajectories, lens-skipped streaks). `--output=<path>` overrides the markdown destination; `--render=dashboard-fragment[-audit]` skips persisted output and prints HTML to stdout.

- [ ] **Step 2: Add new rows to the Key Commands table**

Append to the existing observability rows in the Key Commands table:

```markdown
| `scaffold observe progress --output=<path>` | Write the progress markdown report to a custom path (sidecar still goes to docs/build-status/) |
| `scaffold observe audit --output=<path>` | Write the audit markdown report to a custom path (sidecar still goes to docs/audits/) |
| `scaffold observe progress --render=dashboard-fragment` | Emit HTML for the dashboard panel; skip markdown/sidecar |
| `scaffold observe audit --render=dashboard-fragment-audit` | Emit HTML for the audit dashboard panel; skip markdown/sidecar |
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document Plan 4 — markdown reports, JSON sidecars, dashboard fragments, audit-history trends"
```

---

## Task 16: Self-review the plan against the spec

- [ ] **Step 1: Spec coverage matrix**

| Spec section | Implemented in |
|---|---|
| Render-time redaction over EngineOutput (§1 redaction policy, §4.6 --json) | Task 1 |
| Markdown progress report (§4.2) | Task 2 |
| Markdown audit report (§4.2) | Task 3 |
| JSON sidecar wrapper `{ report_id, engine_output }` (§4.2) | Task 4 |
| sidecar paths under `docs/audits/<id>.json` and `docs/build-status/<id>.json` (§4.2) | Task 4 |
| Audit single-lens path `<…>-lens-<id>.json` (§4.2) | Task 4 |
| --output flag for explicit markdown destination (§5.1) | Task 5 |
| --json still writes sidecar (§4.2 — sidecar is the durable record) | Task 5 |
| audit-history adapter reads sidecars for trend data (§1 audit-history adapter) | Task 6 |
| `lensSkippedStreaks` for stall detection (§4.5 lens_skipped_repeatedly signal) | Task 6 (consumer: Plan 5) |
| `file_to_token_use` carries property metadata (§4 4.4 + Plan 3 deferral) | Task 7 |
| Lens E refined property-level must-priority check (§3.6) | Task 8 |
| --sev-p0|p1|p2|p3 + --sev-pass theme tokens (§4.3) | Task 9 |
| Dashboard fragment renderer with verdict-to-token mapping + HTML escape (§4.3, §4.4) | Task 10 |
| --render=dashboard-fragment[-audit] CLI mode (§4.3) | Task 11 |
| Named-anchor injection in generate-dashboard.sh (§4.3) | Task 12 |
| Bats coverage for sidecars + dashboard fragments (§6.3) | Task 13 |
| Quality gate (§6.8) | Task 14 |
| Documentation update | Task 15 |

- [ ] **Step 2: Out-of-scope confirmations (deferred to subsequent plans)**

| Deferred capability | Plan |
|---|---|
| Replay timeline (`--replay`) | Plan 5 |
| Stall detection / Needs Attention surface (consumes lensSkippedStreaks from Task 6) | Plan 5 |
| Phase-boundary triggers + StateManager.markCompleted refactor | Plan 6 |
| MMR `doc-conformance` channel | Plan 7 |
| Lens H full-profile prose checks | Plan 7 (LLM dispatcher) |
| `--fix` flow + worktree teardown | Plan 8 |
| Decision-keyword commit scan (Lens G sub-check) | Plan 5 |
| Dashboard generation fully consolidated into TypeScript | Future (out of scope per spec §4.3) |

- [ ] **Step 3: Type consistency final check**

```bash
grep -E '^export (type|interface) ' src/observability/engine/types.ts | sort | uniq -c | sort -rn | head -20
npx tsc --noEmit
```

Expected: no duplicate exports; tsc clean. The only type change in Plan 4 is the addition of optional `property` to the `file_to_token_use` Edge variant — backward-compatible.

- [ ] **Step 4: Mark Plan 4 complete**

```bash
git add docs/superpowers/plans/2026-05-04-build-observability-renderers-and-history.md
git commit -m "plans: build-observability renderers + history — final self-review pass" --allow-empty
```

---

## Plan 4 — Self-review (built into the plan)

**Spec coverage:** every Plan-4-scoped requirement maps to a task (see Task 16 Step 1). The persisted-output surfaces (markdown + JSON sidecar), the dashboard fragment-injection model, and the audit-history trend loop all land here. Lens E refinement (deferred from Plan 3) lands now that the edge payload supports it.

**Placeholder scan:** plan grepped for `TBD|TODO|FIXME|fill in|appropriate error|Similar to Task` — none present. Every step contains either complete code, an exact command, or a defined verification check.

**Type consistency:**
- The only `engine/types.ts` change is the optional `property` field on `file_to_token_use` edges (Task 7). Backward-compatible: Plan 3 callers that don't pass it still produce valid edges.
- `Verdict`, `Severity`, `EngineOutput`, `Finding`, `FindingsSummary` all reused unchanged from Plans 1–3.
- Markdown renderer, sidecar writer, dashboard renderer, and CLI handlers all consume `EngineOutput` directly and pass it through `redactEngineOutput`/`redactRendered` consistently.
- `verdictToSeverityToken` mapping (`blocked → --sev-p0`, `degraded-pass → --sev-p2`, `pass → --sev-pass`) is implemented once in `dashboard.ts` and exported for terminal renderer's future use (Plan 5+ may reuse it).

**Scope:** Plan 4 ships the persisted-output and visualization layer of the audit. Plans 1+2+3+4 together produce: ledger + harvest + 8-lens audit + verdict + ack + per-project config + markdown reports + sidecars + dashboard panels + trend analysis. After Plan 4, the audit feature is consumer-ready; Plans 5–8 add operational sophistication (replay, phase triggers, MMR channel, fix flow) but the core deliverable is shippable.

---

**Plan 4 complete and saved to `docs/superpowers/plans/2026-05-04-build-observability-renderers-and-history.md`.**

Plans 1+2+3+4 together produce a feature-complete, consumer-ready audit. Plans 5–8 remain optional polish and integration:
- Plan 5 — replay timeline + stall detection (consumes Task 6's `lensSkippedStreaks`).
- Plan 6 — phase-boundary triggers + StateManager.markCompleted refactor.
- Plan 7 — MMR `doc-conformance` channel + Lens H full-profile LLM checks.
- Plan 8 — `--fix` flow + worktree teardown script.

**Three execution options for Plans 1–4:**

1. **Subagent-Driven (recommended)** — fresh subagent per task across all four plans (~94 tasks total), review between tasks. The plans split cleanly so a subagent can be dispatched per task without cross-plan context drift.
2. **Inline Execution** — execute tasks here using `executing-plans` with checkpoints between plans.
3. **Pause and write Plans 5–8 first** — get the full design committed as plans before any code lands.

Which approach?
