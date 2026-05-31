import type { McpServerCopy } from './types.js'

export const mcpServerCopy: McpServerCopy = {
  language: {
    options: {
      'typescript': { label: 'TypeScript', short: 'Official @modelcontextprotocol/sdk.' },
      'python':     { label: 'Python',     short: 'Official MCP SDK / FastMCP.' },
    },
  },
  transport: {
    options: {
      'stdio': {
        label: 'stdio',
        short: 'Local subprocess over stdin/stdout (e.g. Claude Desktop).',
      },
      'streamable-http': { label: 'Streamable HTTP', short: 'Remote HTTP endpoint (current spec transport).' },
      'sse':             { label: 'SSE (legacy)',    short: 'Deprecated HTTP+SSE — prefer streamable-http.' },
    },
  },
  primitives: {
    options: {
      'tools':     { label: 'Tools',     short: 'Callable actions the model can invoke.' },
      'resources': { label: 'Resources', short: 'Readable data the model can fetch.' },
      'prompts':   { label: 'Prompts',   short: 'Reusable prompt templates.' },
    },
  },
  auth: {
    options: {
      'none':   { label: 'None',      short: 'No auth (typical for local stdio).' },
      'oauth':  { label: 'OAuth 2.1', short: 'MCP authorization spec for remote servers.' },
      'apikey': { label: 'API key',   short: 'Static key/header auth.' },
    },
  },
  deployment: {
    options: {
      'local':  { label: 'Local',  short: 'Runs on the user machine as a subprocess.' },
      'hosted': { label: 'Hosted', short: 'Deployed as a remote service.' },
    },
  },
  stateful: {},
}
