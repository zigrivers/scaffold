import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectMl } from './ml.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/ml')

describe('detectMl', () => {
  it('PyTorch + train.py + models/ + mlflow → training, no servingPattern', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'pytorch-train'))
    const m = detectMl(ctx)
    expect(m?.projectType).toBe('ml')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.projectPhase).toBe('training')
    expect(m?.partialConfig.servingPattern).toBeUndefined()    // CRITICAL: omitted
    expect(m?.partialConfig.modelType).toBe('deep-learning')
    expect(m?.partialConfig.hasExperimentTracking).toBe(true)
  })

  it('FastAPI + torch + serve.py → inference + realtime serving', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'fastapi-inference'))
    const m = detectMl(ctx)
    expect(m?.partialConfig.projectPhase).toBe('inference')
    expect(m?.partialConfig.servingPattern).toBe('realtime')   // CRITICAL: must be set
  })

  it('HuggingFace model card → llm + inference + realtime', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'hf-modelcard'))
    const m = detectMl(ctx)
    expect(m?.partialConfig.modelType).toBe('llm')
    expect(m?.partialConfig.projectPhase).toBe('inference')
    expect(m?.partialConfig.servingPattern).toBe('realtime')
  })

  it('Inference detected with NO specific serving signal → fallback realtime', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'm', dependencies: ['torch'] } },
      files: { 'predict.py': 'import torch' },
    })
    const m = detectMl(ctx)
    expect(m?.partialConfig.projectPhase).toBe('inference')
    expect(m?.partialConfig.servingPattern).toBe('realtime')   // fallback fires
  })

  it('Both training AND inference → both + realtime', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'm', dependencies: ['torch'] } },
      files: {
        'train.py': 'import torch',
        'serve.py': 'import torch',
      },
    })
    const m = detectMl(ctx)
    expect(m?.partialConfig.projectPhase).toBe('both')
    expect(m?.partialConfig.servingPattern).toBe('realtime')
  })

  it('scikit-learn alone → classical', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'm', dependencies: ['scikit-learn'] } },
      files: { 'train.py': 'import sklearn' },
    })
    expect(detectMl(ctx)?.partialConfig.modelType).toBe('classical')
  })

  it('Notebook-only (no ML framework dep) → low tier', () => {
    const ctx = createFakeSignalContext({
      rootEntries: ['notebook.ipynb', 'analysis.ipynb'],
      // no pyproject, no ML deps
    })
    const m = detectMl(ctx)
    expect(m?.confidence).toBe('low')
    expect(m?.evidence[0].signal).toBe('notebooks-only')
  })

  it('No ML signals → null', () => {
    const ctx = createFakeSignalContext({ packageJson: { name: 'demo' } })
    expect(detectMl(ctx)).toBeNull()
  })
})
