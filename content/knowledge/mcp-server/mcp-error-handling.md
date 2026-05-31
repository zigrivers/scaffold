---
name: mcp-error-handling
description: MCP protocol errors (JSON-RPC error codes) vs tool execution errors (isError content), partial failures, error message design, and client recovery patterns
topics: [mcp, error-handling, json-rpc, tool-errors, protocol-errors]
volatility: evolving
last-reviewed: null
version-pin: 'MCP spec 2025-11-25'
sources:
  - url: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
  - url: https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
  - url: https://www.jsonrpc.org/specification
---

MCP has two distinct error channels. Mixing them up is one of the most common MCP server bugs: using protocol errors for domain failures causes the LLM to lose context about what went wrong; using isError for protocol failures breaks client error-handling logic.

## Summary

**Protocol errors** (JSON-RPC error responses) signal that a request could not be processed at all — unknown method, invalid parameters, server crash. Use standard JSON-RPC error codes. **Tool execution errors** (`isError: true` in the tool result) signal that the tool ran but the operation failed — API error, resource not found, business logic rejection. The LLM can read and react to tool errors; it cannot generally recover from protocol errors. Always prefer `isError: true` for domain-level failures that a well-behaved caller might encounter.

## Deep Guidance

### Protocol errors: JSON-RPC error responses

A protocol error is a JSON-RPC error response object. It replaces the `result` field entirely:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "error": {
    "code": -32602,
    "message": "Unknown tool: invalid_tool_name"
  }
}
```

Use protocol errors for:
- **Method not found** (`-32601`): the client called a method the server does not implement.
- **Invalid params** (`-32602`): structural/wire-level request problems that prevent dispatch entirely — unknown tool name in `tools/call`, unknown method, missing required prompt arguments to `prompts/get`, invalid resource URI in `resources/read`, malformed params shape at the JSON-RPC level. **Do NOT use `-32602` for a tool that dispatched successfully but whose arguments fail the tool's own `inputSchema` or business validation** — those are tool execution errors (see `isError` below).
- **Internal error** (`-32603`): unhandled exception or server bug. Include enough detail in `message` to diagnose, but sanitize sensitive data.
- **Parse error** (`-32700`): malformed JSON received. The SDK handles this automatically.
- **Invalid request** (`-32600`): request is not valid JSON-RPC 2.0 structure. Also SDK-handled.

Custom server-defined error codes MUST be in the JSON-RPC server-error range `-32099` to `-32000` (most-negative to least-negative). Standard resource error code: `-32002` (resource not found).

The `error` object MAY include a `data` field with additional structured context:
```json
{
  "code": -32602,
  "message": "Missing required argument",
  "data": { "argument": "location", "required": true }
}
```

### Tool execution errors: isError

When a tool runs but the operation it performs fails, return the failure as a normal result with `isError: true`:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Failed to fetch weather data: API returned 429 Too Many Requests. Rate limit resets at 14:00 UTC. Suggest retrying after that time."
      }
    ],
    "isError": true
  }
}
```

Use `isError: true` for:
- **Tool input/schema validation failures** — when a tool dispatches but its arguments fail the tool's own `inputSchema` or business validation rules (wrong value, out-of-range number, unsupported enum value, failed cross-field constraint). Per SEP-1303 (2025-11-25), these MUST be `isError: true` so the model can self-correct, NOT `-32602`.
- External API failures (HTTP 4xx/5xx from downstream services)
- Resource not found in a domain sense (file doesn't exist at the path the user specified)
- Business logic rejections (insufficient permissions in the target system, invalid state for the operation)
- Network timeouts when calling downstream services
- Partial failures where the overall result is a failure

**Why this distinction matters**: when `isError: true`, the result is a successful JSON-RPC response — the protocol layer worked correctly. The LLM receives the content and can read the error message, decide to retry with different parameters, inform the user, or take an alternative approach. Protocol errors, on the other hand, are invisible to the LLM in most client implementations — they're handled at the transport/client layer. The 2025-11-25 spec revision (SEP-1303) explicitly directs that tool input validation errors MUST be returned as Tool Execution Errors (`isError: true`) rather than Protocol Errors (`-32602`), specifically to enable model self-correction. This applies to any argument that dispatches to a real tool but fails schema/business validation once there.

### Error message quality

Both protocol error messages and `isError` content messages are read by either developers (protocol errors) or LLMs (isError). Write them to be actionable:

**For isError messages** (LLM-readable):
- State what failed specifically, not just "an error occurred".
- Include any relevant IDs, timestamps, or context the LLM can use.
- Suggest what to do next when recovery is possible.
- Include rate limit reset times, retry suggestions, or alternative approaches.

**For protocol error messages** (developer-readable):
- Name the specific field or method that caused the error.
- Quote the invalid value or describe the expected format.
- Avoid exposing internal file paths, stack traces, or secrets.

### Partial failures in multi-item operations

When a tool processes multiple items and some succeed while others fail:

**Option A (partial success)**: Return successful results and error descriptions in the `content` array, without setting `isError: true`. Use this when partial output is useful:
```json
{
  "content": [
    { "type": "text", "text": "Processed 3 of 5 items:\n✓ item1: success\n✓ item2: success\n✗ item3: rate limited\n✓ item4: success\n✗ item5: not found" }
  ]
}
```

**Option B (total failure)**: If no items succeeded or the partial result is not useful, set `isError: true` and describe the failure.

Never silently drop failures — always include what failed and why, even in partial success responses.

### Initialization and lifecycle errors

During the `initialize` handshake, return a protocol error if:
- The client requests a protocol version the server does not support (respond with your supported version per spec, or error if incompatible).
- Required capabilities cannot be negotiated.

After initialization, if a client calls a method whose capability was not declared (e.g., calls `tools/list` but the server did not declare `tools` capability), return `-32601` (method not found) or `-32602` (invalid params) to indicate the feature is not available.

### Client-side recovery patterns

MCP clients should handle these error patterns from servers:
- **Protocol error on tool call**: log the error, surface to user if relevant, do not retry automatically (likely a programming error).
- **`isError: true` on tool result**: pass the error content to the LLM — it can decide whether to retry, use a different tool, or report to the user.
- **Server disconnect / connection reset**: attempt reconnection and re-run the `initialize` handshake before resuming operations. Do not silently drop in-flight requests.
- **`notifications/tools/list_changed`**: re-issue `tools/list` before the next tool call to ensure the cached tool list is current.
