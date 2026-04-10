import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectDataPipeline } from './data-pipeline.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/data-pipeline')

describe('detectDataPipeline', () => {
  it('dbt_project.yml + tests dir → batch + dag-based + testing', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'dbt'))
    const m = detectDataPipeline(ctx)
    expect(m?.projectType).toBe('data-pipeline')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.processingModel).toBe('batch')
    expect(m?.partialConfig.orchestration).toBe('dag-based')
    expect(m?.partialConfig.dataQualityStrategy).toBe('testing')
  })

  it('dags/ + airflow dep → batch + dag-based', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'airflow-dags'))
    const m = detectDataPipeline(ctx)
    expect(m?.partialConfig.orchestration).toBe('dag-based')
  })

  it('Prefect pipelines/ + dep → dag-based', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'prefect'))
    const m = detectDataPipeline(ctx)
    expect(m?.partialConfig.orchestration).toBe('dag-based')
  })

  it('kafka dep alone (no orchestrator, no structure) → streaming + low tier', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'pipe', dependencies: { kafkajs: '2' } },
    })
    const m = detectDataPipeline(ctx)
    expect(m?.partialConfig.processingModel).toBe('streaming')
    expect(m?.confidence).toBe('low')
  })

  it('framework dep alone (no file structure) → medium', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'p', dependencies: ['dagster'] } },
    })
    const m = detectDataPipeline(ctx)
    expect(m?.confidence).toBe('medium')
  })

  it('great-expectations dep → validation', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'p', dependencies: ['apache-airflow', 'great-expectations'] } },
      dirs: ['dags'],
      dirListings: { dags: ['etl.py'] },
      files: { 'dags/etl.py': 'from airflow import DAG' },
    })
    expect(detectDataPipeline(ctx)?.partialConfig.dataQualityStrategy).toBe('validation')
  })

  it('No data-pipeline signals → null', () => {
    const ctx = createFakeSignalContext({ packageJson: { name: 'demo' } })
    expect(detectDataPipeline(ctx)).toBeNull()
  })

  it('hasDataCatalog true with datahub dep', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 'p', dependencies: ['apache-airflow', 'datahub'] } },
      dirs: ['dags'],
      dirListings: { dags: ['etl.py'] },
      files: { 'dags/etl.py': 'from airflow import DAG' },
    })
    expect(detectDataPipeline(ctx)?.partialConfig.hasDataCatalog).toBe(true)
  })
})
