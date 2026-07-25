import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildOpsActions, renderOpsActionsSection } from './adoption-ops-actions.js'

function project(files: Record<string, string> = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-actions-'))
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, content)
  }
  return root
}

const QUEUE_YAML = 'project_name: p\nmerge_queue:\n  gate_executor: local-poller\n'

describe('buildOpsActions (§6.1 R2 preview)', () => {
  it('fresh repo: proposes git + staging installs and the hooks install — no queue actions', () => {
    const records = buildOpsActions(project())
    const keys = records.map(r => `${r.action}:${r.command}`)
    expect(keys).toContain('install-component:scaffold agent-ops install --component git')
    expect(keys).toContain('install-component:scaffold agent-ops install --component staging')
    expect(keys).toContain('hooks-install:scaffold hooks install')
    expect(keys.join('\n')).not.toMatch(/merge-queue|gate|sched|bootstrap/)
  })
  it('records carry EXACT file lists (spec: "with the exact file list") — including the installer-wide writes', () => {
    const records = buildOpsActions(project())
    const git = records.find(r => r.command.endsWith('--component git'))
    expect(git?.files.length).toBeGreaterThan(0)
    expect(git?.files).toContain('scripts/setup-agent-worktree.sh')
    // The list is the COMPLETE install write set — not just the component dests.
    expect(git?.files).toContain('.scaffold/agent-ops-manifest.json')
    expect(git?.files).toContain('.scaffold/agent-ops-version')
    expect(git?.files).toContain('Makefile')
    expect(git?.files).toEqual([...(git?.files ?? [])].sort())
    const hooks = records.find(r => r.action === 'hooks-install')
    expect(hooks?.files).toEqual(['.claude/settings.json'])
    expect(hooks?.detail).toContain('gh pr create')
  })
  it('queue intent adds merge-queue + gate components, the sched install, and the bootstrap requirement', () => {
    const root = project({ '.scaffold/agent-ops.yaml': QUEUE_YAML })
    const records = buildOpsActions(root, {
      schedUnitPaths: () => ['/units/scaffold-p-merge-poller.timer'],
    })
    const keys = records.map(r => `${r.action}:${r.command}`)
    expect(keys).toContain('install-component:scaffold agent-ops install --component merge-queue')
    expect(keys).toContain('install-component:scaffold agent-ops install --component gate')
    expect(keys).toContain('sched-install:scaffold sched install post-merge-poller')
    const gate = records.find(r => r.command.endsWith('--component gate'))
    // The gate seeds PLUS every installer-wide write (manifest, version marker,
    // Makefile include, shared make fragment) — the complete apply-relevant set.
    expect(gate?.files).toContain('scripts/gate-check.sh')
    expect(gate?.files).toContain('scripts/gate-check-affected.sh')
    expect(gate?.files).toContain('.scaffold/agent-ops-manifest.json')
    expect(gate?.files).toContain('Makefile')
    expect(gate?.files).toEqual([...(gate?.files ?? [])].sort())
    const sched = records.find(r => r.action === 'sched-install')
    expect(sched?.files).toEqual(['/units/scaffold-p-merge-poller.timer'])
    const boot = records.find(r => r.action === 'bootstrap-merge-required')
    expect(boot?.command).toContain('scaffold mq bootstrap --pr')
    expect(boot?.files).toEqual(['.mq/journal.jsonl'])
  })
  it('gha-selfhosted queue intent proposes no sched install', () => {
    const root = project({
      '.scaffold/agent-ops.yaml': 'project_name: p\nmerge_queue:\n  gate_executor: gha-selfhosted\n',
    })
    const actions = buildOpsActions(root).map(r => r.action)
    expect(actions).not.toContain('sched-install')
    expect(actions).toContain('bootstrap-merge-required')
  })
  it('a semantically-invalid agent-ops.yaml degrades (no crash) — skips sched-install, still previews the rest', () => {
    // merge_queue key present (queueIntent → true) but gate_executor is invalid,
    // so loadAgentOpsConfig throws. buildOpsActions is a read-only preview feeding
    // plan_key — it must NOT crash `scaffold adopt`; it drops only the sched hint.
    const root = project({
      '.scaffold/agent-ops.yaml': 'project_name: p\nmerge_queue:\n  gate_executor: not-a-real-executor\n',
    })
    let records: ReturnType<typeof buildOpsActions> = []
    expect(() => { records = buildOpsActions(root) }).not.toThrow()
    const actions = records.map(r => r.action)
    expect(actions).not.toContain('sched-install')
    // The queue components + bootstrap requirement still render.
    expect(actions).toContain('bootstrap-merge-required')
    expect(records.map(r => r.command)).toContain('scaffold agent-ops install --component merge-queue')
  })
  it('an already-armed queue omits the bootstrap requirement', () => {
    const root = project({
      '.scaffold/agent-ops.yaml': QUEUE_YAML,
      '.mq/journal.jsonl':
        '{"type":"bootstrap_armed","bootstrapId":"01A","pr":1,"gatedHeadSha":"S","at":"2026-07-19T00:00:00.000Z"}\n',
    })
    expect(buildOpsActions(root, { schedUnitPaths: () => [] }).map(r => r.action))
      .not.toContain('bootstrap-merge-required')
  })
  it('already-satisfied surfaces produce no records (component files present, hooks registered)', () => {
    const root = project()
    // Satisfy every git/staging dest and pre-register the only default-addable hook.
    const records = buildOpsActions(root)
    for (const r of records.filter(x => x.action === 'install-component')) {
      for (const f of r.files) {
        const p = path.join(root, f)
        fs.mkdirSync(path.dirname(p), { recursive: true })
        fs.writeFileSync(p, 'x\n')
      }
    }
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
    fs.writeFileSync(path.join(root, '.claude', 'settings.json'), JSON.stringify({
      hooks: { PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'grep gh pr create' }] }] },
    }))
    expect(buildOpsActions(root)).toEqual([])
  })
  it('is deterministic and stable-sorted (canonical plan_key input)', () => {
    const root = project({ '.scaffold/agent-ops.yaml': QUEUE_YAML })
    const probes = { schedUnitPaths: () => ['/u/t.timer'] }
    const a = buildOpsActions(root, probes)
    const b = buildOpsActions(root, probes)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const keys = a.map(r => `${r.action}:${r.command}`)
    expect(keys).toEqual([...keys].sort())
  })
  it('sched-install files are machine/OS-independent (no probe stub — real plan_key input)', () => {
    // The determinism test above injects a stub, so it never exercises the
    // production defaultSchedUnitPaths. Exercise the RE-ADOPTION case — the
    // poller IS installed, so buildPostMergePollerJob resolves and the file
    // descriptor is non-empty (exactly when resolved absolute paths would have
    // leaked). Assert no absolute/home/OS-specific path — otherwise the same
    // repo would hash to different plan_keys on macOS vs Linux.
    const root = project({ '.scaffold/agent-ops.yaml': QUEUE_YAML })
    fs.mkdirSync(path.join(root, 'scripts', 'ops'), { recursive: true })
    fs.writeFileSync(path.join(root, 'scripts', 'ops', 'post-merge-poller.sh'), '#!/bin/bash\n')
    const sched = buildOpsActions(root).find(r => r.action === 'sched-install')
    expect(sched).toBeDefined()
    expect(sched!.files.length).toBeGreaterThan(0)
    for (const f of sched!.files) {
      expect(f).not.toMatch(/^\/|^~|Library\/LaunchAgents|\.config\/systemd|\/Users\/|\/home\//)
    }
    // The stable descriptor is the project-name-derived unitBase (QUEUE_YAML sets
    // project_name: p), never a resolved absolute unit path.
    expect(sched!.files.join(' ')).toContain('scaffold-p-merge-poller')
  })
})

describe('renderOpsActionsSection', () => {
  it('renders every record with its command, detail, and file list', () => {
    const lines = renderOpsActionsSection([
      {
        action: 'hooks-install', command: 'scaffold hooks install',
        files: ['.claude/settings.json'], detail: 'registers: X',
      },
    ]).join('\n')
    expect(lines).toContain('## Ops actions')
    expect(lines).toContain('`scaffold hooks install`')
    expect(lines).toContain('.claude/settings.json')
    expect(lines).toContain('registers: X')
  })
  it('renders the empty state', () => {
    expect(renderOpsActionsSection([]).join('\n')).toContain('None — the ops surface is already installed')
  })
})
