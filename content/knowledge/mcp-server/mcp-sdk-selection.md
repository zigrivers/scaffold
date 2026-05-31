---
name: mcp-sdk-selection
description: TypeScript @modelcontextprotocol/sdk vs Python SDK and FastMCP — trade-offs, SDK patterns, McpServer class, decorator-based registration, and when to use each
topics: [mcp, sdk, typescript, python, fastmcp]
volatility: fast-moving
last-reviewed: null
version-pin: 'MCP spec 2025-06-18; @modelcontextprotocol/sdk 1.x; mcp[cli] Python 1.2.0+'
sources:
  - url: https://modelcontextprotocol.io/docs/develop/build-server
  - url: https://github.com/modelcontextprotocol/typescript-sdk
  - url: https://github.com/modelcontextprotocol/python-sdk
---

Three SDK options cover the majority of MCP server implementations: the official TypeScript SDK (`@modelcontextprotocol/sdk`), the official Python SDK (`mcp`), and FastMCP (a higher-level Python wrapper bundled with the Python SDK). Choose based on your team's language, the server's complexity, and how much boilerplate you want to manage.

## Summary

**TypeScript SDK**: use for Node.js servers, teams with TypeScript expertise, or when integrating tightly with the JS/TS ecosystem. The `McpServer` high-level API covers most use cases; the lower-level `Server` class gives full control for edge cases. **Python SDK with FastMCP**: use for Python teams; FastMCP uses decorators and type hints to auto-generate tool/resource/prompt definitions, requiring minimal boilerplate. **FastMCP** is the recommended starting point for Python — it is bundled in the official `mcp[cli]` package as `mcp.server.fastmcp`. Both SDKs handle transport setup, JSON-RPC framing, and capability negotiation automatically.

## Deep Guidance

### TypeScript SDK (@modelcontextprotocol/sdk)

Install: `npm install @modelcontextprotocol/sdk`

The TypeScript SDK offers two server APIs:

**McpServer (high-level, recommended)**: Handles transport setup, capability negotiation, and message routing. Register tools, resources, and prompts with typed handler functions:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({
  name: 'my-server',
  version: '1.0.0',
})

server.tool('get_weather', 'Get current weather for a location', {
  location: z.string().describe('City name or zip code'),
}, async ({ location }) => {
  // fetch weather ...
  return {
    content: [{ type: 'text', text: `Weather for ${location}: Sunny, 72°F` }],
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
```

For Streamable HTTP, use `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js`.

**Server (low-level)**: Use when you need fine-grained control over request handling, custom middleware, or capabilities not yet abstracted by McpServer. Requires manually registering handlers for each method (`setRequestHandler`, `setNotificationHandler`). Useful for implementing servers that proxy or aggregate other MCP servers.

The TypeScript SDK uses Zod schemas for input validation — the `z.object({ ... })` schema passed to `server.tool()` becomes the JSON Schema `inputSchema` automatically.

### Python SDK with FastMCP

Install: `uv add "mcp[cli]"` (includes FastMCP) or `pip install "mcp[cli]"`

**FastMCP** is the high-level Python API. It derives tool definitions from function signatures, type hints, and docstrings — eliminating most boilerplate:

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("my-server")

@mcp.tool()
async def get_weather(location: str) -> str:
    """Get current weather for a location.

    Args:
        location: City name or zip code, e.g. 'New York' or '10001'
    """
    # fetch weather ...
    return f"Weather for {location}: Sunny, 72°F"

if __name__ == "__main__":
    mcp.run()  # defaults to stdio transport
```

FastMCP generates the JSON Schema `inputSchema` from the function's type annotations. The docstring becomes the tool's `description`. Argument descriptions come from the `Args:` section of the docstring. This convention-over-configuration approach makes FastMCP the fastest way to get a Python MCP server running.

For resources:
```python
@mcp.resource("file://config/{name}")
async def get_config(name: str) -> str:
    """Read a configuration file by name."""
    return Path(f"/etc/myapp/{name}.json").read_text()
```

For prompts:
```python
@mcp.prompt()
async def review_code(code: str, language: str = "Python") -> list[dict]:
    """Generate a code review prompt."""
    return [{"role": "user", "content": f"Review this {language} code:\n{code}"}]
```

The lower-level Python SDK (`mcp.server.Server`) exists for the same fine-grained use cases as the TypeScript `Server` class.

### SDK comparison

| Dimension | TypeScript SDK | Python + FastMCP |
|-----------|---------------|------------------|
| Boilerplate | Low (McpServer) | Minimal (decorators) |
| Type safety | Strong (Zod + TS) | Good (type hints) |
| Schema generation | Zod → JSON Schema | Type hints → JSON Schema |
| Ecosystem fit | Node.js, VS Code, Electron | Data science, scripting, ML |
| Async model | Promise/async-await | asyncio (FastMCP is async-first) |
| Deployment | npm package or compiled JS | uvx, pip, Docker |
| Community servers | Most reference servers in TS | Growing Python ecosystem |

### Choosing between SDKs

**Choose TypeScript** when: your team is primarily TypeScript/JavaScript, you're building a VS Code extension or Electron app that embeds an MCP server, you need deep integration with npm ecosystem tooling, or the official reference implementation is your guide.

**Choose Python + FastMCP** when: your team is primarily Python, you're wrapping existing Python services or data science tools, you want the fastest prototyping path, or you need to integrate with Python-specific libraries (pandas, SQLAlchemy, LangChain, etc.).

**Avoid rolling your own transport layer** regardless of language — the SDKs handle the nuances of JSON-RPC framing, keep-alive, session management, and error formatting correctly. The only reason to implement transport handling manually is when targeting a runtime or language for which no SDK exists yet (C#, Rust, Go all have community SDKs; check the MCP GitHub org before writing your own).

### Logging caution in Python stdio servers

FastMCP and the Python SDK's stdio transport are sensitive to stdout pollution. Never use `print()` in a stdio server without redirecting to stderr:

```python
import sys
# WRONG — corrupts protocol stream:
print("Debug: processing request")
# CORRECT:
print("Debug: processing request", file=sys.stderr)
```

Use Python's `logging` module configured with a `StreamHandler(sys.stderr)` — it defaults to stderr and is safe for stdio servers.
