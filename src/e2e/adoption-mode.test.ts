import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveAssemblyMode } from '../core/assembly/update-mode.js'
import { loadAdoptionPreamble } from '../core/assembly/mode-loader.js'
import {
  buildIndex, loadEntries, withAdoptionKnowledge,
} from '../core/assembly/knowledge-loader.js'
import { AssemblyEngine } from '../core/assembly/engine.js'
import { getPackageKnowledgeDir } from '../utils/fs.js'
import type {
  PipelineState, ScaffoldConfig, MetaPromptFile,
} from '../types/index.js'

function makeState(initMode: PipelineState['init-mode']): PipelineState {
  return {
    'schema-version': 1, 'scaffold-version': '3.0.0',
    init_methodology: 'deep', config_methodology: 'deep',
    'init-mode': initMode, created: '2026-07-19T00:00:00.000Z',
    in_progress: null,
    steps: { 'tech-stack': { status: 'pending', source: 'pipeline', produces: ['docs/tech-stack.md'] } },
    next_eligible: [], 'extra-steps': [],
  }
}

const config: ScaffoldConfig = { version: 2, methodology: 'deep', platforms: ['claude-code'] }

const metaPrompt: MetaPromptFile = {
  stepName: 'tech-stack',
  filePath: '/content/pipeline/foundation/tech-stack.md',
  frontmatter: {
    name: 'tech-stack', description: 'test', phase: 'foundation', order: 220,
    dependencies: [], outputs: ['docs/tech-stack.md'], conditional: null,
    knowledgeBase: ['tech-stack-selection'], reads: [], stateless: false,
    category: 'pipeline',
  },
  body: 'Research and document the stack.',
  sections: {},
}

let tmpDir: string
beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adoption-e2e-')) })
afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }) })

describe('adoption-mode assembly (brownfield R3)', () => {
  it('brownfield + pending step assembles with preamble and brownfield knowledge', () => {
    const state = makeState('brownfield')
    const modeResult = resolveAssemblyMode({
      step: 'tech-stack', state, currentDepth: 3, projectRoot: tmpDir,
    })
    expect(modeResult.mode).toBe('adoption')

    const { content: adoptionPreamble } = loadAdoptionPreamble()
    const index = buildIndex(getPackageKnowledgeDir())
    const names = withAdoptionKnowledge(metaPrompt.frontmatter.knowledgeBase, modeResult.mode)
    expect(names).toContain('brownfield-adoption')
    const { entries } = loadEntries(index, names)

    const result = new AssemblyEngine().assemble('tech-stack', {
      config, state, metaPrompt, knowledgeEntries: entries,
      instructions: { global: null, perStep: null, inline: null },
      depth: 3, depthProvenance: 'preset-default',
      updateMode: false,
      assemblyMode: modeResult.mode,
      adoptionPreamble: adoptionPreamble ?? undefined,
    })
    expect(result.success).toBe(true)
    expect(result.prompt!.text).toContain('### Adoption Mode')
    expect(result.prompt!.text).toContain('Read the repository first')
    expect(result.prompt!.text).toContain('brownfield-adoption')
    expect(result.prompt!.metadata.assemblyMode).toBe('adoption')
  })

  it('greenfield + pending step assembles fresh with no adoption content', () => {
    const state = makeState('greenfield')
    const modeResult = resolveAssemblyMode({
      step: 'tech-stack', state, currentDepth: 3, projectRoot: tmpDir,
    })
    expect(modeResult.mode).toBe('fresh')
    const names = withAdoptionKnowledge(metaPrompt.frontmatter.knowledgeBase, modeResult.mode)
    expect(names).not.toContain('brownfield-adoption')
  })
})
