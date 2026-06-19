import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { runEntryAudit, normalizeVerdict, stampVerdictRunDates, type Dispatcher } from './audit-runner.js'
import type { AuditVerdict } from './audit-runner.js'
import { SourceUnusableError } from './redirect-classifier.js'

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

  it('pre-fetches declared sources and embeds bodies via {{prefetched_sources}} (round-6 F-001)', async () => {
    // Use a fresh tmp setup with sources declared in the entry.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-prefetch-'))
    try {
      const prompt = path.join(tmp, 'audit.md')
      fs.writeFileSync(prompt, '{{prefetched_sources}}')
      const entry = path.join(tmp, 'entry.md')
      fs.writeFileSync(
        entry,
        '---\nname: stub\ndescription: y\nsources:\n  - url: https://example.org/spec\n---\nbody\n',
      )

      const fetchImpl = vi.fn(async () =>
        new Response('upstream content here', { status: 200 }),
      ) as unknown as Parameters<typeof runEntryAudit>[2] extends infer T
        ? T extends { fetchImpl?: infer F } ? F : never
        : never
      const publicResolver = async () => ['93.184.216.34']

      let promptSeen = ''
      const dispatcher: Dispatcher = async (p) => {
        promptSeen = p
        return JSON.stringify({
          entry_name: 'stub', audit_date: '2026-05-24', model: 'claude-opus-4-7',
          verdict: 'current', sources_checked: [], findings: [],
          proposed_changes: [], preserve_warnings: [],
        })
      }

      await runEntryAudit(entry, dispatcher, {
        promptPath: prompt, resolver: publicResolver, fetchImpl,
      })
      // The prompt should now contain the pre-fetched source body verbatim.
      expect(promptSeen).toContain('upstream content here')
      expect(promptSeen).toContain('https://example.org/spec')
      // And a hash that's deterministically computed in Node, not invented by
      // the model. We don't assert the exact value to keep the test resilient,
      // but it must look like a sha256 hex digest.
      expect(promptSeen).toMatch(/sha256:[0-9a-f]{64}/)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('skipPrefetch=true bypasses source fetching (test fixtures with unresolvable URLs)', async () => {
    // With prefetch on, fixture URLs that don't resolve would throw. The opt
    // exists so unit tests of the JSON-extraction path can supply stub
    // entries with placeholder URLs without needing to mock fetch + DNS.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-skip-'))
    try {
      const prompt = path.join(tmp, 'audit.md')
      fs.writeFileSync(prompt, '{{prefetched_sources}}')
      const entry = path.join(tmp, 'entry.md')
      fs.writeFileSync(entry, '---\nname: stub\ndescription: y\nsources:\n  - url: https://x\n---\nbody\n')

      const dispatcher: Dispatcher = async () =>
        JSON.stringify({
          entry_name: 'stub', audit_date: '2026-05-24', model: 'claude-opus-4-7',
          verdict: 'current', sources_checked: [], findings: [],
          proposed_changes: [], preserve_warnings: [],
        })

      const out = await runEntryAudit(entry, dispatcher, { promptPath: prompt, skipPrefetch: true })
      expect(out.verdict).toBe('current')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('propagates SourceUnusableError uncaught when a source is a client-side redirect stub' +
    ' (spec §7 regression)', async () => {
    // Regression: the bug was that fetchAndHash detected the stub and threw
    // SourceUnusableError, but runEntryAudit swallowed it (or skipPrefetch
    // was used, bypassing the guard entirely). This test confirms the error
    // propagates all the way through runEntryAudit when fetchImpl returns a
    // client-side-redirect stub with little content — no skipPrefetch.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-unusable-'))
    try {
      const prompt = path.join(tmp, 'audit.md')
      fs.writeFileSync(prompt, '{{prefetched_sources}}')
      const entry = path.join(tmp, 'entry.md')
      fs.writeFileSync(
        entry,
        '---\nname: stub\ndescription: y\nsources:\n  - url: https://example.org/owasp\n---\nbody\n',
      )

      // Stub: HTTP 200, text/html, meta http-equiv="refresh" pointing elsewhere,
      // and very little visible content (a classic redirect-stub page).
      const redirectStubBody =
        '<html><head><meta http-equiv="refresh" content="0; url=/elsewhere"></head><body></body></html>'
      const fetchImpl = vi.fn(async () =>
        new Response(redirectStubBody, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ) as unknown as Parameters<typeof runEntryAudit>[2] extends infer T
        ? T extends { fetchImpl?: infer F } ? F : never
        : never

      // Resolver returns a public IP so DNS-rebinding guard passes.
      const publicResolver = async () => ['93.184.216.34']

      // The dispatcher should never be reached — the prefetch throws first.
      const dispatcher: Dispatcher = vi.fn().mockResolvedValue('{}')

      await expect(
        runEntryAudit(entry, dispatcher, {
          promptPath: prompt,
          resolver: publicResolver,
          fetchImpl,
          // Do NOT pass skipPrefetch — that would bypass the guard.
        }),
      ).rejects.toBeInstanceOf(SourceUnusableError)

      // Dispatcher must not have been called (error happens before dispatch).
      expect(dispatcher).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('demotes proposed_changes on a minor-drift verdict to advisory preserve_warnings', async () => {
    // A non-conforming model (observed with DeepSeek) classifies an entry as
    // minor-drift yet still returns proposed_changes. The spec contract
    // (audit-apply.ts) forbids that combination; rather than hard-failing the
    // daily budget, the runner normalizes the verdict to be self-consistent:
    // drop the changes and keep their rationales as advisory notes.
    const dispatcher: Dispatcher = vi.fn().mockResolvedValue(JSON.stringify({
      entry_name: 'stub', audit_date: '2026-05-24', model: 'deepseek-v4-flash',
      verdict: 'minor-drift', sources_checked: [], findings: [],
      proposed_changes: [
        {
          location: '## Deep Guidance', kind: 'replace',
          rationale: 'tighten outdated wording', new_text: '## Deep Guidance\nx',
        },
      ],
      preserve_warnings: ['pre-existing warning'],
    }))
    const out = await run(dispatcher)
    expect(out.verdict).toBe('minor-drift')
    expect(out.proposed_changes).toEqual([])
    // The original warning survives and the dropped change's rationale is kept.
    expect(out.preserve_warnings).toContain('pre-existing warning')
    expect(out.preserve_warnings.some((w) => w.includes('tighten outdated wording'))).toBe(true)
  })

  it('demotes proposed_changes on a current verdict to advisory preserve_warnings', async () => {
    const dispatcher: Dispatcher = vi.fn().mockResolvedValue(JSON.stringify({
      entry_name: 'stub', audit_date: '2026-05-24', model: 'deepseek-v4-flash',
      verdict: 'current', sources_checked: [], findings: [],
      proposed_changes: [
        { location: '## Summary', kind: 'insert', rationale: 'add a missing note', new_text: 'note' },
      ],
      preserve_warnings: [],
    }))
    const out = await run(dispatcher)
    expect(out.verdict).toBe('current')
    expect(out.proposed_changes).toEqual([])
    expect(out.preserve_warnings.some((w) => w.includes('add a missing note'))).toBe(true)
  })

  it('leaves proposed_changes untouched on a major-drift verdict', async () => {
    const change = {
      location: '## Deep Guidance', kind: 'replace',
      rationale: 'claim is now wrong', new_text: '## Deep Guidance\nfixed',
    }
    const dispatcher: Dispatcher = vi.fn().mockResolvedValue(JSON.stringify({
      entry_name: 'stub', audit_date: '2026-05-24', model: 'deepseek-v4-flash',
      verdict: 'major-drift', sources_checked: [], findings: [],
      proposed_changes: [change], preserve_warnings: [],
    }))
    const out = await run(dispatcher)
    expect(out.verdict).toBe('major-drift')
    expect(out.proposed_changes).toEqual([change])
    expect(out.preserve_warnings).toEqual([])
  })
})

describe('normalizeVerdict', () => {
  // normalizeVerdict is exported as the sanitizer for non-conforming model
  // output. Although runEntryAudit's Zod parse guarantees these arrays are
  // present before it ever reaches here, the function must not throw on a
  // hand-built verdict missing them — that is exactly the malformed shape it
  // exists to absorb.
  const base = {
    entry_name: 'x', audit_date: '2026-05-24', model: 'm',
    verdict: 'minor-drift' as const, sources_checked: [], findings: [],
  }

  it('demotes without throwing when preserve_warnings is missing', () => {
    const v = {
      ...base,
      proposed_changes: [{ location: '## X', kind: 'replace', rationale: 'r' }],
    } as unknown as AuditVerdict
    const out = normalizeVerdict(v)
    expect(out.proposed_changes).toEqual([])
    expect(out.preserve_warnings.some((w) => w.includes('r'))).toBe(true)
  })

  it('does not throw when proposed_changes is missing', () => {
    const v = { ...base } as unknown as AuditVerdict
    expect(() => normalizeVerdict(v)).not.toThrow()
  })
})

describe('stampVerdictRunDates', () => {
  it('overwrites audit_date and every source retrieved_at with the run date, leaving other fields untouched', () => {
    const verdict: AuditVerdict = {
      entry_name: 'x', audit_date: '2025-01-01', model: 'm',
      verdict: 'current',
      sources_checked: [
        { url: 'https://a', retrieved_at: '2025-01-01', content_hash: 'h1', summary: 's1' },
        { url: 'https://b', retrieved_at: '2024-12-31', content_hash: 'h2', summary: 's2' },
      ],
      findings: [], proposed_changes: [], preserve_warnings: [],
    }
    const out = stampVerdictRunDates(verdict, '2026-06-04')
    expect(out.audit_date).toBe('2026-06-04')
    expect(out.sources_checked.map((s) => s.retrieved_at)).toEqual(['2026-06-04', '2026-06-04'])
    // Non-date fields are preserved.
    expect(out.sources_checked.map((s) => s.content_hash)).toEqual(['h1', 'h2'])
    expect(out.sources_checked.map((s) => s.url)).toEqual(['https://a', 'https://b'])
    expect(out.verdict).toBe('current')
  })
})

describe('runEntryAudit date stamping', () => {
  it('stamps the real run date over LLM-claimed audit_date / retrieved_at', async () => {
    // The model emits the literal `PENDING` for these (it cannot know the
    // date); the harness must overwrite both audit_date and each source
    // retrieved_at with the actual run date so provenance (and the cadence
    // prefilter) is truthful. Here the dispatcher returns stale dates to prove
    // the overwrite happens regardless of what the model emits.
    const dispatcher: Dispatcher = vi.fn().mockResolvedValue(JSON.stringify({
      entry_name: 'stub', audit_date: '2025-03-09', model: 'm',
      verdict: 'superseded',
      sources_checked: [
        { url: 'https://x', retrieved_at: '2025-03-09', content_hash: 'h', summary: '' },
      ],
      findings: [], proposed_changes: [], preserve_warnings: [],
    }))
    const out = await runEntryAudit(entryFile, dispatcher, {
      promptPath: promptFile, skipPrefetch: true, now: new Date('2026-06-04T12:00:00Z'),
    })
    expect(out.audit_date).toBe('2026-06-04')
    expect(out.sources_checked[0].retrieved_at).toBe('2026-06-04')
  })

  it('accepts the literal PENDING placeholder and never lets it reach the output', async () => {
    // The meta-prompt instructs the model to emit `PENDING` (not a date). The
    // verdict schema validates these as plain strings (no ISO enforcement), so
    // PENDING parses cleanly and is overwritten — it must never survive to the
    // returned verdict (and thus never reach frontmatter).
    const dispatcher: Dispatcher = vi.fn().mockResolvedValue(JSON.stringify({
      entry_name: 'stub', audit_date: 'PENDING', model: 'm',
      verdict: 'superseded',
      sources_checked: [
        { url: 'https://x', retrieved_at: 'PENDING', content_hash: 'h', summary: '' },
      ],
      findings: [], proposed_changes: [], preserve_warnings: [],
    }))
    const out = await runEntryAudit(entryFile, dispatcher, {
      promptPath: promptFile, skipPrefetch: true, now: new Date('2026-06-04T00:00:00Z'),
    })
    expect(out.audit_date).toBe('2026-06-04')
    expect(out.sources_checked[0].retrieved_at).toBe('2026-06-04')
    expect(JSON.stringify(out)).not.toContain('PENDING')
  })
})
