import { describe, it, expect } from 'vitest'
import { dispatchFixAgent } from './fix-agent-dispatcher'

describe('dispatchFixAgent', () => {
  it('returns ok=true when subprocess exits 0', async () => {
    const result = await dispatchFixAgent({
      prompt: 'edit something',
      command: 'sh -c "cat >/dev/null; exit 0"',
      timeoutMs: 5000,
    })
    expect(result.ok).toBe(true)
  })

  it('returns ok=false when subprocess exits non-zero', async () => {
    const result = await dispatchFixAgent({
      prompt: 'edit something',
      command: 'sh -c "cat >/dev/null; exit 1"',
      timeoutMs: 5000,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.exit_code).toBe(1)
    }
  })

  it('returns ok=false with timeout when subprocess exceeds timeoutMs', async () => {
    const result = await dispatchFixAgent({
      prompt: 'long task',
      command: 'sh -c "sleep 5"',
      timeoutMs: 100,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.timed_out).toBe(true)
  })

  it('passes the prompt to subprocess stdin', async () => {
    const tmpfile = '/tmp/observe-fix-test-' + Date.now()
    const result = await dispatchFixAgent({
      prompt: 'EXPECTED-PROMPT',
      command: `sh -c "cat > ${tmpfile}"`,
      timeoutMs: 5000,
    })
    expect(result.ok).toBe(true)
    const { readFileSync, unlinkSync } = await import('node:fs')
    expect(readFileSync(tmpfile, 'utf8')).toBe('EXPECTED-PROMPT')
    unlinkSync(tmpfile)
  })

  it('returns ok=false with reason ENOENT when binary is missing', async () => {
    const result = await dispatchFixAgent({
      prompt: '', command: '/no/such/binary', timeoutMs: 5000,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/ENOENT|not found|spawn/i)
  })
})
