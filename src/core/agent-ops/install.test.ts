import { beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildTemplateVars, checkAgentOps, installAgentOps } from './install.js'

let projectRoot: string
let templateRoot: string

beforeEach(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentops-proj-'))
  templateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agentops-tmpl-'))
  fs.mkdirSync(path.join(templateRoot, 'git'), { recursive: true })
  fs.writeFileSync(
    path.join(templateRoot, 'git', 'setup-agent-worktree.sh.tmpl'),
    '#!/usr/bin/env bash\necho "{{PROJECT_NAME}}"\n{{WORKTREE_SETUP_COMMANDS}}\n',
  )
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
})

describe('installAgentOps / checkAgentOps', () => {
  it('installs git component, resolves vars, chmods, writes manifest + marker', () => {
    const res = installAgentOps(projectRoot, { components: ['git'], templateRoot })
    expect(res.errors).toEqual([])
    const dest = path.join(projectRoot, 'scripts', 'setup-agent-worktree.sh')
    expect(fs.existsSync(dest)).toBe(true)
    expect(fs.readFileSync(dest, 'utf8')).not.toContain('{{')
    expect(fs.statSync(dest).mode & 0o111).toBeTruthy()
    const manifest = JSON.parse(
      fs.readFileSync(path.join(projectRoot, '.scaffold', 'agent-ops-manifest.json'), 'utf8'),
    )
    expect(manifest.files['scripts/setup-agent-worktree.sh']).toMatch(/^[0-9a-f]{64}$/)
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

  it('ensures the Makefile includes agent-ops.mk exactly once', () => {
    fs.writeFileSync(path.join(projectRoot, 'Makefile'), 'test:\n\techo hi\n')
    installAgentOps(projectRoot, { components: ['git'], templateRoot })
    installAgentOps(projectRoot, { components: ['git'], templateRoot })
    const mk = fs.readFileSync(path.join(projectRoot, 'Makefile'), 'utf8')
    expect(mk.match(/-include agent-ops\.mk/g)).toHaveLength(1)
  })
})
