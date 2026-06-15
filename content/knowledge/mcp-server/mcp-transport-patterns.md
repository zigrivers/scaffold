---
name: mcp-transport-patterns
description: >-
  MCP stdio and Streamable HTTP transports, deprecated HTTP+SSE migration, session management, MCP-Protocol-Version
  header, and transport selection guidance
topics:
  - mcp
  - transport
  - stdio
  - http
  - sse
  - session-management
volatility: fast-moving
last-reviewed: 2026-06-15
version-pin: MCP spec 2025-11-25
sources:
  - url: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
    hash: sha256:44526a7f05567e3fb8d8928ffbd2794a5bdb4661f1030e3f00be99a806163d08
    retrieved: 2026-06-15
---

MCP defines two standard transports: **stdio** (local subprocess) and **Streamable HTTP** (network-accessible). The old HTTP+SSE transport from spec version 2024-11-05 is deprecated. Transport choice is a deployment decision that shapes your server's authentication model, scalability, and operational complexity.

## Summary

**stdio**: client launches server as subprocess, communicates over stdin/stdout, logs go to stderr. Best for local tools installed alongside the client. **Streamable HTTP**: server runs independently at an HTTP endpoint, clients POST JSON-RPC messages, server optionally streams responses via SSE. Best for shared/remote servers. The deprecated HTTP+SSE transport used separate GET (SSE stream) and POST (messages) endpoints — migrate to Streamable HTTP. The `MCP-Protocol-Version` header MUST be sent on all HTTP requests after initialization.

## Deep Guidance

### stdio transport

In the stdio transport, the MCP client launches the server as a child process. All JSON-RPC messages flow over the process's standard streams:

- Client writes JSON-RPC messages to server's **stdin**, one message per line, no embedded newlines.
- Server writes JSON-RPC messages to its **stdout**, one message per line, no embedded newlines.
- Server writes diagnostic/logging output to **stderr** only — stdout is reserved strictly for JSON-RPC protocol messages.

```
Client Process
  ├── spawns → Server Process
  │                ├── stdin  ← JSON-RPC messages from client
  │                ├── stdout → JSON-RPC messages to client
  │                └── stderr → logs (captured by client, not protocol)
```

**Key rules for stdio servers:**
- NEVER write anything to stdout except valid JSON-RPC messages. Any stray output (debug prints, startup banners, library log messages) will corrupt the protocol stream and cause parse errors. This is the most common stdio bug.
- Redirect all application logging to stderr (or a file). In Python: `print("msg", file=sys.stderr)`. In Node.js: `process.stderr.write(...)`. In Go: `fmt.Fprintln(os.Stderr, ...)`.
- The server process's working directory may be undefined (could be `/` on macOS) when launched by a client. Use absolute paths for any file access or configuration loading.

Shutdown: the client closes the server's stdin stream, waits for the process to exit, then sends SIGTERM after a timeout, then SIGKILL.

### Streamable HTTP transport

The Streamable HTTP transport runs the server as an independent HTTP service. A single MCP endpoint (e.g., `https://example.com/mcp`) handles both GET and POST:

**Client → Server (POST)**: Every JSON-RPC message from client to server is a new HTTP POST. The client MUST include `Accept: application/json, text/event-stream` headers. The server responds either with `Content-Type: application/json` (single response) or `Content-Type: text/event-stream` (SSE stream for streaming/multiple messages).

**Server → Client (GET)**: The client MAY open a GET SSE stream to receive server-initiated messages (notifications, server-to-client requests) without first sending a POST. The server returns `Content-Type: text/event-stream` or `405 Method Not Allowed` if not supported.

**Session management**: The server MAY assign a session ID in the `Mcp-Session-Id` response header during initialization. If issued, the client MUST include `Mcp-Session-Id: <id>` on all subsequent requests. Sessions are terminated via HTTP DELETE to the MCP endpoint with the session ID header.

