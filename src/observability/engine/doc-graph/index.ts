import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { minimatch } from 'minimatch'
import type { DocGraph, FileNode, AdapterId, Test } from '../types.js'
import { pipelineDocsAdapter } from '../../adapters/pipeline-docs.js'
import { parseFeatures } from './feature-parser.js'
import { parseStories } from './story-parser.js'
import { parsePlanTasks } from './plan-task-parser.js'
import { parsePlaybookTasks } from './playbook-task-parser.js'
import { parseRules } from './rule-parser.js'
import { parseSanctionedComponents } from './component-parser.js'
import { parseDesignTokens } from './token-parser.js'
import { parseDecisions } from './decision-parser.js'
import { discoverTests } from './test-discovery.js'
import { buildEdges } from './edge-builder.js'
import { detectCssTokenUses, detectJsxTokenUses } from './token-use-detector.js'
import type { TokenUse } from './token-use-detector.js'
import { detectComponentUses } from './component-use-detector.js'
import type { ComponentUse } from './component-use-detector.js'
import { loadObservabilityConfig } from '../checks/observability-config.js'

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.scaffold', '.beads', '.mmr', 'coverage'])

function* walkFiles(dir: string, base: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue
    const abs = join(dir, e)
    let s
    try { s = statSync(abs) } catch { continue }
    if (s.isDirectory()) yield* walkFiles(abs, base)
    else if (s.isFile()) yield relative(base, abs).split(sep).join('/')
  }
}

function discoverFiles(cwd: string): FileNode[] {
  if (!existsSync(cwd)) return []
  return [...walkFiles(cwd, cwd)].map((p) => ({ id: `file:${p}`, path: p }))
}

function inferAcToTestOverrides(acs: { id: string }[], tests: Test[]): Record<string, string[]> {
  const tailCounts = new Map<string, number>()
  for (const ac of acs) {
    const tail = ac.id.split('.').pop() ?? ''
    tailCounts.set(tail, (tailCounts.get(tail) ?? 0) + 1)
  }
  const out: Record<string, string[]> = {}
  for (const ac of acs) {
    const tail = ac.id.split('.').pop() ?? ''
    if ((tailCounts.get(tail) ?? 0) > 1) continue
    const matchers = [new RegExp(`^AC\\s*${tail}\\b`, 'i'), new RegExp(`\\bac\\s*${tail}\\b`, 'i')]
    const matchedTests = tests.filter((t) => matchers.some((re) => re.test(t.name)))
    if (matchedTests.length > 0) out[ac.id] = matchedTests.map((t) => t.id)
  }
  return out
}

export async function buildDocGraph(cwd: string): Promise<DocGraph> {
  const artifacts = await pipelineDocsAdapter.readArtifacts(cwd)
  const features = artifacts.prd ? parseFeatures(artifacts.prd) : []
  const { stories, acs } = artifacts.user_stories ? parseStories(artifacts.user_stories) : { stories: [], acs: [] }
  const planTasks = artifacts.implementation_plan ? parsePlanTasks(artifacts.implementation_plan) : []
  const playbookTasks = artifacts.implementation_playbook ? parsePlaybookTasks(artifacts.implementation_playbook) : []
  const codingRules = artifacts.coding_standards
    ? parseRules(artifacts.coding_standards, 'docs/coding-standards.md') : []
  const tddRules = artifacts.tdd_standards ? parseRules(artifacts.tdd_standards, 'docs/tdd-standards.md') : []
  const components = artifacts.tech_stack ? parseSanctionedComponents(artifacts.tech_stack) : []
  const tokens = artifacts.design_system ? parseDesignTokens(artifacts.design_system) : []
  const decisions = await parseDecisions(cwd)
  const tests = await discoverTests(cwd)
  const files = discoverFiles(cwd)
  const acToTestOverrides = inferAcToTestOverrides(acs, tests)

  const config = loadObservabilityConfig(cwd)
  const uiGlobs = (config.lenses['E-design']?.ui_glob ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const tokenUses: TokenUse[] = []
  const componentUses: ComponentUse[] = []
  for (const f of files) {
    if (uiGlobs.length > 0 && uiGlobs.some((g) => minimatch(f.path, g))) {
      let content: string
      try { content = readFileSync(join(cwd, f.path), 'utf8') } catch { continue }
      if (/\.(css|scss)$/.test(f.path)) tokenUses.push(...detectCssTokenUses(content, tokens, f.path))
      else if (/\.(tsx|jsx)$/.test(f.path)) tokenUses.push(...detectJsxTokenUses(content, tokens, f.path))
    }
    if (/\.(ts|tsx|js|jsx|mts|cts)$/.test(f.path) && !f.path.endsWith('.d.ts')) {
      let content: string
      try { content = readFileSync(join(cwd, f.path), 'utf8') } catch { continue }
      componentUses.push(...detectComponentUses(content, components, f.path))
    }
  }

  const { edges, unresolved_globs } = buildEdges({
    features, stories, acs, plan_tasks: planTasks, playbook_tasks: playbookTasks,
    tests, files, decisions, ac_to_test_overrides: acToTestOverrides,
    token_uses: tokenUses, component_uses: componentUses,
  })

  const provenance: Record<string, AdapterId> = {}
  for (const f of features) provenance[f.id] = 'pipeline_docs'
  for (const s of stories) provenance[s.id] = 'pipeline_docs'
  for (const a of acs) provenance[a.id] = 'pipeline_docs'
  for (const p of planTasks) provenance[p.id] = 'pipeline_docs'
  for (const p of playbookTasks) provenance[p.id] = 'pipeline_docs'
  for (const r of [...codingRules, ...tddRules]) provenance[r.id] = 'pipeline_docs'
  for (const c of components) provenance[c.id] = 'pipeline_docs'
  for (const t of tokens) provenance[t.id] = 'pipeline_docs'
  for (const d of decisions) provenance[d.id] = 'pipeline_docs'
  for (const t of tests) provenance[t.id] = 'git'
  for (const f of files) provenance[f.id] = 'git'

  return {
    features, stories, acceptance_criteria: acs,
    plan_tasks: planTasks, playbook_tasks: playbookTasks,
    tests, pull_requests: [], files,
    rules: [...codingRules, ...tddRules],
    components, tokens, decisions,
    edges, provenance, unresolved_globs,
  }
}
