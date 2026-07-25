import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { checkAgentOps, ensureGateMakeTargets, installAgentOps } from './install.js'
import { ingestGateSeed } from './gate-ingest.js'

function tmpProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentops-gate-'))
  fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
  fs.writeFileSync(path.join(root, '.scaffold', 'agent-ops.yaml'), 'project_name: p\n')
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      scripts: { test: 'vitest run', 'test:visual': 'playwright test' },
      devDependencies: { vitest: '^3' },
    }),
  )
  return root
}

function install(root: string) {
  return installAgentOps(root, { components: ['gate'], gateSeed: ingestGateSeed(root) })
}

describe('gate component install', () => {
  it('generates both seed scripts executable, resolved from the ingestion seed', () => {
    const root = tmpProject()
    const res = install(root)
    expect(res.errors).toEqual([])
    const gc = path.join(root, 'scripts', 'gate-check.sh')
    const ga = path.join(root, 'scripts', 'gate-check-affected.sh')
    for (const p of [gc, ga]) {
      expect(fs.existsSync(p)).toBe(true)
      expect(fs.statSync(p).mode & 0o111).not.toBe(0)
      expect(fs.readFileSync(p, 'utf8')).not.toContain('{{')
    }
    expect(fs.readFileSync(gc, 'utf8')).toContain('npm run test')
    expect(fs.readFileSync(ga, 'utf8')).toContain('vitest run --changed')
  })
  it('records seeds in manifest.seeds (not files) and never overwrites an existing seed', () => {
    const root = tmpProject()
    install(root)
    const manifestPath = path.join(root, '.scaffold', 'agent-ops-manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      files: Record<string, string>
      seeds: string[]
    }
    expect(manifest.seeds.sort()).toEqual(['scripts/gate-check-affected.sh', 'scripts/gate-check.sh'])
    expect(manifest.files['scripts/gate-check.sh']).toBeUndefined()
    const gc = path.join(root, 'scripts', 'gate-check.sh')
    fs.writeFileSync(gc, '#!/bin/bash\n# project-customized\n')
    const second = install(root)
    expect(second.seedKept).toContain('scripts/gate-check.sh')
    expect(fs.readFileSync(gc, 'utf8')).toContain('project-customized')
  })
  it('agent-ops check reports a seed only when MISSING, never as drifted', () => {
    const root = tmpProject()
    install(root)
    fs.writeFileSync(path.join(root, 'scripts', 'gate-check.sh'), 'edited\n')
    let res = checkAgentOps(root)
    expect(res.modified).not.toContain('scripts/gate-check.sh')
    expect(res.missing).not.toContain('scripts/gate-check.sh')
    fs.rmSync(path.join(root, 'scripts', 'gate-check.sh'))
    res = checkAgentOps(root)
    expect(res.missing).toContain('scripts/gate-check.sh')
    expect(res.upToDate).toBe(false)
  })
  it('--force regenerates a seed from the current ingestion', () => {
    const root = tmpProject()
    install(root)
    fs.writeFileSync(path.join(root, 'scripts', 'gate-check.sh'), 'edited\n')
    const res = installAgentOps(root, { components: ['gate'], gateSeed: ingestGateSeed(root), force: true })
    expect(res.installed).toContain('scripts/gate-check.sh')
    expect(fs.readFileSync(path.join(root, 'scripts', 'gate-check.sh'), 'utf8')).toContain('GATE_PROBE')
  })
  it('requires a gateSeed when the gate component is requested', () => {
    const root = tmpProject()
    expect(() => installAgentOps(root, { components: ['gate'] })).toThrow(/gateSeed/)
  })
})

describe('ensureGateMakeTargets', () => {
  it('appends thin check/check-affected targets when absent, plus check-visual when seeded', () => {
    const root = tmpProject()
    const added = ensureGateMakeTargets(root, ingestGateSeed(root))
    expect(added.sort()).toEqual(['check', 'check-affected', 'check-visual'])
    const mk = fs.readFileSync(path.join(root, 'Makefile'), 'utf8')
    expect(mk).toContain('check:')
    expect(mk).toContain('\t./scripts/gate-check.sh')
    expect(mk).toContain('check-affected:')
    expect(mk).toContain('\t./scripts/gate-check-affected.sh')
    expect(mk).toContain('check-visual:')
    expect(mk).toContain('\tnpm run test:visual')
  })
  it('never duplicates an existing target (check: present ==> only the others append)', () => {
    const root = tmpProject()
    fs.writeFileSync(path.join(root, 'Makefile'), 'check: lint\n\t@echo custom\n')
    const added = ensureGateMakeTargets(root, ingestGateSeed(root))
    expect(added).not.toContain('check')
    const mk = fs.readFileSync(path.join(root, 'Makefile'), 'utf8')
    expect(mk.match(/^check:/gm)?.length).toBe(1)
    expect(mk).toContain('@echo custom')
  })
  it('is idempotent', () => {
    const root = tmpProject()
    ensureGateMakeTargets(root, ingestGateSeed(root))
    const before = fs.readFileSync(path.join(root, 'Makefile'), 'utf8')
    expect(ensureGateMakeTargets(root, ingestGateSeed(root))).toEqual([])
    expect(fs.readFileSync(path.join(root, 'Makefile'), 'utf8')).toBe(before)
  })
})