**Security requirements**:
- Validate the `Origin` header on all incoming connections to prevent DNS rebinding attacks.
- Bind to localhost only (127.0.0.1) when running locally; never 0.0.0.0 for local-only servers.
- Implement authentication for all connections (see `mcp-authentication.md`).

### MCP-Protocol-Version header

After initialization, HTTP clients MUST include `MCP-Protocol-Version: <negotiated-version>` on all requests. Example: `MCP-Protocol-Version: 2025-11-25`. If a server receives no version header, it SHOULD assume `2025-03-26` for backwards compatibility. Servers MUST reject requests with unsupported versions with `400 Bad Request`. As of 2025-11-25, servers MUST also respond with HTTP 403 Forbidden when an incoming connection carries an invalid `Origin` header (previously the response code was not specified).

### Deprecated HTTP+SSE transport

The HTTP+SSE transport (from spec version 2024-11-05) used two separate endpoints:
- A GET endpoint that opened a persistent SSE stream, returning an `endpoint` event with a POST URL.
- A POST endpoint for client messages.

This is **deprecated** as of spec 2025-03-26 and replaced by Streamable HTTP. For backwards compatibility:

**Servers** wanting to support both old and new clients: keep the old SSE GET endpoint and old POST endpoint running alongside the new Streamable HTTP endpoint.

**Clients** detecting transport version: POST an `initialize` request. If the server responds with success, it supports Streamable HTTP. If the server returns 4xx (405 or 404), issue a GET instead — if it returns an SSE stream with an `endpoint` event, it's an old HTTP+SSE server. Support both paths during a migration window.

### Transport selection guidance

| Scenario | Recommended transport |
|----------|----------------------|
| Local tool (installed alongside client) | stdio |
| Developer machine tool (file access, CLI wrappers) | stdio |
| Shared team server (hosted, multi-user) | Streamable HTTP |
| Cloud-hosted integration (SaaS backend) | Streamable HTTP |
| Containerized/serverless deployment | Streamable HTTP |
| Mobile or browser-based host | Streamable HTTP |

**Choose stdio when**: the server must run on the user's machine, the tool accesses local files or processes, you want zero-config deployment (install package, configure path), or you want the simplest possible security model (OS process isolation, no network auth needed).

**Choose Streamable HTTP when**: the server is shared across multiple clients or users, you need centralized deployment and updates, the server integrates with remote APIs or databases, or you need to run the server independently of any specific client lifecycle.

Custom transports are allowed by the spec — any bidirectional communication channel that preserves JSON-RPC message format and lifecycle requirements can be used. Document custom transports thoroughly.

### Connection lifecycle and error handling

Both transports follow the same JSON-RPC 2.0 lifecycle:

1. **Initialize**: client sends `initialize` request with protocol version and capabilities; server responds with its own capabilities.
2. **Initialized notification**: client sends `notifications/initialized` to signal readiness.
3. **Normal operation**: bidirectional request/response and notifications.
4. **Shutdown**: client sends `notifications/cancelled` for in-flight requests, then closes the transport.

**Common transport errors and remediation**:

| Error | Cause | Fix |
|-------|-------|-----|
| Parse errors on stdio | Non-JSON written to stdout (e.g., debug prints) | Redirect all non-protocol output to stderr |
| `400 Bad Request` on HTTP | Missing or invalid `MCP-Protocol-Version` header | Ensure client sends the header after initialization |
| `404` on HTTP | Client using old HTTP+SSE transport path | Detect and support both paths during migration |
| Session `410 Gone` | Session expired or server restarted | Client should re-initialize and re-establish session |

### Testing transport behavior

```typescript
// Test stdio transport with in-process transport for unit tests
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "test-client", version: "1.0.0" });
await client.connect(clientTransport);
// server connects to serverTransport in parallel
```

For HTTP transport integration tests, use a real HTTP server bound to a random port (`listen(0)`) and tear it down after each test. Never share server state between tests.
