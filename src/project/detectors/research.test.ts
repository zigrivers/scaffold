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

  it('medium: optimization + ML deps → ML gate blocks medium-tier, falls through to low', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'ml-proj', dependencies: ['torch', 'optuna'] } },
      dirs: ['experiments'],
    })
    const m = detectResearch(ctx)
    // ML gate blocks the medium-tier optimization branch, but experiments/ dir
    // alone still fires at low confidence (the ML gate is scoped to medium only).
    expect(m).not.toBeNull()
    expect(m!.confidence).toBe('low')
    expect(m!.partialConfig.experimentDriver).toBe('code-driven')
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

  // --- P0: autoresearch + ML deps should still detect as high ---
  it('high: autoresearch pattern with ML deps (torch) → still detected as research-high', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'autoresearch', dependencies: ['torch'] } },
      files: {
        'program.md': '# Experiment\n\nLoop through parameter sweeps and evaluate.\n',
        'results.tsv': 'run\tmetric\n1\t0.9\n',
      },
    })
    const m = detectResearch(ctx)
    expect(m).not.toBeNull()
    expect(m!.confidence).toBe('high')
    expect(m!.partialConfig.experimentDriver).toBe('code-driven')
    expect(m!.partialConfig.interactionMode).toBe('autonomous')
  })

  // --- P1: sweep.yaml signals ---
  it('medium: sweep.yaml + results dir (non-W&B) → config-driven autonomous', () => {
    const ctx = createFakeSignalContext({
      dirs: ['results'],
      files: {
        'sweep.yaml': 'lr: [0.001, 0.01]\nbatch_size: [16, 32]\n',
      },
    })
    const m = detectResearch(ctx)
    expect(m).not.toBeNull()
    expect(m!.confidence).toBe('medium')
    expect(m!.partialConfig.experimentDriver).toBe('config-driven')
    expect(m!.partialConfig.interactionMode).toBe('autonomous')
  })

  it('medium: sweep_config.yaml + experiments dir (non-W&B) → config-driven autonomous', () => {
    const ctx = createFakeSignalContext({
      dirs: ['experiments'],
      files: {
        'sweep_config.yaml': 'search_space:\n  lr: [0.01, 0.1]\n',
      },
    })
    const m = detectResearch(ctx)
    expect(m).not.toBeNull()
    expect(m!.confidence).toBe('medium')
    expect(m!.partialConfig.experimentDriver).toBe('config-driven')
    expect(m!.partialConfig.interactionMode).toBe('autonomous')
  })

  it('null: sweep.yaml with all W&B keys (method + metric + parameters) → skip', () => {
    const ctx = createFakeSignalContext({
      dirs: ['results'],
      files: {
        'sweep.yaml': 'method: bayes\nmetric:\n  name: val_loss\n'
          + '  goal: minimize\nparameters:\n  lr:\n    min: 0.001\n',
      },
    })
    const m = detectResearch(ctx)
    // W&B sweep config is ML territory — no research match
    expect(m).toBeNull()
  })

  // --- P1: results.jsonl for LLM eval ---
  it('medium: LLM SDK + results.jsonl (no evals dir, no train.py) → api-driven', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'llm-bench', dependencies: ['openai'] } },
      files: {
        'results.jsonl': '{"prompt":"test","response":"ok"}\n',
      },
    })
    const m = detectResearch(ctx)
    expect(m).not.toBeNull()
    expect(m!.confidence).toBe('medium')
    expect(m!.partialConfig.experimentDriver).toBe('api-driven')
  })

  // --- P2: trading deps + web framework → null ---
  it('null: trading deps + web framework → not research (likely a trading app)', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'trading-app', dependencies: ['ccxt', 'fastapi'] } },
    })
    const m = detectResearch(ctx)
    expect(m).toBeNull()
  })

  // --- P2: LLM SDK + evals + train.py → should NOT match LLM eval path ---
  it('null: LLM SDK + evals dir + train.py → not research (ML training project)', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'fine-tune', dependencies: ['openai'] } },
      dirs: ['evals'],
      files: { 'train.py': 'import openai\n' },
    })
    const m = detectResearch(ctx)
    // train.py blocks the LLM eval path; no other signals match
    expect(m).toBeNull()
  })

  // --- P2: notebooks + optimization deps WITH ML deps → still match low ---
  it('low: notebooks + optimization deps + ML deps → still matches low (ML gate only blocks medium)', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'nb-opt', dependencies: ['optuna', 'torch'] } },
      rootEntries: ['analysis.ipynb'],
    })
    const m = detectResearch(ctx)
    expect(m).not.toBeNull()
    expect(m!.confidence).toBe('low')
    expect(m!.partialConfig.experimentDriver).toBe('notebook-driven')
  })

  // --- P2: strategy.py trading path ---
  it('high: strategy.py + trading dep with import verification → quant-finance', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'algo', dependencies: ['backtrader'] } },
      files: {
        'strategy.py': 'from backtrader import Strategy\nclass MyStrat(Strategy): pass\n',
      },
    })
    const m = detectResearch(ctx)
    expect(m).not.toBeNull()
    expect(m!.confidence).toBe('high')
    expect(m!.partialConfig.experimentDriver).toBe('code-driven')
    expect(m!.partialConfig.domain).toBe('quant-finance')
  })
})
