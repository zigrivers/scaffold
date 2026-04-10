import type { SignalContext } from './context.js'
import type { DataPipelineMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

export function detectDataPipeline(ctx: SignalContext): DataPipelineMatch | null {
  const ev: DetectionEvidence[] = []

  // High-tier signals
  const hasDbt = ctx.hasFile('dbt_project.yml')
  const hasKedro = ctx.hasFile('kedro.yml')

  let hasAirflowDag = false
  if (ctx.dirExists('dags')) {
    const dagFiles = ctx.listDir('dags').filter(f => f.endsWith('.py'))
    for (const f of dagFiles) {
      const text = ctx.readFileText(`dags/${f}`)
      if (text && /from\s+airflow\s+import/.test(text)) {
        hasAirflowDag = true
        break
      }
    }
  }

  let hasPrefectFlow = false
  let hasDagsterJob = false
  if (ctx.dirExists('pipelines')) {
    const files = ctx.listDir('pipelines').filter(f => f.endsWith('.py'))
    for (const f of files) {
      const text = ctx.readFileText(`pipelines/${f}`)
      if (text && /from\s+prefect/.test(text)) hasPrefectFlow = true
      if (text && /from\s+dagster/.test(text)) hasDagsterJob = true
      if (hasPrefectFlow || hasDagsterJob) break
    }
  }

  const hasHighSignal = hasDbt || hasKedro || hasAirflowDag || hasPrefectFlow || hasDagsterJob

  // Medium-tier: framework dep alone
  const hasFrameworkDep = ctx.hasAnyDep(
    ['apache-airflow', 'prefect', 'dagster', 'dbt-core', 'kedro'], 'py')

  // Streaming/batch deps
  const hasStreamDep = ctx.hasAnyDep(['kafkajs', '@confluentinc/kafka-javascript'], 'npm')
    || ctx.hasAnyDep(['kafka-python', 'confluent-kafka', 'apache-beam', 'apache-flink'], 'py')
  const hasBatchDep = ctx.hasDep('pyspark', 'py')

  if (!hasHighSignal && !hasFrameworkDep && !hasStreamDep && !hasBatchDep) return null

  if (hasDbt) ev.push(evidence('dbt-project', 'dbt_project.yml'))
  if (hasAirflowDag) ev.push(evidence('airflow-dags', 'dags/'))
  if (hasPrefectFlow) ev.push(evidence('prefect-flows', 'pipelines/'))
  if (hasDagsterJob) ev.push(evidence('dagster-jobs', 'pipelines/'))

  // processingModel
  let processingModel: DataPipelineMatch['partialConfig']['processingModel'] = 'batch'
  if (hasStreamDep && hasBatchDep) processingModel = 'hybrid'
  else if (hasStreamDep) processingModel = 'streaming'

  // orchestration
  let orchestration: DataPipelineMatch['partialConfig']['orchestration'] | undefined
  if (hasDbt || hasAirflowDag || hasPrefectFlow || hasDagsterJob) orchestration = 'dag-based'

  // dataQualityStrategy
  let dataQualityStrategy: DataPipelineMatch['partialConfig']['dataQualityStrategy'] | undefined
  if (hasDbt && ctx.dirExists('tests')) dataQualityStrategy = 'testing'
  else if (ctx.hasAnyDep(['great-expectations', 'pandera', 'soda-core'], 'py')) dataQualityStrategy = 'validation'
  else if (ctx.hasAnyDep(['datafold', 'elementary', 'monte-carlo-data'], 'py')) dataQualityStrategy = 'observability'

  // hasDataCatalog
  const hasDataCatalog = ctx.hasAnyDep(['datahub', 'openmetadata', 'amundsen'], 'py')

  const partialConfig: DataPipelineMatch['partialConfig'] = { processingModel }
  if (orchestration) partialConfig.orchestration = orchestration
  if (dataQualityStrategy) partialConfig.dataQualityStrategy = dataQualityStrategy
  if (hasDataCatalog) partialConfig.hasDataCatalog = true

  // Tier selection per spec Section 5.6:
  //   high: defining artifact (dbt_project.yml, dags/, pipelines/ with imports)
  //   medium: framework dep alone
  //   low: spark/beam/flink deps only (no orchestrator dep, no file structure)
  let confidence: 'high' | 'medium' | 'low'
  if (hasHighSignal) {
    confidence = 'high'
  } else if (hasFrameworkDep) {
    confidence = 'medium'
  } else {
    confidence = 'low'    // streaming/batch deps alone → low-tier surfacing
  }

  return {
    projectType: 'data-pipeline',
    confidence,
    partialConfig,
    evidence: ev,
  }
}
