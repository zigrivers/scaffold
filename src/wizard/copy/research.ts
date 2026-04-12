import type { ResearchCopy } from './types.js'

export const researchCopy: ResearchCopy = {
  experimentDriver: {
    options: {
      'code-driven':     { label: 'Code-driven',     short: 'Modifies source files, executes them, reads output.' },
      'config-driven':   { label: 'Config-driven',   short: 'Generates config files consumed by a fixed runner.' },
      'api-driven':      { label: 'API-driven',      short: 'Calls an experiment API with parameters.' },
      'notebook-driven': { label: 'Notebook-driven', short: 'Generates or edits notebooks, executes cells.' },
    },
  },
  interactionMode: {
    options: {
      'autonomous':       { label: 'Autonomous',       short: 'Runs indefinitely until interrupted.' },
      'checkpoint-gated': { label: 'Checkpoint-gated', short: 'Pauses for human review at intervals.' },
      'human-guided':     { label: 'Human-guided',     short: 'Human decides what to try, agent executes.' },
    },
  },
  domain: {
    options: {
      'none':           { label: 'None',           short: 'No domain-specific knowledge.' },
      'quant-finance':  { label: 'Quant finance',  short: 'Trading strategies, backtesting, risk analysis.' },
      'ml-research':    { label: 'ML research',    short: 'Model architecture search, hyperparameter optimization.' },
      'simulation':     { label: 'Simulation',     short: 'Physics, materials, engineering parameter optimization.' },
    },
  },
  hasExperimentTracking: {},
}
