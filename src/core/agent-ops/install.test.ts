import { beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AGENT_OPS_FILE_MAP, buildTemplateVars, checkAgentOps, installAgentOps } from './install.js'

let projectRoot: string
let templateRoot: string

/** Write a minimal source for every template in the map (or a subset). */
function seedTemplates(root: string, tmpls: string[] = Object.keys(AGENT_OPS_FILE_MAP)): void {
  for (const tmpl of tmpls) {
    const src = path.join(root, tmpl)
    fs.mkdirSync(path.dirname(src), { recursive: true })
    fs.writeFileSync(src, '#!/usr/bin/env bash\necho "{{PROJECT_NAME}}"\n{{WORKTREE_SETUP_COMMANDS}}\n')
  }
}

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentops-proj-'))
  templateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentops-tmpl-'))
  // Seed a source for EVERY known template so a requested component never trips
  // the missing-source error path (that path has its own dedicated test).
  seedTemplates(templateRoot)
})

describe('buildTemplateVars', () => {
  it('emits shell band lines and joined setup commands', () => {
    const vars = buildTemplateVars({
      project_name: 'myapp',
      critical_labels: [],
      worktree_setup_commands: ['npm ci', 'uv sync'],
      docker: {
        context: 'orbstack',
        services: [{ name: 'postgres', band: 20000 }, { name: 'api', band: 21000 }],
        shared_stack: { postgres: 55432, api: 8001 },
      },
    })
    expect(vars.PROJECT_NAME).toBe('myapp')
    expect(vars.DOCKER_CONTEXT).toBe('orbstack')
    expect(vars.WORKTREE_SETUP_COMMANDS).toBe('npm ci\nuv sync')
    expect(vars.SERVICE_PORT_BANDS).toBe(
      'SERVICES="postgres api"\nBAND_postgres=20000\nBAND_api=21000\nSHARED_postgres=55432\nSHARED_api=8001',
    )
  })

  it('defaults DOCKER_CONTEXT by platform when config omits context', () => {
    const vars = buildTemplateVars({
      project_name: 'myapp',
      critical_labels: [],
      worktree_setup_commands: [],
      docker: {
        services: [{ name: 'postgres', band: 20000 }],
        shared_stack: {},
      },
    })
    expect(vars.DOCKER_CONTEXT).toBe(process.platform === 'darwin' ? 'orbstack' : 'default')
  })

  it('emits var-name-safe BAND_/SHARED_ suffixes for dash-named services', () => {
    const vars = buildTemplateVars({
      project_name: 'myapp',
      critical_labels: [],
      worktree_setup_commands: [],
      docker: {
        services: [{ name: 'redis-cache', band: 20000 }],
        shared_stack: { 'redis-cache': 6379 },
      },
    })
    // SERVICES keeps the raw name; BAND_/SHARED_ suffixes replace `-` with `_`
    // so the generated lines are valid shell assignments.
    expect(vars.SERVICE_PORT_BANDS).toBe(
      'SERVICES="redis-cache"\nBAND_redis_cache=20000\nSHARED_redis_cache=6379',
    )
    expect(vars.SERVICE_PORT_BANDS).not.toContain('BAND_redis-cache')
  })
})

