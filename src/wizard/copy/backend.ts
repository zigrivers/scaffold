import type { BackendCopy } from './types.js'

export const backendCopy: BackendCopy = {
  apiStyle: {
    short: 'The primary protocol or interface style for the API.',
    long: 'Determines route generation, serialization format, and client-SDK shape.',
    options: {
      rest:    { label: 'REST',    short: 'Resource-oriented HTTP endpoints with JSON payloads.' },
      graphql: { label: 'GraphQL', short: 'Single endpoint with a typed query language.' },
      grpc:    { label: 'gRPC',    short: 'Binary protocol using Protocol Buffers — ideal for service-to-service.' },
      trpc:    { label: 'tRPC',    short: 'End-to-end typesafe RPC for TypeScript stacks.' },
      none:    { label: 'None',    short: 'No external API — background worker or internal service.' },
    },
  },
  dataStore: {
    short: 'The type(s) of database the service will use.',
    long: 'You can select more than one. Each choice adds connection setup and migration scaffolding.',
    options: {
      relational: { label: 'Relational',  short: 'SQL database (Postgres, MySQL, SQLite, etc.).' },
      document:   { label: 'Document',    short: 'Schema-flexible store (MongoDB, DynamoDB, etc.).' },
      'key-value':  { label: 'Key-value',   short: 'Fast lookup store (Redis, Memcached, etc.).' },
    },
  },
  authMechanism: {
    short: 'How callers authenticate with the service.',
    options: {
      none:    { label: 'None',    short: 'No auth — open access.' },
      jwt:     { label: 'JWT',     short: 'Stateless JSON Web Tokens verified per request.' },
      session: { label: 'Session', short: 'Server-side sessions with a session store.' },
      oauth:   { label: 'OAuth',   short: 'Delegated auth via an OAuth 2.0 provider.' },
      apikey:  { label: 'API key', short: 'Static keys passed in a header or query param.' },
    },
  },
  asyncMessaging: {
    short: 'How the service handles work outside the request cycle.',
    options: {
      none:          { label: 'None',          short: 'All work is synchronous within the request.' },
      queue:         { label: 'Queue',         short: 'Job queue for background task processing.' },
      'event-driven': { label: 'Event-driven', short: 'Publish/subscribe event bus for decoupled communication.' },
    },
  },
  deployTarget: {
    short: 'Where the service will be hosted.',
    options: {
      serverless:     { label: 'Serverless',    short: 'Functions that spin up per request.' },
      container:      { label: 'Container',     short: 'Docker container in a managed cluster.' },
      'long-running': { label: 'Long-running',  short: 'Traditional always-on server process.' },
    },
  },
  domain: {
    short: 'Optional domain-specific knowledge to include.',
    long: 'Adds a curated set of knowledge documents and prompt guidance tailored to a specific industry or problem space.',
    options: {
      none:    { label: 'None',    short: 'No domain-specific knowledge.' },
      fintech: { label: 'Fintech', short: 'Compliance, ledger design, broker integration, order lifecycle, risk management.' },
    },
  },
}
