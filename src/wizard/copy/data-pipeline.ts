import type { DataPipelineCopy } from './types.js'

export const dataPipelineCopy: DataPipelineCopy = {
  processingModel: {
    short: 'How data moves through the pipeline.',
    long: 'Batch processes data in scheduled chunks; streaming handles records as they arrive; '
      + 'hybrid uses both depending on the stage.',
    options: {
      batch:     { label: 'Batch',     short: 'Processes data in scheduled chunks (hourly, daily, etc.).' },
      streaming: { label: 'Streaming', short: 'Processes records continuously as they arrive.' },
      hybrid:    { label: 'Hybrid',    short: 'Combines batch and streaming stages in the same pipeline.' },
    },
  },
  orchestration: {
    short: 'How pipeline steps are coordinated and triggered.',
    long: 'None is fine for a single script; DAG-based manages complex task dependencies; '
      + 'event-driven reacts to data arrivals; scheduled runs on a fixed timer.',
    options: {
      none: {
        label: 'None',
        short: 'Simple script or single-step pipeline — no orchestrator needed.',
      },
      'dag-based': {
        label: 'DAG-based',
        short: 'Directed acyclic graph of tasks with dependency tracking (e.g. Airflow, Dagster).',
      },
      'event-driven': {
        label: 'Event-driven',
        short: 'Steps trigger automatically when new data arrives.',
      },
      scheduled:      { label: 'Scheduled',    short: 'Runs on a fixed cron-like schedule.' },
    },
  },
  dataQualityStrategy: {
    short: 'How the pipeline validates and monitors data correctness.',
    long: 'Validation checks rows at ingestion; testing adds assertion suites; '
      + 'observability tracks drift and anomalies over time.',
    options: {
      none:          { label: 'None',          short: 'No automated data quality checks.' },
      validation:    { label: 'Validation',    short: 'Schema and constraint checks on incoming data.' },
      testing: {
        label: 'Testing',
        short: 'Assertion suites that run against data between stages (e.g. Great Expectations).',
      },
      observability: { label: 'Observability', short: 'Ongoing monitoring for drift, anomalies, and freshness.' },
    },
  },
  schemaManagement: {
    short: 'How data schemas are tracked and evolved.',
    long: 'A schema registry stores versioned schemas centrally; '
      + 'contracts define producer/consumer agreements.',
    options: {
      none:              { label: 'None',            short: 'Schemas are implicit or managed manually.' },
      'schema-registry': {
        label: 'Schema registry',
        short: 'Centralized store for versioned schemas (e.g. Confluent Schema Registry).',
      },
      contracts: {
        label: 'Contracts',
        short: 'Explicit producer/consumer schema agreements enforced at boundaries.',
      },
    },
  },
  hasDataCatalog: {
    short: 'Maintain a searchable catalog of datasets, lineage, and metadata.',
  },
}
