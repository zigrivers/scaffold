import { describe, it, expect } from 'vitest'
import { createFakeSignalContext } from './context.js'
import { detectResearch } from './research.js'

describe('detectResearch', () => {
  it('high: autoresearch pattern — program.md + results.tsv with experiment markers', () => {
    const ctx = createFakeSignalContext({
      files: {
        'program.md': '# My Research\n\nLoop through experiments and evaluate results.\n',
        'results.tsv': 'run\tmetric\tvalue\n1\tacc\t0.95\n',
      },
    })
    const m = detectResearch(ctx)
    expect(m).not.toBeNull()
    expect(m!.projectType).toBe('research')
    expect(m!.confidence).toBe('high')
    expect(m!.partialConfig.experimentDriver).toBe('code-driven')
    expect(m!.partialConfig.interactionMode).toBe('autonomous')
  })

  it('high: trading backtest — backtest.py + trading dep with import verification', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'quant', dependencies: ['backtrader'] } },
      files: {
        'backtest.py': 'from backtrader import Cerebro\nbt = Cerebro()\n',
      },
    })
    const m = detectResearch(ctx)
    expect(m).not.toBeNull()
    expect(m!.projectType).toBe('research')
    expect(m!.confidence).toBe('high')
    expect(m!.partialConfig.experimentDriver).toBe('code-driven')
    expect(m!.partialConfig.domain).toBe('quant-finance')
  })

  it('medium: optimization deps + experiments dir (no ML deps) → config-driven', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'opt', dependencies: ['optuna'] } },
      dirs: ['experiments'],
    })
    const m = detectResearch(ctx)
    expect(m).not.toBeNull()
    expect(m!.projectType).toBe('research')
    expect(m!.confidence).toBe('medium')
    expect(m!.partialConfig.experimentDriver).toBe('config-driven')
  })

  it('medium: ML deps present → should return null (negative gate)', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'ml-proj', dependencies: ['torch', 'optuna'] } },
      dirs: ['experiments'],
    })
    const m = detectResearch(ctx)
    expect(m).toBeNull()
  })

  it('medium: simulation deps + experiments dir → domain: simulation', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'sim', dependencies: ['simpy'] } },
      dirs: ['experiments'],
    })
    const m = detectResearch(ctx)
    expect(m).not.toBeNull()
    expect(m!.projectType).toBe('research')
    expect(m!.confidence).toBe('medium')
    expect(m!.partialConfig.experimentDriver).toBe('code-driven')
    expect(m!.partialConfig.domain).toBe('simulation')
  })

  it('medium: trading deps + no web framework → domain: quant-finance', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'trading', dependencies: ['ccxt'] } },
    })
    const m = detectResearch(ctx)
    expect(m).not.toBeNull()
    expect(m!.projectType).toBe('research')
    expect(m!.confidence).toBe('medium')
    expect(m!.partialConfig.experimentDriver).toBe('code-driven')
    expect(m!.partialConfig.domain).toBe('quant-finance')
  })

  it('medium: LLM SDK + evals dir (no train.py) → api-driven', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'llm-eval', dependencies: ['openai'] } },
      dirs: ['evals'],
    })
    const m = detectResearch(ctx)
    expect(m).not.toBeNull()
    expect(m!.projectType).toBe('research')
    expect(m!.confidence).toBe('medium')
    expect(m!.partialConfig.experimentDriver).toBe('api-driven')
  })

  it('academic upgrade: medium signals + .tex file → upgrades to high', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'paper', dependencies: ['simpy'] } },
      dirs: ['experiments'],
      files: { 'paper.tex': '\\documentclass{article}' },
    })
    const m = detectResearch(ctx)
    expect(m).not.toBeNull()
    expect(m!.confidence).toBe('high')
  })

  it('low: experiments dir alone → code-driven', () => {
    const ctx = createFakeSignalContext({
      dirs: ['experiments'],
    })
    const m = detectResearch(ctx)
    expect(m).not.toBeNull()
    expect(m!.projectType).toBe('research')
    expect(m!.confidence).toBe('low')
    expect(m!.partialConfig.experimentDriver).toBe('code-driven')
  })

  it('null: empty repo', () => {
    const ctx = createFakeSignalContext({})
    expect(detectResearch(ctx)).toBeNull()
  })

  it('experiment tracking dep sets hasExperimentTracking', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'tracked', dependencies: ['optuna', 'mlflow'] } },
      dirs: ['experiments'],
    })
    const m = detectResearch(ctx)
    expect(m).not.toBeNull()
    expect(m!.partialConfig.hasExperimentTracking).toBe(true)
  })
})
