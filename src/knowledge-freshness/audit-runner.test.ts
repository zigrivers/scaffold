import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runEntryAudit, type Dispatcher } from './audit-runner.js'

// Use temp fixtures rather than the real on-disk entry + meta-prompt so the
// runner tests don't break when those files are edited. We inject the meta-
// prompt path via opts.promptPath so the test never depends on cwd or on
// scaffold's package layout.
let tmpRoot: string
let entryFile: string
let promptFile: string

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-test-'))
  promptFile = path.join(tmpRoot, 'audit.md')
  fs.writeFileSync(promptFile, '# stub\n{{entry_path}} {{entry_frontmatter}} {{entry_body}}\n')
  entryFile = path.join(tmpRoot, 'entry.md')
  fs.writeFileSync(entryFile, '---\nname: stub\ndescription: y\n---\nbody\n')
})

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

const run = (dispatcher: Dispatcher) => runEntryAudit(entryFile, dispatcher, { promptPath: promptFile })

describe('runEntryAudit', () => {
  it('returns the parsed verdict on a clean dispatcher response', async () => {
    const dispatcher: Dispatcher = vi.fn().mockResolvedValue(JSON.stringify({
      entry_name: 'stub', audit_date: '2026-05-24', model: 'claude-opus-4-7',
      verdict: 'superseded', sources_checked: [], findings: [], proposed_changes: [], preserve_warnings: [],
    }))
    const out = await run(dispatcher)
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
    const out = await run(dispatcher)
    expect(out.verdict).toBe('current')
  })

  it('skips brace-shaped noise in prose and finds the real JSON object', async () => {
    // The first {...} block in this output is not JSON; the extractor must
    // skip it and try the next balanced block.
    const dispatcher: Dispatcher = vi.fn().mockResolvedValue(
      'Notes: I considered {alpha, beta} options but went with the second one.\n' +
      `Result:\n${JSON.stringify({
        entry_name: 'stub', audit_date: '2026-05-24', model: 'claude-opus-4-7',
        verdict: 'minor-drift', sources_checked: [], findings: [], proposed_changes: [], preserve_warnings: [],
      })}\n`,
    )
    const out = await run(dispatcher)
    expect(out.verdict).toBe('minor-drift')
  })

  it('skips parseable-but-irrelevant JSON earlier in the output', async () => {
    // The model emits a thinking-shaped JSON object before the verdict. The
    // first is parseable, but doesn't match the verdict schema — the extractor
    // must continue past it and find the actual verdict.
    const dispatcher: Dispatcher = vi.fn().mockResolvedValue(
      `${JSON.stringify({ thinking: 'first I will check OWASP', confidence: 0.9 })}\n\n` +
      `${JSON.stringify({
        entry_name: 'stub', audit_date: '2026-05-24', model: 'claude-opus-4-7',
        verdict: 'superseded', sources_checked: [], findings: [], proposed_changes: [], preserve_warnings: [],
      })}\n`,
    )
    const out = await run(dispatcher)
    expect(out.verdict).toBe('superseded')
  })

  it('throws on non-JSON dispatcher output', async () => {
    const dispatcher: Dispatcher = vi.fn().mockResolvedValue('not json at all')
    await expect(run(dispatcher)).rejects.toThrow()
  })

  it('throws on missing required fields', async () => {
    const dispatcher: Dispatcher = vi.fn().mockResolvedValue(JSON.stringify({ entry_name: 'x' }))
    await expect(run(dispatcher)).rejects.toThrow()
  })
})
