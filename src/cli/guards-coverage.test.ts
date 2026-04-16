import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const COMMANDS_DIR = path.join(__dirname, 'commands')

describe('multi-service guard static coverage', () => {
  it('every command using StateManager also calls assertSingleServiceOrExit', () => {
    const files = fs.readdirSync(COMMANDS_DIR)
      .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'))

    const missing: string[] = []
    for (const f of files) {
      const body = fs.readFileSync(path.join(COMMANDS_DIR, f), 'utf8')
      const usesStateManager = /\bnew\s+StateManager\s*\(/.test(body)
      if (!usesStateManager) continue

      const callsGuard = /\bassertSingleServiceOrExit\s*\(/.test(body)
      const isExempt = f === 'adopt.ts'
      if (!callsGuard && !isExempt) missing.push(f)
    }
    expect(missing).toEqual([])
  })
})
