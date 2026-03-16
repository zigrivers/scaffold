import { describe, it, expect } from 'vitest'
import { discoverMetaPrompts } from '../../src/core/assembly/meta-prompt-loader.js'
import { buildGraph } from '../../src/core/dependency/graph.js'
import { detectCycles, topologicalSort } from '../../src/core/dependency/dependency.js'
import path from 'node:path'

describe('Build Performance', () => {
  it('dependency graph build completes within 2s (p95)', () => {
    // Use real pipeline/ directory from the repo
    const pipelineDir = path.resolve(process.cwd(), 'pipeline')

    const timings: number[] = []
    for (let i = 0; i < 10; i++) {
      const start = performance.now()
      const metaPrompts = discoverMetaPrompts(pipelineDir)
      const graph = buildGraph([...metaPrompts.values()].map(m => m.frontmatter), new Map())
      detectCycles(graph)
      topologicalSort(graph)
      timings.push(performance.now() - start)
    }

    timings.sort((a, b) => a - b)
    const p95 = timings[Math.floor(timings.length * 0.95)]
    console.log(`Build (dep graph) p95=${p95.toFixed(2)}ms`)
    expect(p95).toBeLessThan(2000)
  })
})
