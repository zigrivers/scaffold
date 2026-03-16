import { describe, it, expect } from 'vitest'
import { AssemblyEngine } from './engine.js'
import type {
  AssemblyOptions,
  KnowledgeEntry,
  UserInstructions,
  ExistingArtifact,
  ArtifactEntry,
} from '../../types/index.js'
import type { MetaPromptFile, MetaPromptFrontmatter } from '../../types/index.js'
import type { ScaffoldConfig } from '../../types/index.js'
import type { PipelineState } from '../../types/index.js'
import type { DepthLevel } from '../../types/index.js'
import type { DepthProvenance } from '../../types/index.js'

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

function makeFrontmatter(overrides: Partial<MetaPromptFrontmatter> = {}): MetaPromptFrontmatter {
  return {
    name: 'create-prd',
    description: 'Create the product requirements document',
    phase: 'modeling',
    order: 1,
    dependencies: [],
    outputs: ['docs/prd.md'],
    conditional: null,
    knowledgeBase: [],
    reads: [],
    ...overrides,
  }
}

function makeMetaPrompt(overrides: Partial<MetaPromptFile> = {}): MetaPromptFile {
  return {
    stepName: 'create-prd',
    filePath: '/project/.scaffold/pipeline/create-prd.md',
    frontmatter: makeFrontmatter(),
    body: 'Create a comprehensive product requirements document.',
    sections: {},
    ...overrides,
  }
}

function makeConfig(overrides: Partial<ScaffoldConfig> = {}): ScaffoldConfig {
  return {
    version: 2,
    methodology: 'deep',
    platforms: ['claude-code'],
    ...overrides,
  }
}

function makeState(steps: PipelineState['steps'] = {}): PipelineState {
  return {
    'schema-version': 1,
    'scaffold-version': '2.0.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2024-01-01T00:00:00.000Z',
    in_progress: null,
    steps,
    next_eligible: [],
    'extra-steps': [],
  }
}

function makeInstructions(overrides: Partial<UserInstructions> = {}): UserInstructions {
  return {
    global: null,
    perStep: null,
    inline: null,
    ...overrides,
  }
}

function makeOptions(overrides: Partial<AssemblyOptions> = {}): AssemblyOptions {
  return {
    config: makeConfig(),
    state: makeState(),
    metaPrompt: makeMetaPrompt(),
    knowledgeEntries: [],
    instructions: makeInstructions(),
    depth: 3 as DepthLevel,
    depthProvenance: 'preset-default' as DepthProvenance,
    updateMode: false,
    ...overrides,
  }
}

function makeKBEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    name: 'tdd-patterns',
    description: 'Test-Driven Development Patterns',
    topics: ['testing', 'tdd'],
    content: 'Write tests first, then make them pass.',
    ...overrides,
  }
}

