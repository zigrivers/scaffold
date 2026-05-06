import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverTests } from './test-discovery.js'

describe('discoverTests', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-td-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('finds *.test.ts and *.spec.ts files and infers vitest framework', async () => {
    mkdirSync(join(dir, 'src/auth'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }))
    writeFileSync(join(dir, 'src/auth/login.test.ts'),
      'import { it, expect } from \'vitest\'\nit(\'signs in\', () => { expect(1).toBe(1) })\n')
    writeFileSync(join(dir, 'src/auth/signup.spec.ts'), 'it(\'signs up\', () => {})\n')

    const tests = await discoverTests(dir)
    const sorted = tests.sort((a, b) => a.id.localeCompare(b.id))
    expect(sorted).toHaveLength(2)
    expect(sorted[0]).toMatchObject({
      framework: 'vitest',
      file_path: 'src/auth/login.test.ts',
    })
    expect(sorted[0].id).toMatch(/^test:src\/auth\/login\.test\.ts::/)
    expect(sorted[0].name).toBe('signs in')
  })

  it('finds *_test.go files and infers go-test framework', async () => {
    writeFileSync(join(dir, 'package.json'), '{}')
    mkdirSync(join(dir, 'pkg/auth'), { recursive: true })
    writeFileSync(join(dir, 'pkg/auth/login_test.go'),
      'package auth\nimport "testing"\nfunc TestSignsIn(t *testing.T) {}\n')
    const tests = await discoverTests(dir)
    expect(tests).toHaveLength(1)
    expect(tests[0].framework).toBe('go-test')
    expect(tests[0].name).toBe('TestSignsIn')
  })

  it('returns empty array when no tests are found', async () => {
    writeFileSync(join(dir, 'package.json'), '{}')
    expect(await discoverTests(dir)).toEqual([])
  })
})
