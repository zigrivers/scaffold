---
name: mcp-testing-strategies
description: MCP server testing — MCP Inspector for interactive testing, client mocks, unit tests for handlers, protocol compliance tests, and integration testing patterns
topics: [mcp, testing, mcp-inspector, protocol-compliance, integration-testing]
volatility: stable
last-reviewed: null
version-pin: null
sources:
  - url: https://modelcontextprotocol.io/docs/tools/inspector
  - url: https://github.com/modelcontextprotocol/inspector
---

Testing MCP servers requires verifying two distinct layers: the protocol layer (correct JSON-RPC framing, capability negotiation, lifecycle) and the domain layer (tool logic, resource content, prompt rendering). The MCP Inspector handles the protocol layer interactively; unit and integration tests handle the domain layer.

## Summary

The **MCP Inspector** (`npx @modelcontextprotocol/inspector`) is the primary interactive testing tool — it connects to your server, shows all protocol messages, and lets you invoke tools, browse resources, and test prompts. For automated testing: unit-test individual tool/resource/prompt handler functions directly (no transport); write integration tests using an in-process SDK client against the server; use protocol compliance tests to verify capability negotiation and error responses. Test `isError` paths explicitly — they are easy to overlook.

## Deep Guidance

### MCP Inspector for interactive testing

The MCP Inspector is an interactive browser-based UI that connects to an MCP server and exposes all three capability types. Run it without installation:

```bash
# Test a local stdio server
npx @modelcontextprotocol/inspector node path/to/server/index.js

# Test a server installed via npm
npx -y @modelcontextprotocol/inspector npx @modelcontextprotocol/server-filesystem /tmp

# Test a Python server
npx @modelcontextprotocol/inspector uvx mcp-server-myapp --config myapp.json
```

The Inspector opens in your browser and provides:

- **Connection pane**: Select transport, customize command-line arguments and environment variables.
- **Tools tab**: Lists all declared tools, shows schemas, lets you invoke tools with custom input, displays results including `isError` responses.
- **Resources tab**: Lists static resources and templates, shows metadata, lets you read resource content, tests subscriptions.
- **Prompts tab**: Lists prompt templates, shows arguments, lets you invoke `prompts/get` with custom argument values, previews generated messages.
- **Notifications pane**: Shows all server log messages and notifications in real time.

**Development workflow with Inspector:**
1. Start development → launch Inspector with your server → verify connectivity and capability negotiation.
2. Add a tool → verify it appears in the Tools tab with the correct schema → test with valid and invalid inputs.
3. Implement error paths → verify `isError: true` responses display correctly.
4. Test edge cases: empty inputs, maximum-size inputs, concurrent calls, subscription behavior.

Use the Inspector as your first debugging stop before writing any automated tests — it shows the full protocol exchange and makes misconfigurations immediately visible.

### Unit testing handler functions

The best structure for testability isolates tool/resource/prompt logic from transport concerns. Extract handler functions that take typed inputs and return typed outputs, then test them without any MCP transport:

```typescript
// handlers/weather.ts — testable in isolation
export async function getWeatherHandler(location: string): Promise<string> {
  const data = await fetchWeatherApi(location)
  return formatWeatherResponse(data)
}

// weather.test.ts
import { getWeatherHandler } from './handlers/weather.js'
it('returns formatted weather', async () => {
  const result = await getWeatherHandler('New York')
  expect(result).toContain('Temperature')
})
```

The MCP registration is a thin wrapper:
```typescript
server.tool('get_weather', 'Get current weather', { location: z.string() },
  async ({ location }) => ({
    content: [{ type: 'text', text: await getWeatherHandler(location) }],
  })
)
```

This pattern keeps the bulk of your logic in ordinary functions that are fast to test without spinning up a transport.

### Protocol compliance tests

Write tests that verify correct JSON-RPC behavior at the protocol level. Use the SDK's in-process transport (TypeScript: `InMemoryTransport`; Python: available via the SDK's testing utilities) to connect a test client directly to the server:

Key protocol behaviors to test:
- `initialize` returns declared capabilities matching what the server actually supports.
- Calling `tools/call` with an unknown tool name returns a protocol error `-32602` (not `isError`) — the request could not be dispatched at all.
- Calling `tools/call` with arguments that fail the tool's `inputSchema` or business validation returns `isError: true` (SEP-1303), NOT `-32602` — the tool dispatched but the inputs were invalid, so the model can self-correct.
- Tools that fail domain-level (API errors, rate limits, resource not found) return `isError: true`, not a JSON-RPC error.
- `resources/read` with a nonexistent URI returns `-32002`.
- `prompts/get` with a missing required argument returns `-32602` (structural dispatch failure, not a tool execution).
- `notifications/tools/list_changed` is sent when the tool list changes (if `listChanged: true` was declared).

### Testing isError paths

`isError` paths are frequently untested because they require mocking external failures. Make them explicit:

```typescript
it('returns isError when API rate limited', async () => {
  mockWeatherApi.mockRejectedValue(new RateLimitError('rate limited'))
  const result = await callTool(server, 'get_weather', { location: 'NYC' })
  expect(result.isError).toBe(true)
  expect(result.content[0].text).toContain('rate limit')
})
```

Test both `isError: true` AND that the error message is actionable (mentions what failed, not just "error occurred").

### Integration testing

Integration tests connect a real client (or SDK client) to the server over the actual transport:

**For stdio servers**: spawn the server process in the test, connect via stdio, run the initialization handshake, invoke tools/resources/prompts, and verify results. Tear down the process after each test suite.

**For HTTP servers**: start the server on a random port, make HTTP requests using the SDK client or raw HTTP, verify both successful responses and error cases. Use `supertest` (Node.js) or `httpx` (Python) for HTTP-level assertions alongside the MCP client for protocol-level assertions.

**For resource subscriptions**: test that `notifications/resources/updated` is sent when the underlying data changes, and that a subsequent `resources/read` returns the new content.

### Test environment setup

Avoid relying on real external APIs in unit or integration tests. Mock or stub all external calls. For testing servers that wrap external services (GitHub, databases, cloud APIs), use:
- Test doubles (mocks) at the HTTP level (e.g., `nock` for Node.js, `responses` for Python).
- Sandbox/test environments of the external service if a mock is too complex.
- Recorded HTTP cassettes (e.g., VCR-style) for stable third-party APIs.

Run the Inspector on your test fixtures to visually confirm that schemas, descriptions, and error messages read well from an LLM client's perspective — the Inspector is also a schema review tool.