function makeArtifact(overrides: Partial<ArtifactEntry> = {}): ArtifactEntry {
  return {
    stepName: 'create-prd',
    filePath: 'docs/prd.md',
    content: '# PRD\n\nThis is the product requirements.',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AssemblyEngine', () => {
  const engine = new AssemblyEngine()

  // 1. Assembles 7 sections in correct order
  it('assembles exactly 7 sections in correct order', () => {
    const result = engine.assemble('create-prd', makeOptions())

    expect(result.success).toBe(true)
    const sections = result.prompt!.sections
    expect(sections).toHaveLength(7)
    expect(sections[0].heading).toBe('System')
    expect(sections[1].heading).toBe('Meta-Prompt')
    expect(sections[2].heading).toBe('Knowledge Base')
    expect(sections[3].heading).toBe('Project Context')
    expect(sections[4].heading).toBe('Methodology')
    expect(sections[5].heading).toBe('Instructions')
    expect(sections[6].heading).toBe('Execution')
  })

  // 2. `text` concatenates all sections in order
  it('text concatenates all sections in order', () => {
    const result = engine.assemble('create-prd', makeOptions())
    const { text, sections } = result.prompt!

    for (const section of sections) {
      expect(text).toContain(`# ${section.heading}`)
      expect(text).toContain(section.content)
    }

    // Verify order: System before Meta-Prompt before Knowledge Base etc.
    const sysIdx = text.indexOf('# System')
    const metaIdx = text.indexOf('# Meta-Prompt')
    const kbIdx = text.indexOf('# Knowledge Base')
    const ctxIdx = text.indexOf('# Project Context')
    const methIdx = text.indexOf('# Methodology')
    const instrIdx = text.indexOf('# Instructions')
    const execIdx = text.indexOf('# Execution')

    expect(sysIdx).toBeLessThan(metaIdx)
    expect(metaIdx).toBeLessThan(kbIdx)
    expect(kbIdx).toBeLessThan(ctxIdx)
    expect(ctxIdx).toBeLessThan(methIdx)
    expect(methIdx).toBeLessThan(instrIdx)
    expect(instrIdx).toBeLessThan(execIdx)
  })

  // 3. Assembly is deterministic
  it('is deterministic — same inputs produce identical output', () => {
    const options = makeOptions()
    const result1 = engine.assemble('create-prd', options)
    const result2 = engine.assemble('create-prd', options)

    expect(result1.prompt!.text).toBe(result2.prompt!.text)
  })

  // 4. System section contains step name, methodology, depth
  it('System section contains step name, methodology, and depth', () => {
    const options = makeOptions({
      depth: 3 as DepthLevel,
      config: makeConfig({ methodology: 'deep' }),
    })
    const result = engine.assemble('create-prd', options)
    const sysContent = result.prompt!.sections[0].content

    expect(sysContent).toContain('create-prd')
    expect(sysContent).toContain('deep')
    expect(sysContent).toContain('3/5')
  })

  // 5. System section shows step progress (completed/total)
  it('System section shows completed/total step count', () => {
    const state = makeState({
      'step-a': { status: 'completed', source: 'pipeline' },
      'step-b': { status: 'completed', source: 'pipeline' },
      'step-c': { status: 'pending', source: 'pipeline' },
    })
    const result = engine.assemble('step-d', makeOptions({ state }))
    const sysContent = result.prompt!.sections[0].content

    expect(sysContent).toContain('2/3')
  })

  // 6. KB section has `## entryName: description` delimiter format
  it('Knowledge Base section uses ## name: description delimiter', () => {
    const kb: KnowledgeEntry[] = [
      makeKBEntry({ name: 'tdd-patterns', description: 'Test-Driven Development Patterns' }),
    ]
    const result = engine.assemble('create-prd', makeOptions({ knowledgeEntries: kb }))
    const kbContent = result.prompt!.sections[2].content

    expect(kbContent).toContain('## tdd-patterns: Test-Driven Development Patterns')
    expect(kbContent).toContain('Write tests first, then make them pass.')
  })

  // 7. KB section shows fallback when empty
  it('Knowledge Base section shows fallback text when entries are empty', () => {
    const result = engine.assemble('create-prd', makeOptions({ knowledgeEntries: [] }))
    const kbContent = result.prompt!.sections[2].content

    expect(kbContent).toContain('No knowledge base entries specified for this step.')
  })

  // 8. KB section includes multiple entries
  it('Knowledge Base section includes multiple entries in order', () => {
    const kb: KnowledgeEntry[] = [
      makeKBEntry({ name: 'tdd-patterns', description: 'TDD Patterns' }),
      makeKBEntry({ name: 'clean-arch', description: 'Clean Architecture', content: 'Separate concerns.' }),
    ]
    const result = engine.assemble('create-prd', makeOptions({ knowledgeEntries: kb }))
    const kbContent = result.prompt!.sections[2].content

    expect(kbContent).toContain('## tdd-patterns: TDD Patterns')
    expect(kbContent).toContain('## clean-arch: Clean Architecture')
    // tdd-patterns should appear before clean-arch
    expect(kbContent.indexOf('## tdd-patterns')).toBeLessThan(kbContent.indexOf('## clean-arch'))
  })

  // 9. Context section has `## Artifact: filepath` for each artifact
  it('Project Context section has ## Artifact: filepath for each artifact', () => {
    const artifacts: ArtifactEntry[] = [
      makeArtifact({ filePath: 'docs/prd.md', content: '# PRD content' }),
    ]
    const result = engine.assemble('review-prd', makeOptions({ artifacts }))
    const ctxContent = result.prompt!.sections[3].content

    expect(ctxContent).toContain('## Artifact: docs/prd.md')
    expect(ctxContent).toContain('# PRD content')
  })

  // Context section tests (using actual artifacts field approach)
  it('Project Context section shows artifacts with content', () => {
    const artifacts: ArtifactEntry[] = [
      makeArtifact({ filePath: 'docs/prd.md', content: '# PRD content here' }),
    ]
    const result = engine.assemble('review-prd', makeOptions({ artifacts }))
    const ctxContent = result.prompt!.sections[3].content

    expect(ctxContent).toContain('## Artifact: docs/prd.md')
    expect(ctxContent).toContain('# PRD content here')
  })

  // 10. Context section shows fallback when empty
  it('Project Context section shows fallback when no artifacts or decisions', () => {
    const result = engine.assemble('create-prd', makeOptions({ artifacts: [], decisions: '' }))
    const ctxContent = result.prompt!.sections[3].content

    expect(ctxContent).toContain('No prior artifacts available.')
  })

  // 11. Context includes decisions when non-empty
  it('Project Context section includes decisions log when non-empty', () => {
    const decisions = 'D-001: Use REST API (create-prd)'
    const result = engine.assemble('review-prd', makeOptions({ decisions }))
    const ctxContent = result.prompt!.sections[3].content

    expect(ctxContent).toContain('## Decisions Log')
    expect(ctxContent).toContain('D-001: Use REST API')
  })

  // 12. Context does NOT show decisions section when empty
  it('Project Context section omits decisions section when decisions is empty', () => {
    const result = engine.assemble('review-prd', makeOptions({ decisions: '' }))
    const ctxContent = result.prompt!.sections[3].content

    expect(ctxContent).not.toContain('## Decisions Log')
  })

  // 13. Instructions section includes only non-null layers
  it('Instructions section includes only non-null layers with sub-headings', () => {
    const instructions: UserInstructions = {
      global: 'Always use TypeScript.',
      perStep: null,
      inline: 'Focus on the PRD structure.',
    }
    const result = engine.assemble('create-prd', makeOptions({ instructions }))
    const instrContent = result.prompt!.sections[5].content

    expect(instrContent).toContain('### Global Instructions')
    expect(instrContent).toContain('Always use TypeScript.')
    expect(instrContent).not.toContain('### Step-Specific Instructions')
    expect(instrContent).toContain('### Inline Instructions')
    expect(instrContent).toContain('Focus on the PRD structure.')
  })

  // 14. Instructions section shows fallback when all null
  it('Instructions section shows fallback when all layers are null', () => {
    const result = engine.assemble('create-prd', makeOptions({ instructions: makeInstructions() }))
    const instrContent = result.prompt!.sections[5].content

    expect(instrContent).toContain('No user instructions provided.')
  })

  // 15. Instructions section includes all three layers when all non-null
  it('Instructions section includes all three layers when all non-null', () => {
    const instructions: UserInstructions = {
      global: 'Global guidance.',
      perStep: 'Step-specific guidance.',
      inline: 'Inline guidance.',
    }
    const result = engine.assemble('create-prd', makeOptions({ instructions }))
    const instrContent = result.prompt!.sections[5].content

    expect(instrContent).toContain('### Global Instructions')
    expect(instrContent).toContain('Global guidance.')
    expect(instrContent).toContain('### Step-Specific Instructions')
    expect(instrContent).toContain('Step-specific guidance.')
    expect(instrContent).toContain('### Inline Instructions')
    expect(instrContent).toContain('Inline guidance.')
  })

  // 16. Update mode includes existing artifact with revision note
  it('Project Context includes existing artifact in update mode', () => {
    const existingArtifact: ExistingArtifact = {
      filePath: 'docs/prd.md',
      content: '# Old PRD content',
      previousDepth: 2 as DepthLevel,
      completionTimestamp: '2024-01-01T00:00:00.000Z',
    }
    const result = engine.assemble('create-prd', makeOptions({
      updateMode: true,
      existingArtifact,
    }))
    const ctxContent = result.prompt!.sections[3].content

    expect(ctxContent).toContain('## Existing Output: docs/prd.md')
    expect(ctxContent).toContain('# Old PRD content')
    expect(ctxContent).toContain('update mode')
  })

  // 17. Execution section is always last and contains depth
  it('Execution section is always last and contains depth reference', () => {
    const result = engine.assemble('create-prd', makeOptions({ depth: 4 as DepthLevel }))
    const sections = result.prompt!.sections

    expect(sections[6].heading).toBe('Execution')
    expect(sections[6].content).toContain('4/5')
  })

  // 18. Returns success: false with error when metaPrompt is missing
  it('returns success: false with ASM_META_PROMPT_MISSING error when metaPrompt is null', () => {
    const options = makeOptions({ metaPrompt: null as unknown as MetaPromptFile })
    const result = engine.assemble('create-prd', options)

    expect(result.success).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].code).toBe('ASM_META_PROMPT_MISSING')
    expect(result.prompt).toBeUndefined()
  })

  // 19. Returns error for invalid depth
  it('returns success: false with ASM_INVALID_DEPTH error for depth 0', () => {
    const options = makeOptions({ depth: 0 as DepthLevel })
    const result = engine.assemble('create-prd', options)

    expect(result.success).toBe(false)
    expect(result.errors[0].code).toBe('ASM_INVALID_DEPTH')
  })

  it('returns success: false with ASM_INVALID_DEPTH error for depth 6', () => {
    const options = makeOptions({ depth: 6 as DepthLevel })
    const result = engine.assemble('create-prd', options)

    expect(result.success).toBe(false)
    expect(result.errors[0].code).toBe('ASM_INVALID_DEPTH')
  })

  // 20. metadata.knowledgeBaseEntries lists KB entry names
  it('metadata.knowledgeBaseEntries lists names of KB entries', () => {
    const kb: KnowledgeEntry[] = [
      makeKBEntry({ name: 'tdd-patterns' }),
      makeKBEntry({ name: 'clean-arch', description: 'Clean Architecture', content: 'Separate concerns.' }),
    ]
    const result = engine.assemble('create-prd', makeOptions({ knowledgeEntries: kb }))

    expect(result.prompt!.metadata.knowledgeBaseEntries).toEqual(['tdd-patterns', 'clean-arch'])
  })

  // 21. metadata.instructionLayers lists only non-null layers
  it('metadata.instructionLayers lists only non-null layers', () => {
    const instructions: UserInstructions = {
      global: 'Global.',
      perStep: null,
      inline: 'Inline.',
    }
    const result = engine.assemble('create-prd', makeOptions({ instructions }))

    expect(result.prompt!.metadata.instructionLayers).toEqual(['global', 'inline'])
  })

  it('metadata.instructionLayers is empty when all layers are null', () => {
    const result = engine.assemble('create-prd', makeOptions({ instructions: makeInstructions() }))

    expect(result.prompt!.metadata.instructionLayers).toEqual([])
  })

  // 22. metadata.artifactCount equals number of artifacts
  it('metadata.artifactCount equals number of artifacts provided', () => {
    const artifacts: ArtifactEntry[] = [
      makeArtifact({ filePath: 'docs/prd.md' }),
      makeArtifact({ filePath: 'docs/arch.md', content: '# Architecture' }),
    ]
    const result = engine.assemble('review', makeOptions({ artifacts }))

    expect(result.prompt!.metadata.artifactCount).toBe(2)
  })

  it('metadata.artifactCount is 0 when no artifacts', () => {
    const result = engine.assemble('create-prd', makeOptions({ artifacts: [] }))

    expect(result.prompt!.metadata.artifactCount).toBe(0)
  })

  // 23. metadata.sectionsIncluded lists all 7 section headings
  it('metadata.sectionsIncluded lists all 7 section headings', () => {
    const result = engine.assemble('create-prd', makeOptions())

    expect(result.prompt!.metadata.sectionsIncluded).toEqual([
      'System',
      'Meta-Prompt',
      'Knowledge Base',
      'Project Context',
      'Methodology',
      'Instructions',
      'Execution',
    ])
  })

  // 24. metadata.stepName matches the step argument
  it('metadata.stepName matches the step argument', () => {
    const result = engine.assemble('my-step', makeOptions())

    expect(result.prompt!.metadata.stepName).toBe('my-step')
  })

  // 25. metadata.depth and depthProvenance are correct
  it('metadata.depth and depthProvenance are correct', () => {
    const result = engine.assemble('create-prd', makeOptions({
      depth: 4 as DepthLevel,
      depthProvenance: 'cli-flag',
    }))

    expect(result.prompt!.metadata.depth).toBe(4)
    expect(result.prompt!.metadata.depthProvenance).toBe('cli-flag')
  })

  // 26. metadata.updateMode reflects the option
  it('metadata.updateMode reflects the updateMode option', () => {
    const result = engine.assemble('create-prd', makeOptions({ updateMode: true }))
    expect(result.prompt!.metadata.updateMode).toBe(true)

    const result2 = engine.assemble('create-prd', makeOptions({ updateMode: false }))
    expect(result2.prompt!.metadata.updateMode).toBe(false)
  })

  // 27. metadata.assembledAt is an ISO timestamp
  it('metadata.assembledAt is an ISO timestamp string', () => {
    const result = engine.assemble('create-prd', makeOptions())
    const ts = result.prompt!.metadata.assembledAt

    expect(typeof ts).toBe('string')
    expect(() => new Date(ts).toISOString()).not.toThrow()
  })

  // 28. metadata.assemblyDurationMs is a non-negative number
  it('metadata.assemblyDurationMs is a non-negative number', () => {
    const result = engine.assemble('create-prd', makeOptions())
    expect(result.prompt!.metadata.assemblyDurationMs).toBeGreaterThanOrEqual(0)
  })

  // 29. Methodology section content includes depth guidance
  it('Methodology section contains correct depth guidance for each level', () => {
    const depthGuidances: Record<number, string> = {
      1: 'Focus on the essential deliverable only.',
      2: 'Cover primary use cases; skip advanced configurations.',
      3: 'Full requirements coverage with common edge cases.',
      4: 'Thorough analysis including performance and alternatives.',
      5: 'Exhaustive exploration of all angles and tradeoffs.',
    }

    for (const [depth, guidance] of Object.entries(depthGuidances)) {
      const result = engine.assemble('create-prd', makeOptions({ depth: Number(depth) as DepthLevel }))
      const methContent = result.prompt!.sections[4].content

      expect(methContent).toContain(`${depth}/5`)
      expect(methContent).toContain(guidance)
    }
  })

  // 30. Methodology section includes depthProvenance
  it('Methodology section includes depth provenance information', () => {
    const result = engine.assemble('create-prd', makeOptions({
      depth: 3 as DepthLevel,
      depthProvenance: 'step-override',
    }))
    const methContent = result.prompt!.sections[4].content

    expect(methContent).toContain('step-override')
  })

  // 31. Meta-Prompt section uses the body content
  it('Meta-Prompt section contains the meta-prompt body', () => {
    const metaPrompt = makeMetaPrompt({
      body: 'Create a detailed PRD with all user stories and acceptance criteria.',
    })
    const result = engine.assemble('create-prd', makeOptions({ metaPrompt }))
    const metaContent = result.prompt!.sections[1].content

    expect(metaContent).toContain('Create a detailed PRD with all user stories and acceptance criteria.')
  })

  // 32. Assembly completes within 500ms
  it('completes within 500ms performance budget', () => {
    const kb: KnowledgeEntry[] = Array.from({ length: 10 }, (_, i) =>
      makeKBEntry({ name: `entry-${i}`, description: `Entry ${i}`, content: 'Some content '.repeat(100) }),
    )
    const artifacts: ArtifactEntry[] = Array.from({ length: 5 }, (_, i) =>
      makeArtifact({ filePath: `docs/doc-${i}.md`, content: '# Doc '.repeat(200) }),
    )
    const start = Date.now()
    engine.assemble('create-prd', makeOptions({ knowledgeEntries: kb, artifacts }))
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(500)
  })

  // 33. errors and warnings arrays are empty on success
  it('returns empty errors and warnings arrays on success', () => {
    const result = engine.assemble('create-prd', makeOptions())

    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  // 34. update mode with no existingArtifact does not add Existing Output section
  it('does not add Existing Output section when updateMode is true but no existingArtifact', () => {
    const result = engine.assemble('create-prd', makeOptions({ updateMode: true }))
    const ctxContent = result.prompt!.sections[3].content

    expect(ctxContent).not.toContain('## Existing Output:')
  })

  // 35. decisionCount in metadata reflects number of decisions
  it('metadata.decisionCount reflects number of decision lines', () => {
    const decisions = 'D-001: Use REST\nD-002: Use TypeScript\nD-003: Use PostgreSQL'
    const result = engine.assemble('create-prd', makeOptions({ decisions }))

    expect(result.prompt!.metadata.decisionCount).toBe(3)
  })

  it('metadata.decisionCount is 0 when no decisions', () => {
    const result = engine.assemble('create-prd', makeOptions({ decisions: '' }))
    expect(result.prompt!.metadata.decisionCount).toBe(0)
  })
})
