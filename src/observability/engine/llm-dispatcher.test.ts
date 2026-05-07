import { describe, it, expect } from 'vitest'
import { dispatchLlm } from './llm-dispatcher.js'

describe('dispatchLlm', () => {
  it('returns ok=true with parsed JSON when subprocess emits valid JSON on stdout', async () => {
    const result = await dispatchLlm({
      prompt: 'irrelevant',
      command: 'cat >/dev/null; printf \'%s\' \'{"answer": "yes", "findings": []}\'',
      timeoutMs: 5000,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.parsed).toEqual({ answer: 'yes', findings: [] })
  })

  it('returns ok=false with a parse error when stdout is not JSON', async () => {
    const result = await dispatchLlm({
      prompt: 'irrelevant',
      command: 'cat >/dev/null; printf not-json',
      timeoutMs: 5000,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/parse|JSON/i)
  })

  it('returns ok=false with timeout when subprocess exceeds timeoutMs', async () => {
    const result = await dispatchLlm({
      prompt: 'irrelevant',
      command: 'sleep 5',
      timeoutMs: 100,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/timeout|timed out/i)
  })

  it('passes the prompt to subprocess stdin', async () => {
    const result = await dispatchLlm({
      prompt: 'echo back',
      command: 'read -r line; printf \'{"received":"%s"}\' "$line"',
      timeoutMs: 5000,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect((result.parsed as { received: string }).received).toBe('echo back')
  })

  it('returns ok=false when the binary is missing', async () => {
    const result = await dispatchLlm({
      prompt: 'irrelevant',
      command: '/no/such/binary',
      timeoutMs: 5000,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/ENOENT|not found|spawn|exit|error/i)
  })

  it('kills entire process group on timeout — backgrounded child does not outlive timeout', async () => {
    // The command backgrounds a subshell that writes a marker file after 400ms.
    // Timeout fires at 100ms. Without process-group kill, only the sh parent dies and
    // the backgrounded sleep survives to create the file. With process-group kill, the
    // entire subtree is killed and the file is never created.
    const os = await import('node:os')
    const path = await import('node:path')
    const fs = await import('node:fs')

    const markerFile = path.join(os.tmpdir(), `disp-pg-${process.pid}.marker`)
    if (fs.existsSync(markerFile)) fs.unlinkSync(markerFile)

    await dispatchLlm({
      prompt: 'irrelevant',
      command: `(sleep 0.4 && touch ${markerFile}) &`,
      timeoutMs: 100,
    })

    // Wait 700ms — enough for the background sleep to have fired if it survived
    await new Promise((r) => setTimeout(r, 700))

    const survived = fs.existsSync(markerFile)
    if (survived) fs.unlinkSync(markerFile)
    expect(survived).toBe(false)
  })
})
