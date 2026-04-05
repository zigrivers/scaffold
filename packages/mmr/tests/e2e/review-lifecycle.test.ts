import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { JobStore } from '../../src/core/job-store.js'
import { assemblePrompt } from '../../src/core/prompt.js'
import { parseChannelOutput } from '../../src/core/parser.js'
import { reconcile, evaluateGate } from '../../src/core/reconciler.js'
import { formatText } from '../../src/formatters/text.js'
import type { Finding, ReconciledResults } from '../../src/types.js'

describe('review lifecycle (unit integration)', () => {
  let tmpDir: string
  let store: JobStore

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-e2e-'))
    store = new JobStore(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('full lifecycle: create job → save outputs → reconcile → gate', () => {
    // 1. Create job
    const job = store.createJob({ fix_threshold: 'P2', format: 'json', channels: ['claude', 'gemini'] })
    expect(job.status).toBe('dispatched')

    // 2. Assemble prompt
    const prompt = assemblePrompt({ diff: '--- a/f.ts\n+++ b/f.ts\n@@ -1 +1 @@\n-old\n+new', focus: 'correctness' })
    store.savePrompt(job.job_id, prompt)
    expect(prompt).toContain('P0 (Critical)')
    expect(prompt).toContain('correctness')

    // 3. Simulate channel outputs
    const claudeOutput = JSON.stringify({
      approved: false,
      findings: [{ severity: 'P1', location: 'f.ts:1', description: 'Regression risk', suggestion: 'Add test coverage' }],
      summary: 'One issue found',
    })
    store.saveChannelOutput(job.job_id, 'claude', claudeOutput)
    store.updateChannel(job.job_id, 'claude', { status: 'completed', elapsed: '30s' })

    const geminiOutput = JSON.stringify({
      approved: false,
      findings: [{ severity: 'P1', location: 'f.ts:1', description: 'Breaking change detected', suggestion: 'Add backward compat' }],
      summary: 'Issue found',
    })
    store.saveChannelOutput(job.job_id, 'gemini', geminiOutput)
    store.updateChannel(job.job_id, 'gemini', { status: 'completed', elapsed: '45s' })

    // 4. Parse outputs
    const claudeParsed = parseChannelOutput(claudeOutput, 'default')
    const geminiParsed = parseChannelOutput(geminiOutput, 'default')

    // 5. Reconcile
    const channelFindings: Record<string, Finding[]> = {
      claude: claudeParsed.findings,
      gemini: geminiParsed.findings,
    }
    const reconciled = reconcile(channelFindings)
    expect(reconciled).toHaveLength(1)
    expect(reconciled[0].agreement).toBe('consensus')
    expect(reconciled[0].confidence).toBe('high')

    // 6. Evaluate gate
    const gatePassed = evaluateGate(reconciled, 'P2')
    expect(gatePassed).toBe(false)

    // 7. Format output
    const results: ReconciledResults = {
      job_id: job.job_id, gate_passed: gatePassed, fix_threshold: 'P2',
      reconciled_findings: reconciled,
      per_channel: {
        claude: { status: 'completed', elapsed: '30s', findings: claudeParsed.findings },
        gemini: { status: 'completed', elapsed: '45s', findings: geminiParsed.findings },
      },
      metadata: { channels_dispatched: 2, channels_completed: 2, channels_partial: 0, total_elapsed: '45s' },
    }
    const text = formatText(results)
    expect(text).toContain('FAILED')
    expect(text).toContain('P1')
  })

  it('gate passes when all channels approve', () => {
    const channelFindings: Record<string, Finding[]> = { claude: [], gemini: [] }
    const reconciled = reconcile(channelFindings)
    expect(evaluateGate(reconciled, 'P2')).toBe(true)
  })

  it('gate passes when only P3 findings exist with P2 threshold', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P3', location: 'f.ts:5', description: 'nit', suggestion: 'optional' }],
    }
    const reconciled = reconcile(channelFindings)
    expect(evaluateGate(reconciled, 'P2')).toBe(true)
  })
})
