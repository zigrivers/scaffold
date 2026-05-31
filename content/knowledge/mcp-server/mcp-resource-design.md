---
name: mcp-resource-design
description: MCP resource URIs, URI templates (RFC 6570), MIME types, resources/list + resources/read + resources/subscribe, listChanged notifications, annotations, pagination
topics: [mcp, resources, uri-templates, mime-types, subscriptions]
volatility: evolving
last-reviewed: null
version-pin: 'MCP spec 2025-06-18'
sources:
  - url: https://modelcontextprotocol.io/specification/2025-06-18/server/resources
  - url: https://datatracker.ietf.org/doc/html/rfc6570
  - url: https://datatracker.ietf.org/doc/html/rfc3986
---

Resources are the MCP primitive for exposing data that provides context to LLMs — files, database records, API responses, or any addressable content. Unlike tools, resources are application-driven (the host decides what to expose), not model-driven.

## Summary

Each resource has a `URI` as its unique identifier, a `name`, optional `description` and `mimeType`. Clients discover resources via `resources/list` and fetch content via `resources/read`. Parameterized resources use URI templates (RFC 6570) via `resources/templates/list`. Servers declare `resources: { subscribe: true }` to support `resources/subscribe` for change notifications. Both list and content endpoints support cursor-based pagination.

## Deep Guidance

### Resource URI design

Every resource MUST have a globally unique URI conforming to RFC 3986. The URI scheme signals the resource's nature:

- `file:///absolute/path/to/file.txt` — filesystem-like resources (the resource need not be a real file; use this for any content that behaves like a file).
- `https://example.com/api/data` — web-fetchable resources. Use only when the client can fetch the URL directly; otherwise use a custom scheme.
- `git://repo/path/to/file@main` — git-versioned content.
- Custom schemes (e.g., `db://`, `github://`, `slack://`) — use freely for domain-specific resources. Custom schemes MUST conform to RFC 3986.

Avoid embedding credentials, tokens, or session state in URIs — URIs are logged and passed between systems. Keep URIs stable across server restarts for resources that represent persistent entities.

### Static resources vs URI templates

**Static resources** have fully-specified URIs and appear in `resources/list`. Use for a bounded, known set of resources (a fixed set of config files, a fixed list of database tables, etc.).

**URI templates** (RFC 6570) use `resources/templates/list` and allow parameterized resource access. The `uriTemplate` field contains an RFC 6570 Level 1 template:

```json
{
  "uriTemplate": "github://repos/{owner}/{repo}/issues/{number}",
  "name": "GitHub Issue",
  "description": "A specific GitHub issue by owner, repo, and number",
  "mimeType": "application/json"
}
```

The template parameters (`owner`, `repo`, `number`) can be auto-completed by the server via the completions API if declared as server capability. Clients expand the template with concrete values and use the result as the URI in a `resources/read` request. Use templates for unbounded or large collections (user files, database rows, API records) where listing all resources statically is impractical.

### resources/list and pagination

`resources/list` returns available static resources. The response includes a `resources` array and an optional `nextCursor`. If `nextCursor` is present, pass it as `cursor` in the next request to get the next page. Always handle pagination — a server serving a filesystem may return thousands of entries.

```json
{
  "method": "resources/list",
  "params": { "cursor": "eyJwYWdlIjogMn0=" }
}
```

Response resources include `uri`, `name`, optional `title`, optional `description`, optional `mimeType`, and optional `size` (bytes). The `mimeType` is advisory — always re-check the `mimeType` in the actual content returned by `resources/read`.

### resources/read and content types

`resources/read` takes a `uri` and returns a `contents` array. Each content item carries:

- For text: `{ "uri": "...", "mimeType": "text/plain", "text": "..." }`
- For binary: `{ "uri": "...", "mimeType": "image/png", "blob": "<base64>" }`

A single read can return multiple content items if the URI expands to multiple files (e.g., a directory URI). The `blob` field contains standard base64-encoded binary data; the `text` field is a UTF-8 string.

Standard MIME type conventions: `text/plain`, `text/markdown`, `application/json`, `application/octet-stream` for unknown binary, `image/png`, `image/jpeg`, `text/html`. Use `inode/directory` (XDG MIME) for directory resources without a standard MIME type.

### Subscriptions

Declare `resources: { subscribe: true }` to support per-resource change notifications. The flow:

1. Client sends `resources/subscribe` with a specific `uri`.
2. Server responds with success (empty result).
3. When the resource changes, server sends `notifications/resources/updated` with the `uri`.
4. Client re-fetches the resource with `resources/read`.

Subscriptions are stateful — track them in the server. If a client disconnects and reconnects, subscriptions are lost and must be re-established. Implement subscriptions when resources represent live data (open files in an editor, real-time database records, live API state).

### listChanged notifications

If the set of available resources can change (files added/removed, database tables created/dropped), declare `resources: { listChanged: true }` and send `notifications/resources/list_changed` when the list changes. The client re-issues `resources/list` to refresh. This is separate from subscriptions: `listChanged` is for the catalog, subscriptions are for individual resource content.

### Annotations

Resources support optional `annotations` that hint at audience and priority:

```json
{
  "annotations": {
    "audience": ["assistant"],
    "priority": 0.9,
    "lastModified": "2025-06-18T10:00:00Z"
  }
}
```

- `audience`: `["user"]`, `["assistant"]`, or `["user", "assistant"]`. Use `["assistant"]` for machine-readable data the LLM should process but not display to users. Use `["user"]` for human-readable content.
- `priority`: 0.0 to 1.0. Higher values indicate more important context to include when token budgets are limited.
- `lastModified`: ISO 8601 timestamp. Enables clients to sort by recency or skip stale resources.

Annotations appear on the resource list entry, the content item, or both. They are hints — clients may ignore them.

### Error handling

Standard JSON-RPC error codes for resource operations: `-32002` for resource not found, `-32603` for internal server errors. Always return a proper JSON-RPC error when a `resources/read` URI does not exist — do not return an empty `contents` array. Validate all incoming URIs for scheme and path safety before accessing the underlying data source.
