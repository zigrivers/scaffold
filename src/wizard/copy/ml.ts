import type { MlCopy } from './types.js'

export const mlCopy: MlCopy = {
  projectPhase: {
    short: 'Which part of the ML lifecycle this project covers.',
    long: 'Training builds the model; inference serves predictions; both includes the full train-to-serve pipeline.',
    options: {
      training:  { label: 'Training',  short: 'Building and evaluating models — experiment-focused.' },
      inference: { label: 'Inference', short: 'Serving a trained model for predictions in production.' },
      both:      { label: 'Both',      short: 'Full pipeline from training through production serving.' },
    },
  },
  modelType: {
    short: 'The category of model being used.',
    long: 'Classical ML uses traditional algorithms; deep learning uses neural networks; '
      + 'LLM covers large language models and foundation models.',
    options: {
      classical: {
        label: 'Classical ML',
        short: 'Traditional algorithms like random forests, SVMs, or gradient boosting.',
      },
      'deep-learning': {
        label: 'Deep learning',
        short: 'Neural networks (CNNs, transformers, etc.) trained on large datasets.',
      },
      llm: {
        label: 'LLM',
        short: 'Large language models — fine-tuning or prompt-engineering foundation models.',
      },
    },
  },
  servingPattern: {
    short: 'How the model delivers predictions.',
    long: 'Batch scores datasets offline; realtime responds to individual requests; '
      + 'edge runs on-device for lowest latency.',
    options: {
      none:     { label: 'None',     short: 'No serving — training and evaluation only.' },
      batch:    { label: 'Batch',    short: 'Scores large datasets on a schedule (e.g. nightly predictions).' },
      realtime: { label: 'Realtime', short: 'Responds to individual requests via an API endpoint.' },
      edge:     { label: 'Edge',     short: 'Runs on-device or at the edge for ultra-low latency.' },
    },
  },
  hasExperimentTracking: {
    short: 'Track hyperparameters, metrics, and artifacts across training runs (e.g. MLflow, W&B).',
  },
}
