import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipelineDocsAdapter } from './pipeline-docs.js'

describe('pipeline_docs adapter', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-pd-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('probe returns unavailable when no planning docs exist', async () => {
    const s = await pipelineDocsAdapter.probe(dir)
    expect(s.status).toBe('unavailable')
  })

  it('probe returns degraded when only some artifacts exist (PRD at docs/plan.md)', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(join(dir, 'docs/plan.md'), '# PRD\n')
    const s = await pipelineDocsAdapter.probe(dir)
    expect(s.status).toBe('degraded')
    expect(s.evidence_paths).toEqual(['docs/plan.md'])
  })

  it('probe accepts the legacy docs/prd.md as a back-compat fallback', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(join(dir, 'docs/prd.md'), '# PRD (legacy path)\n')
    const s = await pipelineDocsAdapter.probe(dir)
    expect(s.status).toBe('degraded')
    expect(s.evidence_paths).toEqual(['docs/prd.md'])
  })

  it('probe returns available when the canonical artifact set is present', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    const canonical = ['plan.md', 'user-stories.md', 'implementation-plan.md', 'tech-stack.md', 'coding-standards.md']
    for (const name of canonical) {
      writeFileSync(join(dir, 'docs', name), `# ${name}\n`)
    }
    const s = await pipelineDocsAdapter.probe(dir)
    expect(s.status).toBe('available')
  })

  it('readArtifacts returns prd from docs/plan.md when present', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(join(dir, 'docs/plan.md'), '# PRD body (canonical)\n')
    const out = await pipelineDocsAdapter.readArtifacts(dir)
    expect(out.prd).toBe('# PRD body (canonical)\n')
    expect(out.user_stories).toBeNull()
  })

  it('readArtifacts falls back to docs/prd.md when docs/plan.md is absent', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(join(dir, 'docs/prd.md'), '# PRD body\n')
    const out = await pipelineDocsAdapter.readArtifacts(dir)
    expect(out.prd).toBe('# PRD body\n')
  })

  it('readArtifacts prefers docs/plan.md over docs/prd.md when both exist', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(join(dir, 'docs/plan.md'), '# canonical\n')
    writeFileSync(join(dir, 'docs/prd.md'), '# legacy\n')
    const out = await pipelineDocsAdapter.readArtifacts(dir)
    expect(out.prd).toBe('# canonical\n')
  })
})
