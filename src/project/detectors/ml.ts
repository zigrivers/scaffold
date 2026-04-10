import type { SignalContext } from './context.js'
import type { MlMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

const ML_FRAMEWORK_DEPS = [
  'torch', 'pytorch-lightning', 'tensorflow', 'keras', 'jax',
  'scikit-learn', 'xgboost', 'lightgbm', 'catboost',
  'transformers', 'sentence-transformers',
]

export function detectMl(ctx: SignalContext): MlMatch | null {
  const ev: DetectionEvidence[] = []

  const hasMlDep = ctx.hasAnyDep(ML_FRAMEWORK_DEPS, 'py')

  // HuggingFace model card detection
  let isHfModelCard = false
  if (ctx.hasFile('README.md')) {
    const readme = ctx.readFileText('README.md', 8192) ?? ''
    if (readme.startsWith('---\n')) {
      const fmEnd = readme.indexOf('\n---\n', 4)
      if (fmEnd > 0) {
        const fm = readme.slice(4, fmEnd)
        if (/tags:[\s\S]*?(transformers|pytorch|tensorflow)/.test(fm) || /library_name:\s*transformers/.test(fm)) {
          isHfModelCard = true
          ev.push(evidence('huggingface-model-card', 'README.md'))
        }
      }
    }
  }

  // Supporting structure
  const hasModelsDir = ctx.dirExists('models')
  const hasNotebooks = ctx.rootEntries().some(f => f.endsWith('.ipynb'))
  const hasTrainPy = ctx.hasFile('train.py') || ctx.hasFile('training.py') || ctx.hasFile('scripts/train.py')
  const hasServePy = ctx.hasFile('serve.py') || ctx.hasFile('predict.py')
    || ctx.hasFile('serving/main.py') || ctx.hasFile('inference/main.py')
  const hasTrackingDep = ctx.hasAnyDep(['mlflow', 'wandb', 'neptune-client', 'clearml', 'dvc'], 'py')

  const hasStructure = hasModelsDir || hasNotebooks || hasTrainPy || hasServePy || hasTrackingDep

  if (!isHfModelCard && !hasMlDep && !hasNotebooks) return null

  // Low tier per spec Section 5.7: notebook-only repos with no framework dep
  if (!isHfModelCard && !hasMlDep && hasNotebooks) {
    return {
      projectType: 'ml',
      confidence: 'low',
      partialConfig: { projectPhase: 'training' },
      evidence: [evidence('notebooks-only', '*.ipynb')],
    }
  }

  if (!isHfModelCard && hasMlDep && !hasStructure) {
    // ML dep alone — medium tier
    return {
      projectType: 'ml',
      confidence: 'medium',
      partialConfig: { projectPhase: 'training' },  // best-guess; can be overridden
      evidence: [evidence('ml-framework-dep')],
    }
  }

  if (hasMlDep) ev.push(evidence('ml-framework-dep'))
  if (hasModelsDir) ev.push(evidence('models-dir', 'models/'))
  if (hasTrainPy) ev.push(evidence('train-script'))
  if (hasServePy) ev.push(evidence('serve-script'))
  if (hasTrackingDep) ev.push(evidence('experiment-tracking-dep'))

  // projectPhase
  let projectPhase: MlMatch['partialConfig']['projectPhase']
  if (isHfModelCard) {
    projectPhase = 'inference'   // model cards are published artifacts
  } else if (hasTrainPy && hasServePy) {
    projectPhase = 'both'
  } else if (hasServePy) {
    projectPhase = 'inference'
  } else {
    projectPhase = 'training'
  }

  // modelType
  let modelType: MlMatch['partialConfig']['modelType'] = 'deep-learning'
  const LLM_DEPS = [
    'transformers', 'sentence-transformers', 'openai',
    'anthropic', 'langchain', 'llama-index',
  ]
  if (isHfModelCard || ctx.hasAnyDep(LLM_DEPS, 'py')) {
    modelType = 'llm'
  } else if (ctx.hasAnyDep(['scikit-learn', 'xgboost', 'lightgbm', 'catboost'], 'py')
    && !ctx.hasAnyDep(['torch', 'tensorflow', 'jax', 'keras'], 'py')) {
    modelType = 'classical'
  }

  // servingPattern — CRITICAL: must pair with projectPhase
  let servingPattern: MlMatch['partialConfig']['servingPattern'] | undefined
  if (projectPhase === 'inference' || projectPhase === 'both') {
    if (ctx.hasAnyDep(['torchserve', 'bentoml', 'ray[serve]', 'seldon-core'], 'py')) {
      servingPattern = 'realtime'
    } else if (ctx.hasAnyDep(['onnxruntime-web', 'onnxruntime-mobile', 'coreml'], 'py')) {
      servingPattern = 'edge'
    } else {
      // Mandatory fallback — schema cross-field requires non-'none' for inference/both
      servingPattern = 'realtime'
    }
  }
  // training: omit servingPattern; Zod default 'none' satisfies cross-field

  const partialConfig: MlMatch['partialConfig'] = { projectPhase, modelType }
  if (servingPattern) partialConfig.servingPattern = servingPattern
  if (hasTrackingDep) partialConfig.hasExperimentTracking = true

  return { projectType: 'ml', confidence: 'high', partialConfig, evidence: ev }
}
