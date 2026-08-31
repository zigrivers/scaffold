import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const PACKAGE_ROOT = fileURLToPath(new URL('../', import.meta.url))

it('reports the MMR package version', () => {
  execFileSync('npm', ['run', 'build'], { cwd: PACKAGE_ROOT, stdio: 'ignore' })
  const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version: string }
  const output = execFileSync(process.execPath, [path.join(PACKAGE_ROOT, 'dist/index.js'), '--version'], { encoding: 'utf8' })

  expect(output.trim()).toBe(pkg.version)
})
