---
name: mcp-protocol-fundamentals
description: >-
  MCP client/server model, JSON-RPC 2.0 message format, capability negotiation, initialize handshake, connection
  lifecycle, and host/client/server roles
topics:
  - mcp
  - protocol
  - json-rpc
  - lifecycle
  - capability-negotiation
volatility: fast-moving
last-reviewed: 2026-06-14
version-pin: MCP spec 2025-11-25
sources:
  - url: https://modelcontextprotocol.io/specification/2025-11-25/
    hash: sha256:b602d146ce2921b135e0b0ff7e40297cd5f8cd80cae1a0ea453229be2e23bf81
    retrieved: 2026-06-14
  - url: https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
    hash: sha256:47ebbfb1444f76e6e204746ec03b0808d4bfc197e17c0ebcaffe548cd9f7aa17
    retrieved: 2026-06-14
  - url: https://www.jsonrpc.org/specification
    hash: sha256:8fe1edfdca511d309e712e47447457ea5159b728ec02071a84593aed692aefeb
    retrieved: 2026-06-14
---

The Model Context Protocol (MCP) is a JSON-RPC 2.0 based protocol that standardizes how LLM applications connect to external data sources and tools. Understanding the three-role model and the initialize handshake is prerequisite knowledge for every other MCP concept.

## Summary

MCP uses JSON-RPC 2.0 over a stateful transport. Three roles: **hosts** (LLM applications that initiate connections), **clients** (connectors within the host), and **servers** (services that expose capabilities). The connection lifecycle has three phases — initialization, operation, and shutdown — and always begins with an `initialize` request/response exchange followed by an `initialized` notification. Capabilities are declared during initialization; neither side may use a capability it did not declare.

## Deep Guidance

### Three-role model

The MCP architecture separates concerns into three distinct roles:

- **Host**: The LLM application (e.g., Claude Desktop, an IDE plugin) that orchestrates connections. The host owns the user interface and decides which servers to connect to.
- **Client**: A connector embedded in the host that manages a single server connection, handles the protocol lifecycle, and mediates capability negotiation.
- **Server**: An independent process or service that exposes tools, resources, or prompts. A server has no knowledge of other servers the client may be connected to.

One host typically manages multiple client-server pairs. Each server connection is isolated — servers do not communicate with each other.

### JSON-RPC 2.0 message format

All MCP messages are JSON-RPC 2.0 objects, UTF-8 encoded. Three message types:

**Requests** (expect a response):
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

**Responses** (reply to a request):
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "tools": [] }
}
```

**Notifications** (no response expected, no `id` field):
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

Error responses use a standard error object with `code` (integer) and `message` (string). Standard JSON-RPC error codes apply: `-32700` (parse error), `-32600` (invalid request), `-32601` (method not found), `-32602` (invalid params), `-32603` (internal error).

### The initialize handshake

The `initialize` request MUST be the first message sent by the client. It carries the protocol version the client supports (should be the latest), the client's capabilities, and client implementation information. The server responds with its own protocol version, capabilities, and an optional `instructions` string for the client.

After a successful response, the client MUST send an `initialized` notification (`notifications/initialized`) to signal readiness. Neither side should send substantive requests before this exchange completes — the only exception is ping messages.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {
      "roots": { "listChanged": true },
      "sampling": {},
      "elicitation": {}
    },
    "clientInfo": { "name": "MyClient", "version": "1.0.0" }
  }
}
```

The server responds with its capabilities. Example server capability declaration:
```json
{
  "protocolVersion": "2025-11-25",
  "capabilities": {
    "tools": { "listChanged": true },
    "resources": { "subscribe": true, "listChanged": true },
    "prompts": { "listChanged": true },
    "logging": {}
  },
  "serverInfo": { "name": "MyServer", "version": "1.0.0" }
}
```

### Version negotiation

The client sends the latest protocol version it supports. If the server supports it, it echoes the same version. If the server does not support the requested version, it responds with the latest version it does support. If the client cannot handle the server's version, it should disconnect. The currently active spec version is `2025-11-25`; clients sending this should receive it back from any compliant modern server.

### Capability negotiation

Capabilities declared during `initialize` govern which protocol features are available for the session. Key capability categories:

| Side   | Capability    | Enables                                         |
|--------|---------------|-------------------------------------------------|
| Server | `tools`       | `tools/list`, `tools/call`                      |
| Server | `resources`   | `resources/list`, `resources/read`, subscriptions |
| Server | `prompts`     | `prompts/list`, `prompts/get`                   |
| Server | `logging`     | Log message notifications to client             |
| Client | `sampling`    | Server-initiated LLM sampling requests          |
| Client | `roots`       | Server can query filesystem root boundaries     |
| Client | `elicitation` | Server can request additional info from user    |

Sub-capabilities like `listChanged` (support for list-change notifications) and `subscribe` (resources only, per-resource change subscriptions) are nested within their parent capability. A server that declares `tools: { listChanged: true }` MUST send `notifications/tools/list_changed` when its tool set changes.

### Lifecycle phases

1. **Initialization**: `initialize` request → server response → `initialized` notification. No tool/resource/prompt calls before this completes.
2. **Operation**: Normal message exchange. Both sides respect negotiated capabilities.
3. **Shutdown**: For stdio, the client closes the server's stdin and waits for the process to exit (sending `SIGTERM` then `SIGKILL` if needed). For HTTP, closing connections signals shutdown. No formal shutdown request message exists — transport-level signals are used.

### Timeouts and error handling

Implementations should set timeouts on all sent requests to prevent hung connections. When a timeout fires, send a `CancelledNotification` for the pending request ID. Progress notifications can optionally reset a timeout clock, but a hard maximum timeout should always be enforced regardless. Protocol version mismatch, required capability negotiation failure, and request timeouts are the standard error cases to handle at startup.
