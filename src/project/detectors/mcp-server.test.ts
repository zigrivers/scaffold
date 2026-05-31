import { describe, it, expect } from 'vitest'
import { createFakeSignalContext } from './context.js'
import { detectMcpServer } from './mcp-server.js'

describe('detectMcpServer', () => {
  it('high: TS SDK dep + entrypoint registering a tool', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 's', dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } },
      files: {
        'src/index.ts': 'import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"\n'
          + 'const server = new McpServer({ name: "s", version: "1" })\n'
          + 'server.registerTool("greet", {}, async () => ({ content: [] }))\n',
      },
    })
    const m = detectMcpServer(ctx)
    expect(m).not.toBeNull()
    expect(m!.projectType).toBe('mcp-server')
    expect(m!.confidence).toBe('high')
    expect(m!.partialConfig.language).toBe('typescript')
    expect(m!.partialConfig.primitives).toContain('tools')
  })

  it('high: Python fastmcp dep + FastMCP entrypoint', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 's', dependencies: ['fastmcp'] } },
      files: { 'server.py': 'from fastmcp import FastMCP\nmcp = FastMCP("s")\n@mcp.tool\ndef greet(): ...\n' },
    })
    const m = detectMcpServer(ctx)
    expect(m).not.toBeNull()
    expect(m!.confidence).toBe('high')
    expect(m!.partialConfig.language).toBe('python')
  })

  it('medium: SDK dep present but no registration entrypoint (could be a client)', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'c', dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } },
    })
    const m = detectMcpServer(ctx)
    expect(m).not.toBeNull()
    expect(m!.confidence).toBe('medium')
    expect(m!.partialConfig.language).toBe('typescript')
  })

  it('infers streamable-http transport from entrypoint text', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 's', dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } },
      files: {
        'src/server.ts': [
          'import { StreamableHTTPServerTransport } from',
          ' "@modelcontextprotocol/sdk/server/streamableHttp.js"',
          '\nconst server = new McpServer({})',
          '\nserver.registerTool("x", {}, async () => ({content:[]}))\n',
        ].join(''),
      },
    })
    const m = detectMcpServer(ctx)
    expect(m!.partialConfig.transport).toBe('streamable-http')
    expect(m!.confidence).toBe('high')
  })

  it('null: no MCP deps and no markers', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'x', dependencies: { express: '^4' } },
    })
    expect(detectMcpServer(ctx)).toBeNull()
  })

  it('high: TS SDK dep + expanded entrypoint src/mcp/index.ts', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 's', dependencies: { '@modelcontextprotocol/sdk': '^1.0.0' } },
      files: {
        'src/mcp/index.ts': 'const s = new McpServer({})\ns.registerTool("x", {}, async () => ({content:[]}))\n',
      },
    })
    const m = detectMcpServer(ctx)
    expect(m).not.toBeNull()
    expect(m!.confidence).toBe('high')
  })

  it('high: Python mcp dep + __main__.py entrypoint', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 's', dependencies: ['mcp'] } },
      files: {
        '__main__.py': 'from mcp.server import Server\nserver = Server("s")\n'
          + '@server.list_tools()\nasync def list(): ...\n',
      },
    })
    const m = detectMcpServer(ctx)
    expect(m).not.toBeNull()
    expect(m!.confidence).toBe('high')
    expect(m!.partialConfig.language).toBe('python')
  })

  it('high: Python fastmcp dep + custom variable name @app.tool', () => {
    const ctx = createFakeSignalContext({
      pyprojectToml: { project: { name: 's', dependencies: ['fastmcp'] } },
      files: {
        'server.py': 'from fastmcp import FastMCP\napp = FastMCP("s")\n@app.tool\ndef greet(): ...\n',
      },
    })
    const m = detectMcpServer(ctx)
    expect(m).not.toBeNull()
    expect(m!.confidence).toBe('high')
    expect(m!.partialConfig.language).toBe('python')
    expect(m!.partialConfig.primitives).toContain('tools')
  })
})