describe('installAgentOps / checkAgentOps', () => {
  it('installs git component, resolves vars, chmods, writes manifest + marker', () => {
    const res = installAgentOps(projectRoot, { components: ['git'], templateRoot })
    expect(res.errors).toEqual([])
    const dest = path.join(projectRoot, 'scripts', 'setup-agent-worktree.sh')
    expect(fs.existsSync(dest)).toBe(true)
    expect(fs.readFileSync(dest, 'utf8')).not.toContain('{{')
    expect(fs.statSync(dest).mode & 0o111).toBeTruthy()
    // The bd-guard hook script installs as an executable git-component file.
    expect(res.installed).toContain('scripts/bd-guard.sh')
    const guard = path.join(projectRoot, 'scripts', 'bd-guard.sh')
    expect(fs.existsSync(guard)).toBe(true)
    expect(fs.statSync(guard).mode & 0o111).toBeTruthy()
    // The primary-checkout write-guard and the main-sync self-heal install as
    // executable git-component files (manifest-tracked, so main-sync's heal call
    // never drifts against `agent-ops check`).
    for (const dest of ['scripts/primary-checkout-guard.sh', 'scripts/heal-regen-artifacts.sh']) {
      expect(res.installed).toContain(dest)
      const p = path.join(projectRoot, dest)
      expect(fs.existsSync(p)).toBe(true)
      expect(fs.statSync(p).mode & 0o111).toBeTruthy()
    }
    const manifest = JSON.parse(
      fs.readFileSync(path.join(projectRoot, '.scaffold', 'agent-ops-manifest.json'), 'utf8'),
    )
    expect(manifest.files['scripts/setup-agent-worktree.sh']).toMatch(/^[0-9a-f]{64}$/)
    expect(manifest.files['scripts/primary-checkout-guard.sh']).toMatch(/^[0-9a-f]{64}$/)
    expect(manifest.files['scripts/heal-regen-artifacts.sh']).toMatch(/^[0-9a-f]{64}$/)
    expect(checkAgentOps(projectRoot).upToDate).toBe(true)
  })

  it('refuses to overwrite locally modified files unless force', () => {
    installAgentOps(projectRoot, { components: ['git'], templateRoot })
    const dest = path.join(projectRoot, 'scripts', 'setup-agent-worktree.sh')
    fs.appendFileSync(dest, '# local edit\n')
    expect(checkAgentOps(projectRoot).modified).toEqual(['scripts/setup-agent-worktree.sh'])
    const res = installAgentOps(projectRoot, { components: ['git'], templateRoot })
    expect(res.skippedModified).toEqual(['scripts/setup-agent-worktree.sh'])
    expect(fs.readFileSync(dest, 'utf8')).toContain('# local edit')
    const forced = installAgentOps(projectRoot, { components: ['git'], templateRoot, force: true })
    expect(forced.skippedModified).toEqual([])
    expect(fs.readFileSync(dest, 'utf8')).not.toContain('# local edit')
  })

  it('skips pre-existing files it does not own (no manifest entry) unless force', () => {
    const dest = path.join(projectRoot, 'scripts', 'setup-agent-worktree.sh')
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, '# user-owned file\n')
    const res = installAgentOps(projectRoot, { components: ['git'], templateRoot })
    // The pre-existing file is skipped; the other git dests still install.
    expect(res.skippedModified).toEqual(['scripts/setup-agent-worktree.sh'])
    expect(res.installed).not.toContain('scripts/setup-agent-worktree.sh')
    expect(res.installed).toContain('scripts/doctor.sh')
    expect(fs.readFileSync(dest, 'utf8')).toBe('# user-owned file\n')
    const forced = installAgentOps(projectRoot, { components: ['git'], templateRoot, force: true })
    expect(forced.skippedModified).toEqual([])
    expect(forced.installed).toContain('scripts/setup-agent-worktree.sh')
    expect(fs.readFileSync(dest, 'utf8')).not.toContain('# user-owned file')
  })

  it('ensures the Makefile includes agent-ops.mk exactly once', () => {
    fs.writeFileSync(path.join(projectRoot, 'Makefile'), 'test:\n\techo hi\n')
    installAgentOps(projectRoot, { components: ['git'], templateRoot })
    installAgentOps(projectRoot, { components: ['git'], templateRoot })
    const mk = fs.readFileSync(path.join(projectRoot, 'Makefile'), 'utf8')
    expect(mk.match(/-include agent-ops\.mk/g)).toHaveLength(1)
  })

  it('installs the make fragment + ensures the include for a staging-only install', () => {
    const res = installAgentOps(projectRoot, { components: ['staging'], templateRoot })
    expect(res.errors).toEqual([])
    // The make fragment is component-agnostic: staging-only must still land it.
    expect(res.installed).toContain('agent-ops.mk')
    expect(fs.existsSync(path.join(projectRoot, 'agent-ops.mk'))).toBe(true)
    // …and wire it into a freshly-created Makefile.
    const mk = fs.readFileSync(path.join(projectRoot, 'Makefile'), 'utf8')
    expect(mk).toContain('-include agent-ops.mk')
  })

  it('errors (does not silently skip) when a requested component template is missing', () => {
    // A template root with only SOME git templates present.
    const partialRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentops-partial-'))
    seedTemplates(partialRoot, ['git/setup-agent-worktree.sh.tmpl'])
    const res = installAgentOps(projectRoot, { components: ['git'], templateRoot: partialRoot })
    expect(res.installed).toContain('scripts/setup-agent-worktree.sh')
    // The other git dests (and the make fragment) had no source → errors, not skips.
    expect(res.errors.length).toBeGreaterThan(0)
    expect(res.errors.some(e => e.includes('scripts/doctor.sh'))).toBe(true)
    expect(res.errors.some(e => e.includes('agent-ops.mk'))).toBe(true)
  })

  it('does not advance the version marker on a partial (errored) install', () => {
    // A template root missing some git sources → the install has errors.
    const partialRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentops-partial-'))
    seedTemplates(partialRoot, ['git/setup-agent-worktree.sh.tmpl'])
    const res = installAgentOps(projectRoot, { components: ['git'], templateRoot: partialRoot })
    expect(res.errors.length).toBeGreaterThan(0)
    // The successfully-installed file IS recorded in the manifest…
    const manifest = JSON.parse(
      fs.readFileSync(path.join(projectRoot, '.scaffold', 'agent-ops-manifest.json'), 'utf8'),
    )
    expect(manifest.files['scripts/setup-agent-worktree.sh']).toMatch(/^[0-9a-f]{64}$/)
    // …but the version marker is NOT advanced, so a failed install never looks up-to-date.
    expect(fs.existsSync(path.join(projectRoot, '.scaffold', 'agent-ops-version'))).toBe(false)
    const check = checkAgentOps(projectRoot)
    expect(check.staleVersion).toBe(true)
    expect(check.upToDate).toBe(false)
    // A subsequent CLEAN install (all sources present) recovers and advances the marker.
    const ok = installAgentOps(projectRoot, { components: ['git'], templateRoot })
    expect(ok.errors).toEqual([])
    expect(fs.existsSync(path.join(projectRoot, '.scaffold', 'agent-ops-version'))).toBe(true)
    expect(checkAgentOps(projectRoot).upToDate).toBe(true)
  })

  it('reports pre-existing files as unmanaged (informational) when they exist on disk', () => {
    // Pre-create a git-owned dest as a user file, then install git: the installer
    // refuses to clobber it, so it never enters the manifest.
    const dest = path.join(projectRoot, 'scripts', 'doctor.sh')
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, '# user-owned doctor\n')
    installAgentOps(projectRoot, { components: ['git'], templateRoot })
    const check = checkAgentOps(projectRoot)
    // The pre-existing, unclaimed file is surfaced as unmanaged…
    expect(check.unmanaged).toContain('scripts/doctor.sh')
    // …but unmanaged files never flip upToDate to false on their own.
    expect(check.modified).toEqual([])
    expect(check.missing).toEqual([])
  })
})
