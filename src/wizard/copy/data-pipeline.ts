import type { DataPipelineCopy } from './types.js'

export const dataPipelineCopy: DataPipelineCopy = {
  processingModel: {
    short: 'TODO',
    options: {
      batch:     { label: 'TODO', short: 'TODO' },
      streaming: { label: 'TODO', short: 'TODO' },
      hybrid:    { label: 'TODO', short: 'TODO' },
    },
  },
  orchestration: {
    short: 'TODO',
    options: {
      none:          { label: 'TODO', short: 'TODO' },
      'dag-based':   { label: 'TODO', short: 'TODO' },
      'event-driven': { label: 'TODO', short: 'TODO' },
      scheduled:     { label: 'TODO', short: 'TODO' },
    },
  },
  dataQualityStrategy: {
    short: 'TODO',
    options: {
      none:          { label: 'TODO', short: 'TODO' },
      validation:    { label: 'TODO', short: 'TODO' },
      testing:       { label: 'TODO', short: 'TODO' },
      observability: { label: 'TODO', short: 'TODO' },
    },
  },
  schemaManagement: {
    short: 'TODO',
    options: {
      none:              { label: 'TODO', short: 'TODO' },
      'schema-registry': { label: 'TODO', short: 'TODO' },
      contracts:         { label: 'TODO', short: 'TODO' },
    },
  },
  hasDataCatalog: {
    short: 'TODO',
  },
}
