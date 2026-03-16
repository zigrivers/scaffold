import { describe, it, expect } from 'vitest'
import {
  createAdapter,
  KNOWN_PLATFORMS,
  type PlatformAdapter,
  type OutputFile,
  type AdapterStepOutput,
  type AdapterContext,
  type AdapterInitResult,
  type AdapterStepInput,
  type AdapterFinalizeInput,
  type AdapterFinalizeResult,
} from './adapter.js'

// ---------------------------------------------------------------------------
// Type shape tests (compile-time + runtime)
// ---------------------------------------------------------------------------

describe('OutputFile shape', () => {
  it('has relativePath, content, and writeMode fields', () => {
    const file: OutputFile = {
      relativePath: 'commands/step.md',
      content: '# Step',
      writeMode: 'create',
    }
    expect(file.relativePath).toBe('commands/step.md')
    expect(file.content).toBe('# Step')
    expect(file.writeMode).toBe('create')
  })

  it('accepts writeMode "section"', () => {
    const file: OutputFile = {
      relativePath: 'CLAUDE.md',
      content: '## Section',
      writeMode: 'section',
    }
    expect(file.writeMode).toBe('section')
  })
})

describe('AdapterStepOutput shape', () => {
  it('has slug, platformId, files, and success fields', () => {
    const output: AdapterStepOutput = {
      slug: 'define-goals',
      platformId: 'claude-code',
      files: [],
      success: true,
    }
    expect(output.slug).toBe('define-goals')
    expect(output.platformId).toBe('claude-code')
    expect(output.files).toEqual([])
    expect(output.success).toBe(true)
  })
})

describe('AdapterContext shape', () => {
  it('has projectRoot, methodology, and allSteps', () => {
    const ctx: AdapterContext = {
      projectRoot: '/projects/myapp',
      methodology: 'standard',
      allSteps: ['step-a', 'step-b'],
    }
    expect(ctx.projectRoot).toBe('/projects/myapp')
    expect(ctx.methodology).toBe('standard')
    expect(ctx.allSteps).toEqual(['step-a', 'step-b'])
  })
})

describe('AdapterInitResult shape', () => {
  it('has success and errors fields', () => {
    const result: AdapterInitResult = { success: true, errors: [] }
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
  })
})

describe('AdapterStepInput shape', () => {
  it('has required fields', () => {
    const input: AdapterStepInput = {
      slug: 'define-goals',
      description: 'Define project goals',
      phase: 'pre',
      dependsOn: [],
      produces: ['docs/goals.md'],
      pipelineIndex: 0,
    }
    expect(input.slug).toBe('define-goals')
    expect(input.phase).toBe('pre')
    expect(input.pipelineIndex).toBe(0)
  })

  it('accepts null phase', () => {
    const input: AdapterStepInput = {
      slug: 'optional-step',
      description: 'Optional',
      phase: null,
      dependsOn: [],
      produces: [],
      pipelineIndex: 5,
    }
    expect(input.phase).toBeNull()
  })
})

describe('AdapterFinalizeInput and AdapterFinalizeResult shapes', () => {
  it('AdapterFinalizeInput has results array', () => {
    const input: AdapterFinalizeInput = { results: [] }
    expect(input.results).toEqual([])
  })

  it('AdapterFinalizeResult has files and errors arrays', () => {
    const result: AdapterFinalizeResult = { files: [], errors: [] }
    expect(result.files).toEqual([])
    expect(result.errors).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// PlatformAdapter interface type check via assignability
// ---------------------------------------------------------------------------

describe('PlatformAdapter interface', () => {
  it('can be assigned an object with required methods', () => {
    const mockAdapter: PlatformAdapter = {
      platformId: 'test',
      initialize: (ctx: AdapterContext): AdapterInitResult => ({ success: ctx.allSteps.length >= 0, errors: [] }),
      generateStepWrapper: (input: AdapterStepInput): AdapterStepOutput => ({
        slug: input.slug,
        platformId: 'test',
        files: [],
        success: true,
      }),
      finalize: (input: AdapterFinalizeInput): AdapterFinalizeResult => ({
        files: [],
        errors: input.results.flatMap(() => []),
      }),
    }
    expect(mockAdapter.platformId).toBe('test')
    expect(typeof mockAdapter.initialize).toBe('function')
    expect(typeof mockAdapter.generateStepWrapper).toBe('function')
    expect(typeof mockAdapter.finalize).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// KNOWN_PLATFORMS
// ---------------------------------------------------------------------------

describe('KNOWN_PLATFORMS', () => {
  it('includes "claude-code"', () => {
    expect(KNOWN_PLATFORMS).toContain('claude-code')
  })

  it('includes "codex"', () => {
    expect(KNOWN_PLATFORMS).toContain('codex')
  })

  it('includes "universal"', () => {
    expect(KNOWN_PLATFORMS).toContain('universal')
  })

  it('has exactly 3 entries', () => {
    expect(KNOWN_PLATFORMS).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// createAdapter
// ---------------------------------------------------------------------------

describe('createAdapter', () => {
  it('throws for unknown platformId with message "Unknown platform: unknown"', () => {
    expect(() => createAdapter('unknown')).toThrow('Unknown platform: unknown')
  })

  it('throws for arbitrary unknown platform string', () => {
    expect(() => createAdapter('bad')).toThrow('Unknown platform: bad')
  })

  it('thrown error has code UNKNOWN_PLATFORM', () => {
    try {
      createAdapter('bad')
    } catch (e) {
      expect((e as { code: string }).code).toBe('UNKNOWN_PLATFORM')
    }
  })

  it('thrown error has exitCode 1', () => {
    try {
      createAdapter('bad')
    } catch (e) {
      expect((e as { exitCode: number }).exitCode).toBe(1)
    }
  })

  it('also throws for known platform IDs since adapters are not yet implemented', () => {
    // T-040/T-041/T-042 will register real adapters; for now all throw
    for (const pid of KNOWN_PLATFORMS) {
      expect(() => createAdapter(pid)).toThrow('Unknown platform')
    }
  })
})
