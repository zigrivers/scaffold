import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildDocGraph } from './index.js'

describe('buildDocGraph', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-graph-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('produces a complete graph from a small project fixture', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src/auth'), { recursive: true })

    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run' } }))
    writeFileSync(join(dir, 'docs/plan.md'),
      '# PRD\n\n## Features\n\n### User Auth [priority: must]\n\nUsers sign in.\n')
    writeFileSync(join(dir, 'docs/user-stories.md'),
      '# Stories\n\n## Story user-auth-1: Sign in [priority: must]\n\n' +
      '### AC 1: signs in\nGiven valid credentials, the user signs in.\n')
    writeFileSync(join(dir, 'docs/implementation-plan.md'),
      '# Plan\n\n## Task T-001: Login form [story: user-auth-1] [status: done]\n')
    writeFileSync(join(dir, 'src/auth/login.test.ts'),
      'import { it, expect } from \'vitest\'\nit(\'AC 1: signs in\', () => { expect(1).toBe(1) })\n')

    const graph = await buildDocGraph(dir)
    expect(graph.features).toHaveLength(1)
    expect(graph.stories).toHaveLength(1)
    expect(graph.acceptance_criteria).toHaveLength(1)
    expect(graph.plan_tasks).toHaveLength(1)
    expect(graph.tests.length).toBeGreaterThanOrEqual(1)

    expect(graph.edges.find((e) => e.kind === 'story_to_ac')).toBeDefined()
    expect(graph.edges.find((e) => e.kind === 'story_to_plan_task')).toBeDefined()
    expect(graph.edges.find((e) => e.kind === 'test_to_file')).toBeDefined()

    expect(graph.provenance['feature:user-auth']).toBe('pipeline_docs')
    expect(graph.provenance[graph.tests[0].id]).toBe('git')
  })

  it('returns an empty graph when no docs exist', async () => {
    writeFileSync(join(dir, 'package.json'), '{}')
    const graph = await buildDocGraph(dir)
    expect(graph.features).toEqual([])
    expect(graph.stories).toEqual([])
    expect(graph.edges).toEqual([])
  })

  it('emits file_to_token_use and file_to_component_use edges when detectors match', async () => {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    mkdirSync(join(dir, 'src/styles'), { recursive: true })
    mkdirSync(join(dir, 'src/lib'), { recursive: true })
    mkdirSync(join(dir, '.scaffold'), { recursive: true })

    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'docs/design-system.md'), [
      '# Design System',
      '',
      '## Color',
      '',
      '| Token | Value | Priority |',
      '|-------|-------|----------|',
      '| --color-primary | #4f46e5 | must |',
      '',
    ].join('\n'))
    writeFileSync(join(dir, 'docs/tech-stack.md'), [
      '# Tech Stack',
      '',
      '## Frontend',
      '',
      '### React',
      '',
      'package_or_url: react@18',
      'layer: frontend',
      '',
    ].join('\n'))
    writeFileSync(join(dir, 'src/styles/btn.css'),
      '.btn { color: #4f46e5; background: #abcdef; }\n')
    writeFileSync(join(dir, 'src/lib/auth.ts'),
      'import React from \'react\'\nimport { something } from \'unknown-pkg\'\n')
    writeFileSync(join(dir, '.scaffold/observability.yaml'), [
      'lenses:',
      '  E-design:',
      '    ui_glob: "src/styles/**/*.css,src/styles/**/*.scss"',
    ].join('\n'))

    const graph = await buildDocGraph(dir)
    const tokenEdge = graph.edges.find((e) => e.kind === 'file_to_token_use')
    expect(tokenEdge).toBeDefined()
    expect(tokenEdge?.from).toBe('file:src/styles/btn.css')

    const componentEdges = graph.edges.filter((e) => e.kind === 'file_to_component_use')
    expect(componentEdges.length).toBeGreaterThanOrEqual(2)
    expect(componentEdges.find((e) => e.to === 'component:react')).toBeDefined()
    expect(componentEdges.find((e) => e.to === 'unsanctioned')).toBeDefined()
  })
})
