import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { runFixFlow } from './fix-flow'
import type { EngineOutput, Finding } from './types'

function f(id: string, severity: Finding['severity'], lens_id: string): Finding {
  return {
    id, lens_id, severity,
    title: `${lens_id} finding`, description: 'd', source_doc: '',
    evidence: { kind: 'orphan_node', graph_query: '', node_id: 'x' },
    confidence: 'high', first_seen: '', last_seen: '', status: 'open',
    fix_hint: { kind: 'edit_doc', target: 'docs/x.md', prompt: 'fix it' },
  }
}

function makeFixtureWithFindings(findings: Finding[]): EngineOutput {
  return {
    schema_version: '1.0',
    invocation: {
      command: 'audit',
      args: { profile: 'fast', scope: 'all' },
      started_at: '2026-05-04T14:00:00Z',
      completed_at: '2026-05-04T14:00:01Z',
      scaffold_version: '3.25.1',
    },
    availability: {
      git: { status: 'available' }, gh: { status: 'unavailable' },
      pipeline_docs: { status: 'available' }, tests: { status: 'available' },
      state: { status: 'available' }, beads: { status: 'unavailable' },
      mmr: { status: 'available' }, audit_history: { status: 'unavailable' },
      ledger: { events_read: 0, malformed_lines: 0, sources: [] },
    },
    snapshot: null, replay: null, findings, needs_attention: [],
    graph_stats: {
      nodes_by_kind: {}, edges_by_kind: {}, orphans_by_kind: {},
      unsanctioned_uses: 0, ad_hoc_token_uses: 0,
    },
    fix_threshold: 'P2', verdict: 'blocked',
    summary: {
      total: findings.length,
      by_severity: { P0: 0, P1: 0, P2: 0, P3: 0 },
      by_severity_status: {
        P0: { open: 0, acknowledged: 0, skipped: 0 },
        P1: { open: 0, acknowledged: 0, skipped: 0 },
        P2: { open: 0, acknowledged: 0, skipped: 0 },
        P3: { open: 0, acknowledged: 0, skipped: 0 },
      },
      blocking: findings.length, acknowledged: 0, skipped_lenses: 0,
    },
  }
}

describe('runFixFlow', () => {
  let proj: string
  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'observe-fix-'))
    execSync('git init -q', { cwd: proj })
    execSync('git config user.email t@e.com && git config user.name T', { cwd: proj, shell: '/bin/sh' })
    mkdirSync(join(proj, 'docs'), { recursive: true })
    writeFileSync(join(proj, 'package.json'), '{}')
    writeFileSync(join(proj, 'docs/plan.md'), '# PRD\n## Features\n### F [priority: must]\n')
    writeFileSync(join(proj, 'docs/user-stories.md'), '## Story s-1: T [priority: must]\n')
    writeFileSync(join(proj, 'docs/tdd-standards.md'), '# TDD\n')
    execSync('git add . && git commit -q -m initial', { cwd: proj, shell: '/bin/sh' })
  })
  afterEach(() => { rmSync(proj, { recursive: true, force: true }) })

  it('fixes a finding when the agent succeeds and verification passes', async () => {
    const attemptedFor: string[] = []
    const stubDispatcher = vi.fn(async () => ({ ok: true as const, exit_code: 0 as const, elapsed_ms: 50 }))
    const stubVerify = vi.fn(async (_proj: string, finding: Finding) => {
      attemptedFor.push(finding.id)
      return { stillPresent: false }
    })

    const initial = makeFixtureWithFindings([f('a', 'P0', 'A-tdd')])
    const result = await runFixFlow({
      primaryRoot: proj, initial,
      dispatcher: stubDispatcher,
      verifier: stubVerify,
    })

    expect(result.fixed).toEqual(['a'])
    expect(result.failed).toEqual([])
    expect(stubDispatcher).toHaveBeenCalledTimes(1)
    expect(attemptedFor).toEqual(['a'])
  })

  it('retries up to 3 times per finding before declaring failure', async () => {
    const stubDispatcher = vi.fn(async () => ({ ok: true as const, exit_code: 0 as const, elapsed_ms: 50 }))
    let verifyCalls = 0
    const stubVerify = vi.fn(async () => {
      verifyCalls++
      return { stillPresent: true }
    })

    const initial = makeFixtureWithFindings([f('a', 'P0', 'A-tdd')])
    const result = await runFixFlow({
      primaryRoot: proj, initial,
      dispatcher: stubDispatcher,
      verifier: stubVerify,
    })

    expect(result.fixed).toEqual([])
    expect(result.failed).toEqual(['a'])
    expect(stubDispatcher).toHaveBeenCalledTimes(3)
    expect(verifyCalls).toBe(3)
  })

  it('continues to the next finding after a per-finding failure', async () => {
    const stubDispatcher = vi.fn(async () => ({ ok: true as const, exit_code: 0 as const, elapsed_ms: 50 }))
    const stubVerify = vi.fn(async (_p: string, fnd: Finding) =>
      ({ stillPresent: fnd.id === 'a' })
    )

    const initial = makeFixtureWithFindings([f('a', 'P0', 'A-tdd'), f('b', 'P1', 'B-ac-coverage')])
    const result = await runFixFlow({
      primaryRoot: proj, initial,
      dispatcher: stubDispatcher,
      verifier: stubVerify,
    })

    expect(result.failed).toEqual(['a'])
    expect(result.fixed).toEqual(['b'])
  })

  it('writes a post-fix report at docs/audits/<id>-postfix.md after the run', async () => {
    const stubDispatcher = vi.fn(async () => ({ ok: true as const, exit_code: 0 as const, elapsed_ms: 50 }))
    const stubVerify = vi.fn(async () => ({ stillPresent: false }))
    const initial = makeFixtureWithFindings([f('a', 'P0', 'A-tdd')])
    const result = await runFixFlow({
      primaryRoot: proj, initial,
      dispatcher: stubDispatcher,
      verifier: stubVerify,
    })
    expect(result.postfix_markdown_path).toMatch(/-postfix\.md$/)
    expect(result.postfix_sidecar_path).toMatch(/-postfix\.json$/)
  })
})
