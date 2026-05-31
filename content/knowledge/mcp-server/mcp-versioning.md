---
name: mcp-versioning
description: MCP protocol version negotiation, MCP-Protocol-Version HTTP header, capability-based feature detection, server versioning strategy, and backwards compatibility
topics: [mcp, versioning, protocol-version, backwards-compatibility, capability-negotiation]
volatility: stable
last-reviewed: null
version-pin: 'MCP spec 2025-06-18'
sources:
  - url: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
  - url: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
---

MCP uses calendar-versioned protocol strings and capability-based feature detection. Understand both mechanisms to build servers that work with current clients and remain compatible as the spec evolves.

## Summary

Protocol versions are date strings (e.g., `2025-06-18`). The client proposes a version in `initialize`; the server echoes it or responds with its preferred version. If versions are incompatible, the client disconnects. HTTP clients MUST include `MCP-Protocol-Version: <negotiated-version>` on all subsequent requests. Feature availability is determined by capability negotiation, not version numbers alone. For your server's own versioning, use semantic versioning; keep the `serverInfo.version` field current and stable across protocol version changes.

## Deep Guidance

### Protocol version strings

MCP protocol versions are ISO 8601 calendar dates: `2025-06-18`, `2025-03-26`, `2024-11-05`. Current production version is `2025-06-18`. Always send the latest version you support in the `initialize` request — the server will downgrade if needed.

Version negotiation in the `initialize` handshake:
1. Client sends `"protocolVersion": "2025-06-18"` (its latest supported version).
2. If the server supports `2025-06-18`, it responds with `"protocolVersion": "2025-06-18"`.
3. If the server only supports `2025-03-26`, it responds with `"protocolVersion": "2025-03-26"`.
4. The client checks if it supports the server's response version. If not, it disconnects.

This ensures both sides agree on a common protocol dialect before any other messages are exchanged.

### MCP-Protocol-Version HTTP header

After initialization, HTTP clients MUST send `MCP-Protocol-Version: <negotiated-version>` on every subsequent request:

```
POST /mcp HTTP/1.1
Host: mcp.example.com
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-06-18
Mcp-Session-Id: abc123
```

Servers use this header to handle requests differently based on protocol version when supporting multiple versions simultaneously. If a server receives no `MCP-Protocol-Version` header, the spec says to assume `2025-03-26` for backwards compatibility. Servers MUST return `400 Bad Request` for unsupported or invalid version header values.

### Capability-based feature detection

Do not version-gate features solely on protocol version numbers. Use capability negotiation instead. A server supporting `2025-06-18` may not declare the `prompts` capability — that means prompts are not available regardless of protocol version.

The correct pattern for clients: check whether the server declared the capability before calling the corresponding methods. A client that calls `tools/list` without checking whether the server declared `tools` capability will receive a protocol error. The `initialize` response is the authoritative source of truth for what a server supports.

For servers: declare only the capabilities you actually implement. Over-declaring capabilities (e.g., declaring `resources: { subscribe: true }` but not handling `resources/subscribe`) will cause client errors and poor UX.

### Evolving your server's capabilities over versions

When you add a new capability to your server (e.g., adding resource support to a tools-only server):
- Add the capability to your `initialize` response immediately.
- The capability declaration is backwards compatible — old clients that don't use resources will simply not call `resources/list`.
- Do not bump your `serverInfo.version` for protocol-level changes; that field tracks your server's own software version.

When you remove a capability (uncommon but possible):
- Remove it from the `initialize` response.
- Any client that was relying on it will receive a protocol error when they call the now-unsupported method.
- Consider maintaining the capability with a deprecation notice in the server's `instructions` field before fully removing it.

### Server software versioning

The `serverInfo.version` in `initialize` is your server's semantic version (e.g., `"1.3.0"`), independent of the MCP protocol version. Follow semantic versioning:
- **Patch** (1.0.x): bug fixes, no schema changes, no capability changes.
- **Minor** (1.x.0): new tools/resources/prompts added, existing ones unchanged.
- **Major** (x.0.0): removed or renamed tools/resources/prompts, breaking schema changes.

Breaking changes in tool `inputSchema` or resource URI patterns are breaking changes for MCP clients that have auto-discovered and cached your server's schema. Treat them as major version bumps and communicate them in advance.

### Supporting multiple protocol versions simultaneously

If you need to serve both old (2024-11-05 HTTP+SSE) and new (2025-06-18 Streamable HTTP) clients:
- Keep the old SSE GET endpoint and POST endpoint running alongside the new MCP endpoint.
- Use the `MCP-Protocol-Version` header to route behavior within the Streamable HTTP path.
- Set a deprecation date for old transport support and communicate it in the `serverInfo` description or via documentation.

For servers that only need to support the latest spec, target `2025-06-18` and do not implement the deprecated HTTP+SSE transport. New clients target the current spec; support for the old transport is only needed if you have existing clients that have not yet migrated.

### Spec evolution cadence

The MCP spec has evolved on roughly a quarterly cadence: `2024-11-05` (initial), `2025-03-26` (Streamable HTTP introduction), `2025-06-18` (current). Major changes between versions: `2024-11-05 → 2025-03-26` introduced Streamable HTTP, deprecating HTTP+SSE. `2025-03-26 → 2025-06-18` added `outputSchema` for tools, `structuredContent`, audio content type, `title` fields, and the `elicitation` client capability. Watch the spec changelog (https://modelcontextprotocol.io) for new capabilities that may benefit your server.

### Backwards compatibility checklist

When releasing a new server version, verify these backwards compatibility invariants before shipping:

1. **No renamed tools**: renaming a tool (e.g., `search_files` → `find_files`) is a breaking change. Existing clients with auto-approved tool calls will fail silently. Use the old name as an alias or bump major version with advance notice.
2. **No removed required input fields**: removing a required field from `inputSchema` is non-breaking (callers can stop providing it); adding a new required field IS breaking (callers that don't provide it will receive validation errors).
3. **No resource URI pattern changes**: changing `file://{path}` to `file://workspace/{path}` breaks all existing resource subscriptions and saved URIs. Treat as a major version change.
4. **No prompt argument removals**: removing a declared prompt argument breaks clients that pass that argument.
5. **No capability downgrades without communication**: removing `resources: { subscribe: true }` when clients have active subscriptions causes silent failures.

For patch and minor releases, adding new optional tool parameters, new tools, new resources, or new prompts is always backwards compatible — existing callers ignore what they don't use.

### Version signaling in serverInfo

Use the `serverInfo.version` field as a machine-readable signal for clients that cache schemas:

```json
{
  "serverInfo": {
    "name": "my-mcp-server",
    "version": "2.1.0"
  }
}
```

Clients can cache tool/resource schemas keyed by `(serverInfo.name, serverInfo.version)`. When the server bumps its version, clients re-fetch schemas rather than serving stale cached definitions. This pattern is especially important for IDE integrations and agent frameworks that pre-load tool definitions at startup.
