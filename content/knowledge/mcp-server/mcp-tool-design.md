---
name: mcp-tool-design
description: MCP tool naming conventions, JSON Schema inputSchema design, idempotency, output content blocks, isError for tool-level errors, outputSchema, and annotations
topics: [mcp, tools, json-schema, tool-design, error-handling]
volatility: evolving
last-reviewed: null
version-pin: 'MCP spec 2025-11-25'
sources:
  - url: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
  - url: https://json-schema.org/draft/2020-12/schema
---

Tools are the primary mechanism by which MCP servers expose executable capabilities to LLM clients. A well-designed tool is discoverable, predictable, safe to retry, and explicit about its failure modes.

## Summary

Each MCP tool has a `name`, optional `description`, a JSON Schema `inputSchema`, and an optional `outputSchema`. Tool calls use `tools/call`; results carry a `content` array of typed content blocks and an optional `isError` boolean. Use `isError: true` to report expected tool-level failures (API errors, invalid business inputs) as structured results rather than JSON-RPC protocol errors. Tools should be idempotent where possible, and side-effect-bearing tools should be explicitly documented as such via annotations.

## Deep Guidance

### Tool naming conventions

Tool names must be unique within a server. Use `snake_case` for tool names — the 2025-11-25 spec revision (SEP-986) formally reinforces this convention. Names should be short verb-noun phrases that describe what the tool does: `get_weather`, `create_issue`, `search_documents`. Avoid generic names like `execute` or `run` that give the LLM no signal about the tool's purpose.

The `description` field is critical — it is the primary signal the LLM uses to decide when to invoke a tool. Be specific about what the tool does, what inputs it expects, and when it should be used. A poor description leads to misuse. A good description includes the domain, the action, any preconditions, and the output shape in plain English.

### JSON Schema inputSchema

Every tool MUST declare an `inputSchema` as a valid JSON Schema object. MCP uses **JSON Schema 2020-12** as its default schema dialect (established in the 2025-11-25 revision). The schema serves two purposes: runtime validation and LLM guidance. Best practices:

- Use `type: "object"` at the root with named `properties`.
- List required parameters in the `required` array. Do not list optional parameters there.
- Add a `description` to every property — the LLM reads these to understand each argument.
- Use the most specific type possible: prefer `"type": "integer"` over `"type": "number"` when only integers make sense.
- Use `enum` for fixed sets of valid values.
- Use `format` hints (`"format": "uri"`, `"format": "date"`) where applicable.

Example of a well-specified inputSchema:
```json
{
  "type": "object",
  "properties": {
    "repo": {
      "type": "string",
      "description": "GitHub repository in owner/name format, e.g. 'acme/backend'"
    },
    "state": {
      "type": "string",
      "enum": ["open", "closed", "all"],
      "description": "Filter issues by state. Defaults to 'open'."
    },
    "limit": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100,
      "description": "Maximum number of issues to return. Defaults to 20."
    }
  },
  "required": ["repo"]
}
```

Always validate inputs against the inputSchema in the server implementation before executing any side effects. The spec requires it, and doing so prevents malformed or injected arguments from reaching downstream systems.

### Idempotency and side effects

MCP tools should be designed with idempotency in mind wherever the underlying operation supports it. Read-only tools (queries, lookups) are naturally idempotent and carry the lowest risk. Mutating tools (writes, deletes, API calls with side effects) should document their non-idempotency explicitly.

The `annotations` field on a tool definition carries hints for clients:

```json
{
  "annotations": {
    "readOnlyHint": true,
    "idempotentHint": true,
    "openWorldHint": false
  }
}
```

`readOnlyHint: true` means the tool does not modify any state. `idempotentHint: true` means calling it multiple times with the same arguments produces the same result. `openWorldHint: true` means the tool interacts with external systems beyond the local environment. Clients treat these as untrusted hints — they assist the LLM in deciding whether user confirmation is needed, but do not replace host-side confirmation flows for destructive operations.

### Output content blocks

Tool results return a `content` array containing one or more typed content blocks:

- **TextContent**: `{ "type": "text", "text": "..." }` — the most common type; use for plain text, JSON strings, or structured prose.
- **ImageContent**: `{ "type": "image", "data": "<base64>", "mimeType": "image/png" }` — for screenshots, charts, or generated images.
- **AudioContent**: `{ "type": "audio", "data": "<base64>", "mimeType": "audio/wav" }` — for audio responses.
- **ResourceLink**: `{ "type": "resource_link", "uri": "...", "name": "...", "mimeType": "..." }` — reference a resource the client can fetch separately.
- **EmbeddedResource**: `{ "type": "resource", "resource": { "uri": "...", "mimeType": "...", "text": "..." } }` — inline resource content.

Tools can return multiple content blocks in one result (e.g., a text summary plus an image). The `content` array is always present, even for empty results — return an empty array rather than null.

If the tool declares an `outputSchema`, it MUST also provide structured content in a `structuredContent` field matching that schema, and SHOULD also include the serialized JSON as a TextContent block for backwards compatibility.

### isError: tool errors vs protocol errors

MCP distinguishes two error reporting paths:

**Protocol errors** (JSON-RPC errors) are for structural/wire-level failures where the call could not be dispatched at all: unknown tool name in `tools/call`, malformed JSON-RPC structure, server crashes. These return a JSON-RPC error response with a negative integer `code`. The LLM cannot generally recover from protocol errors.

**Tool execution errors** use `isError: true` in the result. Use this for any failure that occurs after the tool dispatches — including tool `inputSchema` validation failures, business validation rejections, API rate limits, resource not found, and network timeouts. Per the 2025-11-25 spec (SEP-1303), tool input validation failures MUST use `isError: true` (not `-32602`) so the model can read the error and self-correct. Return `isError: true` with a descriptive TextContent explaining what went wrong and, when possible, what the caller should do differently.

```json
{
  "content": [
    {
      "type": "text",
      "text": "GitHub API rate limit exceeded. Resets at 2025-06-18T14:00:00Z. Retry after that time."
    }
  ],
  "isError": true
}
```

Never raise a JSON-RPC protocol error for domain-level failures that a well-behaved caller might encounter. Reserve protocol errors for structural dispatch failures (wrong method name, unknown tool). When in doubt, use `isError: true` — it keeps the LLM in the loop about what went wrong.

### Partial failures

When a tool processes multiple items and some fail, report partial results in the `content` array with a summary, and set `isError: true` only if the overall operation should be treated as failed. For best-effort multi-item tools, return results for successful items and error descriptions for failed ones, without setting `isError: true`, so the LLM can use the partial output.

### List change notifications

If the server's tool set can change at runtime (e.g., tools are dynamically registered), declare `tools: { listChanged: true }` in capabilities and send `notifications/tools/list_changed` when the set changes. The client will re-issue `tools/list` to refresh its cache. This is important for servers where available tools depend on user configuration or authentication state.
