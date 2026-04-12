import type { SignalContext } from './context.js'
import type { ResearchMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'
import { ML_FRAMEWORK_DEPS, EXPERIMENT_TRACKING_DEPS } from './shared-signals.js'

const TRADING_DEPS = ['backtrader', 'zipline', 'vectorbt', 'ccxt', 'ta-lib'] as const
const OPTIMIZATION_DEPS = ['optuna', 'hyperopt', 'pymoo', 'nevergrad'] as const
const SIMULATION_DEPS = ['openfoam', 'fenics', 'simpy', 'pyomo', 'deap'] as const
const LLM_SDK_DEPS = ['openai', 'anthropic', 'langchain'] as const
const WEB_FRAMEWORK_DEPS = ['express', 'fastapi', 'django', 'flask', 'hono', 'nestjs'] as const

const AUTORESEARCH_MARKERS = /\b(loop|iterate|experiment|run|evaluate)\b/i
const TRADING_IMPORTS = /from backtrader|import backtrader|from zipline|import zipline|from vectorbt/

type ExperimentDriver = ResearchMatch['partialConfig']['experimentDriver']
type Domain = NonNullable<ResearchMatch['partialConfig']['domain']>

export function detectResearch(ctx: SignalContext): ResearchMatch | null {
  const ev: DetectionEvidence[] = []

  // Negative gate: if ML framework deps are present, this is an ML project, not research
  const hasMlDep = ctx.hasAnyDep([...ML_FRAMEWORK_DEPS], 'py')
  if (hasMlDep) return null

  // Dep checks
  const hasTradingDep = ctx.hasAnyDep([...TRADING_DEPS], 'py')
  const hasOptDep = ctx.hasAnyDep([...OPTIMIZATION_DEPS], 'py')
  const hasSimDep = ctx.hasAnyDep([...SIMULATION_DEPS], 'py')
  const hasLlmDep = ctx.hasAnyDep([...LLM_SDK_DEPS])
  const hasWebDep = ctx.hasAnyDep([...WEB_FRAMEWORK_DEPS])
  const hasTrackingDep = ctx.hasAnyDep([...EXPERIMENT_TRACKING_DEPS], 'py')
  const hasTrainPy = ctx.hasFile('train.py') || ctx.hasFile('training.py') || ctx.hasFile('scripts/train.py')

  // Structure checks
  const hasExperimentsDir = ctx.dirExists('experiments')
  const hasResultsDir = ctx.dirExists('results')
  const hasEvalsDir = ctx.dirExists('evals')
  const hasNotebooks = ctx.rootEntries().some(f => f.endsWith('.ipynb'))
  const hasExperimentPy = ctx.hasFile('experiment.py')

  // Academic markers — check root entry extensions + well-known filenames + paper/ dir
  const hasAcademic = ctx.rootEntries().some(f => f.endsWith('.tex') || f.endsWith('.bib'))
    || ctx.hasFile('paper.tex') || ctx.hasFile('main.tex')
    || ctx.hasFile('references.bib') || ctx.hasFile('paper.bib')
    || ctx.dirExists('paper')

  let confidence: ResearchMatch['confidence'] | undefined
  let driver: ExperimentDriver | undefined
  let domain: Domain | undefined
  let interactionMode: ResearchMatch['partialConfig']['interactionMode'] | undefined
  let backtestMatched = false

  // --- HIGH: autoresearch pattern ---
  if (ctx.hasFile('program.md') && ctx.hasFile('results.tsv')) {
    const content = ctx.readFileText('program.md', 512) ?? ''
    if (AUTORESEARCH_MARKERS.test(content)) {
      confidence = 'high'
      driver = 'code-driven'
      interactionMode = 'autonomous'
      ev.push(evidence('autoresearch-pattern', 'program.md', 'experiment markers found'))
      ev.push(evidence('autoresearch-results', 'results.tsv'))
    }
  }

  // --- HIGH: trading backtest ---
  if (!confidence && (ctx.hasFile('backtest.py') || ctx.hasFile('strategy.py')) && hasTradingDep) {
    const file = ctx.hasFile('backtest.py') ? 'backtest.py' : 'strategy.py'
    const content = ctx.readFileText(file) ?? ''
    if (TRADING_IMPORTS.test(content)) {
      confidence = 'high'
      driver = 'code-driven'
      domain = 'quant-finance'
      backtestMatched = true
      ev.push(evidence('trading-backtest', file, 'trading import verified'))
    }
  }

  // --- MEDIUM: optimization + experiments (no ML) ---
  if (!confidence && hasOptDep && (hasExperimentsDir || hasResultsDir)) {
    confidence = 'medium'
    driver = 'config-driven'
    ev.push(evidence('optimization-deps'))
    ev.push(evidence('experiment-structure', hasExperimentsDir ? 'experiments/' : 'results/'))
  }

  // --- MEDIUM: trading deps alone (no web, no backtest already matched) ---
  if (!confidence && hasTradingDep && !hasWebDep && !backtestMatched) {
    confidence = 'medium'
    driver = 'code-driven'
    domain = 'quant-finance'
    ev.push(evidence('trading-deps'))
  }

  // --- MEDIUM: simulation deps + experiment structure ---
  if (!confidence && hasSimDep && (hasExperimentsDir || hasResultsDir)) {
    confidence = 'medium'
    driver = 'code-driven'
    domain = 'simulation'
    ev.push(evidence('simulation-deps'))
    ev.push(evidence('experiment-structure', hasExperimentsDir ? 'experiments/' : 'results/'))
  }

  // --- MEDIUM: LLM SDK + eval structure (no train.py) ---
  if (!confidence && hasLlmDep && hasEvalsDir && !hasTrainPy) {
    confidence = 'medium'
    driver = 'api-driven'
    ev.push(evidence('llm-sdk-deps'))
    ev.push(evidence('evals-dir', 'evals/'))
  }

  // --- Academic upgrade: medium signals + academic markers → high ---
  if (confidence === 'medium' && hasAcademic) {
    confidence = 'high'
    ev.push(evidence('academic-markers'))
  }

  // --- LOW: notebooks + optimization deps ---
  if (!confidence && hasNotebooks && hasOptDep) {
    confidence = 'low'
    driver = 'notebook-driven'
    ev.push(evidence('notebooks-optimization'))
  }

  // --- LOW: experiment.py or experiments/ dir alone ---
  if (!confidence && (hasExperimentPy || hasExperimentsDir)) {
    confidence = 'low'
    driver = 'code-driven'
    if (hasExperimentPy) ev.push(evidence('experiment-script', 'experiment.py'))
    if (hasExperimentsDir) ev.push(evidence('experiments-dir', 'experiments/'))
  }

  if (!confidence || !driver) return null

  const partialConfig: ResearchMatch['partialConfig'] = { experimentDriver: driver }
  if (interactionMode) partialConfig.interactionMode = interactionMode
  if (domain) partialConfig.domain = domain
  if (hasTrackingDep) partialConfig.hasExperimentTracking = true

  return { projectType: 'research', confidence, partialConfig, evidence: ev }
}
