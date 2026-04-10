// src/cli/commands/adopt.performance.test.ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseDocument } from 'yaml'

describe('atomic config write performance', () => {
  it('writes a typical config.yml in under 50ms', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-perf-'))
    const configPath = path.join(dir, 'config.yml')
    const doc = parseDocument(`version: 2
methodology: deep
platforms: [claude-code]
project:
  projectType: web-app
  webAppConfig:
    renderingStrategy: ssr
    deployTarget: serverless
`)

    const start = process.hrtime.bigint()
    const tmpPath = `${configPath}.${process.pid}.tmp`
    fs.writeFileSync(tmpPath, doc.toString(), 'utf8')
    fs.renameSync(tmpPath, configPath)
    const end = process.hrtime.bigint()

    const elapsedMs = Number(end - start) / 1_000_000
    expect(elapsedMs).toBeLessThan(50)

    fs.rmSync(dir, { recursive: true, force: true })
  })
})
