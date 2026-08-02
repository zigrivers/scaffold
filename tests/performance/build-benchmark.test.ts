import { describe, it, expect } from 'vitest'
import { discoverMetaPrompts } from '../../src/core/assembly/meta-prompt-loader.js'
import { buildGraph } from '../../src/core/dependency/graph.js'
import { detectCycles, topologicalSort } from '../../src/core/dependency/dependency.js'
import path from 'node:path'
import { BUDGET_BUILD_GRAPH_MS } from './budgets.js'
import { perOpStatsMs } from './measure.js'

describe('Build Performance', () => {
  it('dependency graph build completes within budget (p95)', () => {
    // Use the real pipeline directory from the repo. This said 'pipeline' until
    // the content/ reorganisation moved it, after which discoverMetaPrompts
    // found zero files: the benchmark built an empty graph in 0.2ms against a
    // 2000ms budget, so the assertion could not fail for any reason.
    const pipelineDir = path.resolve(process.cwd(), 'content', 'pipeline')

    // Guard the input, not just the output. If the directory moves again this
    // fails here with a clear cause, instead of quietly going back to timing
    // an empty graph.
    const discovered = discoverMetaPrompts(pipelineDir)
    expect(discovered.size, `no meta-prompts found under ${pipelineDir} — the benchmark would measure nothing`)
      .toBeGreaterThan(50)

    // One op here is already ~24ms, so it does not need batching the way the
    // microsecond-scale benchmarks do. The sample count is the shared default:
    // fewer would put the p95 rank at the top of the sorted samples, which is a
    // maximum, not a p95 (see measure.ts). ~24ms x 41 is about a second.
    const stats = perOpStatsMs(() => {
      const metaPrompts = discoverMetaPrompts(pipelineDir)
      const graph = buildGraph([...metaPrompts.values()].map(m => m.frontmatter), new Map())
      detectCycles(graph)
      topologicalSort(graph)
    }, { batch: 1, digits: 2 })
    console.log(`Build (dep graph) ${stats.summary} over ${discovered.size} meta-prompts`)
    expect(stats.p95).toBeLessThan(BUDGET_BUILD_GRAPH_MS)
  })
})
