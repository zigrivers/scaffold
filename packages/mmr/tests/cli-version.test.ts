import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))

it('reports the MMR package version', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version: string }
  const decoyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-version-'))
  fs.writeFileSync(path.join(decoyRoot, 'package.json'), JSON.stringify({ version: '0.0.0-decoy' }))

  try {
    const output = execFileSync(process.execPath, [path.join(PACKAGE_ROOT, 'dist/index.js'), '--version'], {
      cwd: decoyRoot,
      encoding: 'utf8',
    })
    expect(output.trim()).toBe(pkg.version)
  } finally {
    fs.rmSync(decoyRoot, { recursive: true, force: true })
  }
})
