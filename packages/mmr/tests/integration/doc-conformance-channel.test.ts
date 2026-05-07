/**
 * Hermetic integration test for the doc-conformance MMR channel.
 * Tests the full data path: scaffold runAudit → renderMmrFindings → getParser.
 * Uses the scaffold TypeScript API directly to avoid installed-CLI version skew.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getParser } from '../../src/core/parser.js'
import { BUILTIN_CHANNELS } from '../../src/config/defaults.js'

// Import scaffold internals via relative path so the test exercises the same
// source being built — not the installed binary, which may lag a version.
import { runAudit } from '../../../../src/observability/engine/api.js'
import { renderMmrFindings } from '../../../../src/observability/renderers/mmr-findings.js'

describe('doc-conformance channel — hermetic integration', () => {
  let proj: string

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'mmr-doc-conf-'))
    execFileSync('git', ['init', '-q'], { cwd: proj })
    execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: proj })
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: proj })
    mkdirSync(join(proj, 'docs'), { recursive: true })
    writeFileSync(join(proj, 'package.json'), '{}')
    writeFileSync(
      join(proj, 'docs/user-stories.md'),
      '## Story s-1: T [priority: must]\n\n### AC 1: t\nGiven X.\n',
    )
  })

  afterEach(() => { rmSync(proj, { recursive: true, force: true }) })

  it('BUILTIN_CHANNELS doc-conformance is correctly configured', () => {
    const ch = BUILTIN_CHANNELS['doc-conformance']
    expect(ch).toBeDefined()
    expect(ch.output_parser).toBe('doc-conformance')
    expect(ch.command).toMatch(/scaffold observe audit/)
    expect(ch.command).toMatch(/--output-mode=mmr-findings/)
    expect(ch.enabled).toBe(false) // disabled by default; enable via .mmr.yaml or --channels=doc-conformance
  })

  it('runAudit output is parseable by the doc-conformance parser as a JSON array', async () => {
    const out = await runAudit({
      primaryRoot: proj,
      profile: 'fast',
      scope: 'all',
      args: { profile: 'fast', scope: 'all' },
    })
    const json = renderMmrFindings(out)
    expect(() => JSON.parse(json)).not.toThrow()
    const arr = JSON.parse(json)
    expect(Array.isArray(arr)).toBe(true)
  })

  it('doc-conformance parser correctly round-trips renderMmrFindings output', async () => {
    const out = await runAudit({
      primaryRoot: proj,
      profile: 'fast',
      scope: 'all',
      args: { profile: 'fast', scope: 'all' },
    })
    const json = renderMmrFindings(out)
    const parser = getParser('doc-conformance')
    const parsed = parser(json)
    expect(Array.isArray(parsed.findings)).toBe(true)
    expect(typeof parsed.approved).toBe('boolean')
    expect(typeof parsed.summary).toBe('string')
    // Any findings from scaffold have composite location format
    for (const f of parsed.findings) {
      expect(f.location).toMatch(/::/)
    }
  })

  it('findings carry doc-conformance category', async () => {
    const out = await runAudit({
      primaryRoot: proj,
      profile: 'fast',
      scope: 'all',
      args: { profile: 'fast', scope: 'all' },
    })
    const arr = JSON.parse(renderMmrFindings(out)) as Array<{ category?: string }>
    for (const f of arr) {
      expect(f.category).toBe('doc-conformance')
    }
  })
})
