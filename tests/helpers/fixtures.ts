/**
 * Test fixture factory for common scaffold types.
 * Use these to create realistic test data without repeating boilerplate.
 */
import type { MetaPromptFile, MetaPromptFrontmatter } from '../../src/types/frontmatter.js'
import type { ScaffoldConfig, MethodologyPreset } from '../../src/types/config.js'
import type { PipelineState, StepStateEntry } from '../../src/types/state.js'
import type { DependencyGraph, DependencyNode } from '../../src/types/dependency.js'
import type { AssemblyResult } from '../../src/types/assembly.js'
import type { DepthLevel } from '../../src/types/enums.js'

// ---------------------------------------------------------------------------
// Frontmatter & MetaPrompt
// ---------------------------------------------------------------------------

export function makeFrontmatter(
  overrides: Partial<MetaPromptFrontmatter> = {},
): MetaPromptFrontmatter {
  return {
    name: 'create-prd',
    description: 'Create a product requirements document',
    phase: 'pre',
    order: 110,
    dependencies: [],
    outputs: ['docs/plan.md'],
    conditional: null,
    knowledgeBase: [],
    reads: [],
    ...overrides,
  }
}

export function makeMetaPrompt(
  overrides: Partial<MetaPromptFile> = {},
): MetaPromptFile {
  return {
    stepName: overrides.stepName ?? 'create-prd',
    filePath: `/pipeline/${overrides.stepName ?? 'create-prd'}.md`,
    frontmatter: makeFrontmatter(overrides.frontmatter),
    body: overrides.body ?? '## Purpose\n\nCreate a PRD.\n\n## Process\n\nGather requirements.',
    sections: overrides.sections ?? {
      Purpose: 'Create a PRD.',
      Process: 'Gather requirements.',
    },
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function makeConfig(
  overrides: Partial<ScaffoldConfig> = {},
): ScaffoldConfig {
  return {
    version: 2,
    methodology: 'deep',
    platforms: ['claude-code'],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function makeStepEntry(
  overrides: Partial<StepStateEntry> = {},
): StepStateEntry {
  return {
    status: 'pending',
    source: 'pipeline',
    produces: [],
    ...overrides,
  }
}

export function makeState(
  steps: Record<string, Partial<StepStateEntry>> = {},
  overrides: Partial<PipelineState> = {},
): PipelineState {
  const resolvedSteps: Record<string, StepStateEntry> = {}
  for (const [key, val] of Object.entries(steps)) {
    resolvedSteps[key] = makeStepEntry(val)
  }
  return {
    'schema-version': 1,
    'scaffold-version': '2.0.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2024-01-01T00:00:00.000Z',
    in_progress: null,
    steps: {
      'create-prd': makeStepEntry({ produces: ['docs/plan.md'] }),
      ...resolvedSteps,
    },
    next_eligible: [],
    'extra-steps': [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Preset
// ---------------------------------------------------------------------------

export function makePreset(
  overrides: Partial<MethodologyPreset> = {},
): MethodologyPreset {
  return {
    name: 'deep',
    description: 'Deep methodology',
    default_depth: 3 as DepthLevel,
    steps: {
      'create-prd': { enabled: true },
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Dependency Graph
// ---------------------------------------------------------------------------

export function makeNode(
  overrides: Partial<DependencyNode> = {},
): DependencyNode {
  return {
    slug: 'create-prd',
    phase: 'pre',
    order: 110,
    dependencies: [],
    enabled: true,
    ...overrides,
  }
}

export function makeGraph(
  nodes: Array<Partial<DependencyNode>> = [{}],
): DependencyGraph {
  const nodeMap = new Map<string, DependencyNode>()
  const edgeMap = new Map<string, string[]>()

  for (const partial of nodes) {
    const node = makeNode(partial)
    nodeMap.set(node.slug, node)
    edgeMap.set(node.slug, [])
  }

  // Build edges from dependencies
  for (const node of nodeMap.values()) {
    for (const dep of node.dependencies) {
      const existing = edgeMap.get(dep) ?? []
      existing.push(node.slug)
      edgeMap.set(dep, existing)
    }
  }

  return { nodes: nodeMap, edges: edgeMap }
}

// ---------------------------------------------------------------------------
// Assembly Result
// ---------------------------------------------------------------------------

export function makeAssemblyResult(
  overrides: Partial<AssemblyResult> = {},
): AssemblyResult {
  return {
    success: true,
    prompt: {
      text: 'assembled prompt text',
      sections: [],
      metadata: {
        stepName: 'create-prd',
        depth: 3 as DepthLevel,
        depthProvenance: 'preset-default',
        knowledgeBaseEntries: [],
        instructionLayers: [],
        artifactCount: 0,
        decisionCount: 0,
        assemblyDurationMs: 10,
        assembledAt: '2024-01-01T00:00:00.000Z',
        updateMode: false,
        sectionsIncluded: [],
      },
    },
    errors: [],
    warnings: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Output Context (for CLI tests)
// ---------------------------------------------------------------------------

export function makeOutputContext() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { vi } = require('vitest')
  return {
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    result: vi.fn(),
    prompt: vi.fn(),
    confirm: vi.fn(),
    startSpinner: vi.fn(),
    stopSpinner: vi.fn(),
    startProgress: vi.fn(),
    updateProgress: vi.fn(),
    stopProgress: vi.fn(),
  }
}
