#!/usr/bin/env bats
# tests/evals/mcp-server-overlay-content.bats
#
# Keyword-presence spot checks for mcp-server knowledge docs. Guards against
# a future edit hollowing out a document. NOT a substitute for human review.

PROJECT_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
KB_DIR="${PROJECT_ROOT}/content/knowledge/mcp-server"

@test "mcp-protocol-fundamentals mentions JSON-RPC" {
  grep -q 'JSON-RPC' "${KB_DIR}/mcp-protocol-fundamentals.md"
}

@test "mcp-tool-design mentions inputSchema" {
  grep -q 'inputSchema' "${KB_DIR}/mcp-tool-design.md"
}

@test "mcp-resource-design mentions URI" {
  grep -q 'URI' "${KB_DIR}/mcp-resource-design.md"
}

@test "mcp-prompt-primitives mentions prompts/get" {
  grep -q 'prompts/get' "${KB_DIR}/mcp-prompt-primitives.md"
}

@test "mcp-transport-patterns mentions Streamable HTTP" {
  grep -q 'Streamable HTTP' "${KB_DIR}/mcp-transport-patterns.md"
}

@test "mcp-sdk-selection mentions FastMCP" {
  grep -q 'FastMCP' "${KB_DIR}/mcp-sdk-selection.md"
}

@test "mcp-authentication mentions OAuth" {
  grep -q 'OAuth' "${KB_DIR}/mcp-authentication.md"
}

@test "mcp-error-handling mentions isError" {
  grep -q 'isError' "${KB_DIR}/mcp-error-handling.md"
}

@test "mcp-testing-strategies mentions MCP Inspector" {
  grep -q 'MCP Inspector' "${KB_DIR}/mcp-testing-strategies.md"
}

@test "mcp-deployment-patterns mentions stdio" {
  grep -q 'stdio' "${KB_DIR}/mcp-deployment-patterns.md"
}

@test "mcp-observability mentions logging" {
  grep -q 'logging' "${KB_DIR}/mcp-observability.md"
}

@test "mcp-versioning mentions MCP-Protocol-Version" {
  grep -q 'MCP-Protocol-Version' "${KB_DIR}/mcp-versioning.md"
}
