import type { SignalContext } from './context.js'
import type { McpServerMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

const TS_SDK_DEPS = ['@modelcontextprotocol/sdk'] as const
const PY_MCP_DEPS = ['mcp', 'fastmcp'] as const

const TS_ENTRYPOINTS = [
  'src/index.ts', 'src/server.ts', 'index.ts', 'server.ts', 'src/mcp.ts',
  'src/mcp/index.ts', 'mcp.ts', 'src/cli.ts',
] as const
const PY_ENTRYPOINTS = [
  'server.py', 'main.py', 'src/server.py', 'app.py', 'mcp_server.py',
  'src/main.py', '__main__.py', 'src/__main__.py', 'app/main.py',
] as const

// eslint-disable-next-line max-len
const TS_REGISTER = /McpServer\s*\(|new Server\s*\(|\.registerTool\s*\(|\.registerResource\s*\(|\.registerPrompt\s*\(|setRequestHandler\s*\(/
const PY_REGISTER = /FastMCP\s*\(|@mcp\.tool|@mcp\.resource|@mcp\.prompt|@server\.call_tool|@server\.list_tools/

type Transport = NonNullable<McpServerMatch['partialConfig']['transport']>
type Primitive = 'tools' | 'resources' | 'prompts'

function inferTransport(text: string): Transport | undefined {
  if (/StreamableHTTP|streamableHttp|streamable_http/.test(text)) return 'streamable-http'
  if (/SSEServerTransport/.test(text)) return 'sse'
  if (/StdioServerTransport/.test(text)) return 'stdio'
  return undefined
}

function inferPrimitives(text: string): Primitive[] {
  const p: Primitive[] = []
  if (/registerTool|@mcp\.tool|list_tools|call_tool|\.tool\s*\(/.test(text)) p.push('tools')
  if (/registerResource|@mcp\.resource|list_resources|read_resource/.test(text)) p.push('resources')
  if (/registerPrompt|@mcp\.prompt|list_prompts|get_prompt/.test(text)) p.push('prompts')
  return p
}

export function detectMcpServer(ctx: SignalContext): McpServerMatch | null {
  const ev: DetectionEvidence[] = []

  const hasTsDep = ctx.hasAnyDep([...TS_SDK_DEPS], 'npm')
  const hasPyDep = ctx.hasAnyDep([...PY_MCP_DEPS], 'py')
  if (!hasTsDep && !hasPyDep) return null

  const language: 'typescript' | 'python' = hasTsDep ? 'typescript' : 'python'
  ev.push(evidence('mcp-sdk-dep', undefined, language === 'typescript' ? '@modelcontextprotocol/sdk' : 'mcp/fastmcp'))

  const entrypoints = language === 'typescript' ? TS_ENTRYPOINTS : PY_ENTRYPOINTS
  const marker = language === 'typescript' ? TS_REGISTER : PY_REGISTER

  let registeredText: string | undefined
  let registeredFile: string | undefined
  for (const f of entrypoints) {
    if (!ctx.hasFile(f)) continue
    const text = ctx.readFileText(f, 8192) ?? ''
    if (marker.test(text)) { registeredText = text; registeredFile = f; break }
  }

  const partialConfig: McpServerMatch['partialConfig'] = { language }
  let confidence: McpServerMatch['confidence']

  if (registeredText && registeredFile) {
    confidence = 'high'
    ev.push(evidence('mcp-registration', registeredFile, 'registers MCP primitives'))
    const transport = inferTransport(registeredText)
    if (transport) partialConfig.transport = transport
    const primitives = inferPrimitives(registeredText)
    if (primitives.length > 0) partialConfig.primitives = primitives
  } else {
    confidence = 'medium'
  }

  return { projectType: 'mcp-server', confidence, partialConfig, evidence: ev }
}
