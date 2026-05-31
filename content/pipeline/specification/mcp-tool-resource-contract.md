---
name: mcp-tool-resource-contract
description: Specify the MCP tool, resource, and prompt contracts the server exposes
summary: "Specifies every MCP primitive the server exposes — tools with input schemas and error contracts, resources with URI templates and MIME types, prompts with arguments — so client integrations can be built against a stable, versioned surface."
phase: "specification"
order: 835
dependencies: [review-architecture]
outputs: [docs/mcp-contract.md]
conditional: "if-needed"
knowledge-base: [mcp-tool-design, mcp-resource-design, mcp-prompt-primitives, mcp-error-handling]
---

## Purpose
Define the complete contract surface of the MCP server — every tool, resource,
and prompt primitive it exposes. Each tool specifies its name, input JSON Schema,
success output shape, and typed error catalog. Each resource specifies its URI
template, MIME type, listability, and pagination behaviour. Each prompt specifies
its argument list and expected invocation context. The contract is derived from
`mcpServerConfig.primitives` so only declared primitive types are specified.
This document is the authoritative agreement between server and client agents,
enabling client integration to proceed in parallel with server implementation.

## Inputs
- docs/system-architecture.md (required) — server component boundaries and domain operations to expose
- docs/domain-models/ (required) — entity shapes that inform tool input/output schemas
- .scaffold/config.yml (required) — `mcpServerConfig` fields: `primitives`, `auth`, `transport`, `stateful`

## Expected Outputs
- docs/mcp-contract.md — MCP contract specification covering all enabled primitive types

## Quality Criteria
- (mvp) Only primitive types listed in `mcpServerConfig.primitives` are specified; omit sections for absent types
- (mvp) Every tool documents: `name` (kebab-case), input JSON Schema (required/optional properties, types, constraints), success output shape, and at least 2 domain-specific error codes with human-readable reason phrases (e.g., `resource_not_found`, `invalid_query_parameter`)
- (mvp) Every resource documents: URI template (RFC 6570), MIME type, whether the resource is listable (`resources/list`), and a concrete example URI
- (mvp) Every prompt documents: `name`, each argument (name, description, required/optional), and a representative invocation example
- (mvp) Capability set in the contract matches `mcpServerConfig.primitives` (no undeclared capabilities advertised)
- (mvp) If `mcpServerConfig.auth != none`, each tool documents its auth requirement (bearer token scope, API key header, or `public`)
- (deep) Resources that support pagination document the cursor scheme, page-size limits, and empty-page sentinel
- (deep) If `mcpServerConfig.stateful == true`, tools that produce server-side state document subscription events and notification payloads (for `notifications/resources/updated` or custom channels)
- (deep) Versioning / deprecation strategy documented for breaking tool or schema changes
- (mvp) At least one annotated example request and response included per tool and per resource template

## Methodology Scaling
- **deep**: Full JSON Schema definitions with `$defs` and cross-references. Complete error catalog
  with HTTP-style status codes mapped to MCP error codes. Auth flow diagrams per primitive.
  Subscription / notification contracts for stateful servers. Deprecation policy.
  SDK or codegen considerations for typed client generation.
- **mvp**: Tool/resource/prompt list with input shapes and brief descriptions. Key error codes.
  Auth approach per primitive.
- **custom:depth(1-5)**:
  - Depth 1: primitive list with names and one-line descriptions.
  - Depth 2: primitive list with input shapes, output shapes, and auth approach.
  - Depth 3: add full input JSON Schemas, error contracts with domain-specific codes, and example payloads.
  - Depth 4: full contract spec with pagination, auth flow, and stateful notification contracts.
  - Depth 5: full spec with versioning strategy, deprecation policy, and codegen considerations.

## Mode Detection
Check for docs/mcp-contract.md. If it exists, operate in update mode: read
existing primitive definitions and diff against current system architecture and
domain models. Preserve existing tool names, input schemas, and error contracts.
Add new primitives for new features or domain operations. Update schemas if
domain model changed validation rules. Never remove or rename existing tools
without explicit user approval, as that constitutes a breaking change for
deployed clients.

## Update Mode Specifics
- **Detect prior artifact**: docs/mcp-contract.md exists
- **Preserve**: existing tool names, input schemas, output shapes, error codes,
  resource URI templates, MIME types, prompt argument lists
- **Triggers for update**: architecture changed server component boundaries,
  domain models added new operations, `mcpServerConfig.primitives` changed,
  auth approach changed
- **Conflict resolution**: if architecture moved an operation to a different
  component, update the tool's component ownership but preserve its contract;
  flag breaking schema changes (renamed fields, removed required properties,
  narrowed types) for explicit user review before adopting them
