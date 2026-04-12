import type { MlCopy } from './types.js'

export const mlCopy: MlCopy = {
  projectPhase: {
    short: 'TODO',
    options: {
      training:  { label: 'TODO', short: 'TODO' },
      inference: { label: 'TODO', short: 'TODO' },
      both:      { label: 'TODO', short: 'TODO' },
    },
  },
  modelType: {
    short: 'TODO',
    options: {
      classical:       { label: 'TODO', short: 'TODO' },
      'deep-learning': { label: 'TODO', short: 'TODO' },
      llm:             { label: 'TODO', short: 'TODO' },
    },
  },
  servingPattern: {
    short: 'TODO',
    options: {
      none:     { label: 'TODO', short: 'TODO' },
      batch:    { label: 'TODO', short: 'TODO' },
      realtime: { label: 'TODO', short: 'TODO' },
      edge:     { label: 'TODO', short: 'TODO' },
    },
  },
  hasExperimentTracking: {
    short: 'TODO',
  },
}
