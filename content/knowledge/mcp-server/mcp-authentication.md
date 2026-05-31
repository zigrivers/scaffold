---
name: mcp-authentication
description: MCP authentication patterns — stdio local trust model, OAuth 2.1 for HTTP transports, PKCE, dynamic client registration, API key alternatives, and token validation
topics: [mcp, authentication, oauth, security, authorization]
volatility: evolving
last-reviewed: null
version-pin: 'MCP spec 2025-06-18; OAuth 2.1 draft-ietf-oauth-v2-1-13'
sources:
  - url: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
  - url: https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13
  - url: https://datatracker.ietf.org/doc/html/rfc7591
  - url: https://www.rfc-editor.org/rfc/rfc8707.html
---

Authentication in MCP is transport-dependent. stdio servers rely on OS process isolation (no network auth needed). HTTP servers should use OAuth 2.1 for multi-user or multi-tenant scenarios, or simpler API key patterns for internal/single-tenant deployments.

## Summary

**stdio transport**: no network authentication — the server inherits credentials from environment variables and the OS controls process access. **Streamable HTTP transport**: use OAuth 2.1 (per spec) for public or multi-user servers. OAuth flow: client hits protected resource, gets 401 with `WWW-Authenticate`, discovers authorization server via OAuth Protected Resource Metadata, completes OAuth 2.1 with PKCE, presents `Bearer` token on all subsequent requests. For simpler deployments, API keys in headers or environment-injected tokens are practical alternatives. The spec mandates `MCP-Protocol-Version` on HTTP requests and audience validation on tokens.

## Deep Guidance

### stdio: local trust model

The stdio transport requires no network authentication. Trust is established by OS-level process ownership: the client spawns the server as a subprocess, which means both run under the same user account. The server process inherits environment variables from the parent, which is the standard mechanism for passing API keys, database credentials, or access tokens to a local MCP server:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["my-mcp-server"],
      "env": {
        "DATABASE_URL": "postgresql://localhost/mydb",
        "API_KEY": "sk-..."
      }
    }
  }
}
```

The spec is explicit: implementations using stdio SHOULD NOT follow the OAuth specification and SHOULD instead retrieve credentials from the environment. Do not add HTTP authentication middleware to a stdio server.

### OAuth 2.1 for HTTP transports

For Streamable HTTP servers accessible over a network, the spec defines an OAuth 2.1 authorization flow. The server acts as an OAuth 2.1 **resource server**; a separate authorization server handles token issuance.

**Discovery flow:**
1. Client sends an unauthenticated MCP request.
2. Server responds `401 Unauthorized` with a `WWW-Authenticate` header pointing to the resource server metadata URL.
3. Client fetches `/.well-known/oauth-protected-resource` to get the authorization server URL.
4. Client fetches the authorization server's metadata at `/.well-known/oauth-authorization-server`.
5. Client completes the OAuth 2.1 authorization code flow with PKCE.
6. Client presents `Authorization: Bearer <token>` on all subsequent requests.

**PKCE is mandatory** for public clients (MCP clients cannot keep secrets). The authorization server MUST support PKCE. The client generates a `code_verifier` (random string), hashes it to `code_challenge`, includes the challenge in the authorization request, and presents the verifier in the token request.

**Resource parameter** (RFC 8707): clients MUST include a `resource` parameter in both authorization and token requests identifying the MCP server's canonical URI (e.g., `https://mcp.example.com`). This binds tokens to their intended audience and prevents cross-service token reuse.

### Token validation requirements

MCP servers MUST validate every incoming access token:
- Verify the token is valid and not expired.
- Verify the token's audience claim identifies this server (matches the server's canonical URI).
- Reject tokens with `401` if invalid or expired; `403` if the token is valid but lacks required scope.

NEVER accept tokens issued for a different resource. NEVER forward a received token to an upstream API — issue a separate token for each upstream call. Token passthrough is explicitly forbidden by the spec and creates confused deputy vulnerabilities.

### Dynamic client registration

Authorization servers and clients SHOULD support OAuth 2.0 Dynamic Client Registration (RFC 7591). Without it, MCP clients must be pre-registered with every authorization server, which creates friction for discovering and connecting to new servers. Dynamic registration lets a client auto-register on first connection:

```
POST /register
{ "client_name": "Claude Desktop", "redirect_uris": ["http://localhost:57842/callback"] }
→ { "client_id": "abc123", ... }
```

If the authorization server does not support dynamic registration, the client must hardcode a client ID or present a UI for manual credential entry.

### Simpler alternatives for private/internal deployments

For servers used only within a controlled environment (team tool, internal service), full OAuth is often unnecessary overhead. Practical alternatives:

**API key in header**: The client includes a static API key in a custom header or as a Bearer token. The server validates it against a stored secret. Simple, easy to rotate, no token exchange flow.

**Mutual TLS**: Suitable for service-to-service scenarios where both sides have certificates. The TLS handshake authenticates both parties.

**Reverse proxy with auth**: Run the MCP server behind nginx/Caddy/Cloudflare with authentication handled at the proxy layer. The server itself trusts all proxied connections.

**Network isolation**: For truly internal deployments, rely on network controls (VPN, private subnet, firewall rules) and skip application-layer auth. Acceptable only when the network boundary is the full security boundary.

### Security hardening checklist

- Validate the `Origin` header on all Streamable HTTP connections to prevent DNS rebinding attacks.
- Use HTTPS for all HTTP transport connections (required by OAuth 2.1 for authorization server endpoints and redirect URIs).
- Bind local HTTP servers to 127.0.0.1, not 0.0.0.0.
- Rotate API keys and tokens regularly; issue short-lived access tokens.
- Log all authentication failures with enough context to diagnose attacks.
- Do not embed credentials in resource URIs (they appear in logs and referrer headers).
