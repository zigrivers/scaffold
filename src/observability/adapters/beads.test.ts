import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beadsAdapter } from './beads.js'

describe('beads adapter', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-bd-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('probe returns unavailable without .beads dir', async () => {
    expect((await beadsAdapter.probe(dir)).status).toBe('unavailable')
  })

  it('probe returns degraded when .beads/ exists but bd binary is missing', async () => {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    const s = await beadsAdapter.probe(dir, { bdBin: '/no/such/bd' })
    expect(s.status).toBe('degraded')
    expect(s.reason).toMatch(/bd binary/)
  })

  it('probe returns available when .beads/ + bd both exist', async () => {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    const shim = join(dir, 'fake-bd.sh')
    writeFileSync(shim, '#!/usr/bin/env bash\necho "bd version 1.0.4"\n', { mode: 0o755 })
    const s = await beadsAdapter.probe(dir, { bdBin: shim })
    expect(s.status).toBe('available')
  })

  it('probe returns degraded when bd is too old (below v1.0.0)', async () => {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    const oldBd = join(dir, 'fake-bd.sh')
    writeFileSync(oldBd, '#!/usr/bin/env bash\necho "bd version 0.62.0"\n', { mode: 0o755 })
    const s = await beadsAdapter.probe(dir, { bdBin: oldBd })
    expect(s.status).toBe('degraded')
    expect(s.reason).toMatch(/version/)
  })

  it('probe returns available when bd is v1.0.0 or newer', async () => {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    const newBd = join(dir, 'fake-bd.sh')
    writeFileSync(newBd, '#!/usr/bin/env bash\necho "bd version 1.0.4 (Homebrew)"\n', { mode: 0o755 })
    const s = await beadsAdapter.probe(dir, { bdBin: newBd })
    expect(s.status).toBe('available')
  })

  it('claimWithEvent invokes bd update with --set-metadata ledger_event_id=… and --claim', async () => {
    mkdirSync(join(dir, '.beads'), { recursive: true })
    const log = join(dir, 'bd-invocations.log')
    const shim = join(dir, 'fake-bd.sh')
    writeFileSync(shim, `#!/usr/bin/env bash
if [ "$1" = "--version" ]; then echo "bd version 1.0.4"; exit 0; fi
if [ "$1" = "update" ]; then echo "$@" >> "${log}"; exit 0; fi
exit 0
`, { mode: 0o755 })
    const ok = await beadsAdapter.claimWithEvent(dir, { id: 'bd-a1b2', eventId: 'evt-xyz' }, { bdBin: shim })
    expect(ok).toBe(true)
    expect(existsSync(log)).toBe(true)
    const logged = readFileSync(log, 'utf-8')
    expect(logged).toMatch(/update bd-a1b2/)
    expect(logged).toMatch(/--set-metadata ledger_event_id=evt-xyz/)
    expect(logged).toMatch(/--claim/)
  })

  it('claimWithEvent returns false when Beads is unavailable (no .beads/)', async () => {
    const ok = await beadsAdapter.claimWithEvent(dir, { id: 'bd-a1b2', eventId: 'evt-xyz' })
    expect(ok).toBe(false)
  })
})
