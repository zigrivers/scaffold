---
name: mcp-deployment-patterns
description: MCP server deployment — local stdio subprocess, hosted container/serverless, lifecycle management, environment config, and operational patterns for each deployment model
topics: [mcp, deployment, stdio, container, serverless, operations]
volatility: evolving
last-reviewed: null
version-pin: null
sources:
  - url: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
  - url: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
  - url: https://modelcontextprotocol.io/docs/develop/connect-local-servers
---

MCP server deployment splits into two fundamentally different models: local subprocess (stdio) installed on the user's machine, and hosted service (container or serverless) running independently. Each has different lifecycle, configuration, update, and security characteristics.

## Summary

**Local stdio deployment**: server is installed as a CLI tool (npm package, Python package, binary) and launched as a subprocess by the client. Configuration lives in the client's server registry (e.g., `claude_desktop_config.json`). Updates require reinstalling the package. Lifecycle is tied to the client process. **Hosted deployment**: server runs as a persistent HTTP service, deployed to a container host or serverless platform. Clients connect via Streamable HTTP. Supports multiple concurrent users, centralized updates, and independent scaling. Use `stdio` for local developer tools; use hosted deployment for shared team/organization servers.

## Deep Guidance

### Local stdio deployment

The stdio model packages the MCP server as an installable CLI tool. The user installs it once; each MCP client registers it in its server configuration:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/alice/projects"],
      "env": {
        "NODE_ENV": "production"
      }
    },
    "mydb": {
      "command": "uvx",
      "args": ["mcp-server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://localhost/mydb"
      }
    }
  }
}
```

**Package distribution**: Publish to npm (`npx`-runnable) for TypeScript/Node.js servers; publish to PyPI (`uvx`-runnable) for Python servers. `npx -y` and `uvx` auto-install on first run, minimizing setup friction. For compiled binaries (Go, Rust), distribute via Homebrew, Winget, or direct download.

**Configuration**: Pass per-installation config via `env` (preferred) or `args`. Avoid config files with relative paths — the working directory is undefined when launched by a client (it could be `/` or the client's install directory). Always use absolute paths for any file references.

**Credentials**: Pass API keys and secrets via `env`, never via `args` (args appear in process listings). The client's server configuration file must be protected with appropriate file permissions.

**Lifecycle**: The client spawns the server on first use and keeps the process alive while connected. On shutdown, the client closes stdin and waits for the server to exit. Implement a clean shutdown handler: flush any pending state, close database connections, release file locks. In Node.js: listen for `SIGTERM`. In Python: implement `atexit` handlers or use FastMCP's lifecycle hooks. The server MUST exit cleanly after stdin is closed — a server that hangs will be forcibly killed.

**Updates**: Users update by reinstalling (`npm update -g my-server`, `uv tool upgrade my-server`). Pin your client in the MCP server registry to exact versions for stability-critical tools; use range specifiers for tools that benefit from automatic minor updates.

### Hosted container deployment

Containerized MCP servers run as long-lived HTTP services behind a container orchestrator (Docker Compose, Kubernetes, ECS, Cloud Run):

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

The server uses the Streamable HTTP transport:
```typescript
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import express from 'express'

const app = express()
app.use(express.json())

const transport = new StreamableHTTPServerTransport({ endpoint: '/mcp' })
await server.connect(transport)

app.all('/mcp', (req, res) => transport.handle(req, res))
app.listen(3000)
```

**Health checks**: expose a `/health` or `/ping` endpoint that returns 200 when the server is ready. Container orchestrators use this to route traffic only to healthy instances.

**Configuration**: inject secrets via environment variables (Kubernetes Secrets, AWS Parameter Store, Vault). Never bake credentials into container images.

**Graceful shutdown**: listen for `SIGTERM` (sent by orchestrators before `SIGKILL`). Drain in-flight requests, close upstream connections, then exit. Typical drain window: 10–30 seconds.

### Serverless deployment

Serverless (AWS Lambda, Google Cloud Functions, Vercel Edge) works for stateless MCP servers using Streamable HTTP. The primary constraint: serverless functions are stateless across invocations, so session state must be stored externally (Redis, DynamoDB) if you support `Mcp-Session-Id`.

For fully stateless servers (each request is independent, no subscriptions, no session-dependent state), serverless works well:
- Keep cold start time under 1 second (avoid large imports, use lazy initialization).
- Set function timeout generously (MCP tool calls that invoke slow APIs may need 30+ seconds).
- Disable or carefully manage resource subscriptions — subscription state cannot survive function restarts without external storage.

### Multi-user stdio: local multiplexing

Some deployment environments need multiple users to share a single MCP server installation without a hosted service. Options:
- **Per-user install**: each user installs and configures the server independently. Simplest, most isolated.
- **System-wide daemon**: run the MCP server as a system service over a Unix domain socket, with per-user authentication at the socket level. Complex but enables centralized configuration and single-instance resource use.

For most teams, a hosted HTTP deployment is simpler than system-level socket multiplexing.

### Choosing deployment model

| Requirement | Recommended model |
|-------------|------------------|
| Local file access (user's files) | Local stdio |
| Developer CLI wrapper | Local stdio |
| Shared team knowledge base | Hosted container |
| SaaS integration (multi-tenant) | Hosted container or serverless |
| Real-time resource subscriptions | Hosted container (stateful) |
| Zero-infrastructure setup | Local stdio |
| SOC2/compliance audit trail | Hosted container |
