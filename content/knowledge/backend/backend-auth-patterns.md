---
name: backend-auth-patterns
description: JWT lifecycle, OAuth2 authorization code flow, API key management, and service-to-service authentication
topics: [backend, auth, jwt, oauth2, api-keys, mtls, security]
---

Authentication and authorization are the first line of defense for any backend service — mistakes here compromise the entire system, making it essential to use proven patterns like JWTs with rotation, OAuth2 with PKCE, and workload identity from the start.

## Summary

Authentication and authorization patterns for backend services center on three areas: JWTs with short expiry and refresh-token rotation for user sessions, OAuth2 authorization code flow with PKCE for third-party integrations, and scoped API keys with hashed storage for programmatic access. Service-to-service authentication uses mTLS, HMAC request signing, or cloud workload identity.

Every auth mechanism requires explicit key rotation, revocation procedures, and scope enforcement. Never put sensitive data in JWT payloads and never store API keys unhashed.

## Deep Guidance

### JWT Lifecycle

Issue JWTs with short expiry (15–60 minutes) signed with RS256 or ES256. Include only the minimum claims needed: `sub`, `iat`, `exp`, `iss`, `aud`, and application-specific role or scope claims. Never put sensitive data in the payload — it is base64-encoded, not encrypted.

**Refresh flow:** Issue a long-lived refresh token (7–30 days) stored in an HttpOnly, Secure, SameSite=Strict cookie. On access-token expiry the client posts to `/auth/refresh`; the server validates the refresh token, issues a new access token, and optionally rotates the refresh token (sliding expiry). Implement refresh-token rotation to detect token theft: if an already-used refresh token is presented, revoke the entire family and force re-login.

**Revocation:** JWTs are stateless by design — revocation requires a blocklist. Store revoked token JTIs in Redis with TTL matching the token's remaining lifetime. Check the blocklist on every request only for high-security operations; skip the check for low-risk reads when performance matters and accept the short window of continued validity.

**Key rotation:** Support multiple active signing keys identified by `kid` header. Add the new key to the JWKS endpoint, start signing with it, keep the old key for validation until all tokens signed with it have expired, then remove it.

### OAuth2 Authorization Code Flow

Use the authorization code flow (with PKCE) for any user-facing OAuth2 integration — never implicit or client credentials on the frontend.

1. Generate a cryptographically random `state` parameter and PKCE `code_verifier`/`code_challenge`. Store both in the session.
2. Redirect the user to the provider's authorization endpoint with `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, and `code_challenge`.
3. On callback, verify `state` matches the session value (CSRF protection), then exchange `code` + `code_verifier` for tokens via a server-side POST.
4. Store the provider's access token server-side (never expose it to the browser). Use it to fetch the user's profile and map to a local user record.
5. Issue your own session or JWT — do not use the provider's token as your application's auth token.

### API Key Management

**Generation:** Use cryptographically random 32-byte values encoded as hex or base58. Prefix keys with a service identifier (`sk_live_`, `pk_test_`) for easy identification in logs and leaked-credential scanners.

**Storage:** Hash the key (SHA-256) before storing in the database, just like a password. Only show the full key once at creation time. Store metadata alongside the hash: name, scopes, last-used timestamp, expiry, owner.

**Scoping:** Define fine-grained scopes (`orders:read`, `webhooks:write`) and require callers to request minimum necessary scopes. Validate scope on each request against the endpoint's required permissions.

**Rotation:** Provide a rotation endpoint that issues a new key and returns both old and new simultaneously. Set a grace period (e.g., 24 hours) during which both keys are valid, then revoke the old key. Send email/webhook notifications before expiry.

### Service-to-Service Authentication

**mTLS:** Both client and server present TLS certificates. The server verifies the client certificate against a trusted CA. Use a private CA (cert-manager on Kubernetes, AWS Private CA) to issue short-lived service certificates. Rotate certificates automatically before expiry. mTLS is the strongest service-to-service option and integrates with service meshes (Istio, Linkerd).

**Shared secrets / HMAC request signing:** For simpler setups, sign requests with an HMAC-SHA256 of the canonical request (method + path + timestamp + body hash) using a shared secret. Include the signature and timestamp in a request header. The receiving service verifies the signature and rejects requests with timestamps older than 5 minutes (replay protection). Rotate shared secrets via a dual-key window.

**Workload identity:** On cloud platforms, prefer workload identity (AWS IAM roles for service accounts, GCP Workload Identity Federation) over static shared secrets. Credentials are issued dynamically by the platform and rotate automatically.

### Session Management Patterns

For server-rendered applications or APIs that need session state:

- **Server-side sessions**: Store session data in Redis or a database. The client holds only an opaque session ID in an HttpOnly, Secure, SameSite=Strict cookie. Server looks up the session on each request. Benefits: easy revocation, no client-side state management. Cost: every request hits the session store.
- **Stateless JWT sessions**: The JWT itself is the session. Benefits: no session store, horizontal scaling without shared state. Cost: revocation requires a blocklist, token size grows with claims, tokens cannot be invalidated before expiry without extra infrastructure.
- **Hybrid approach**: Use JWTs for short-lived access (15 minutes) and server-side sessions for refresh tokens. This provides the performance benefits of stateless access tokens with the revocability of server-side sessions.

Choose server-side sessions for applications with strict revocation requirements (banking, healthcare). Choose stateless JWTs for high-throughput APIs where the operational overhead of a session store is not justified.

### Permission Models

Authorization beyond authentication requires an explicit permission model:

- **RBAC (Role-Based Access Control)**: Users are assigned roles (admin, editor, viewer). Roles map to permissions. Simple to implement, hard to evolve when permission granularity requirements grow. Suitable for most applications with fewer than 20 distinct permission levels.
- **ABAC (Attribute-Based Access Control)**: Permissions evaluated based on user attributes, resource attributes, and environmental context. More flexible than RBAC but more complex to implement and audit. Use when the same user needs different permissions on different resources based on attributes (department, project membership, data sensitivity).
- **ReBAC (Relationship-Based Access Control)**: Permissions derived from the relationship between users and resources (ownership, team membership, sharing). Google Zanzibar model. Implemented by OpenFGA, SpiceDB, Ory Keto. Use for applications with complex sharing and collaboration features (Google Docs-style permissions).

Regardless of model, enforce authorization at the service layer — not at the controller level. A controller that checks permissions directly is duplicating security logic that should be centralized.

### Token Storage Best Practices

Where tokens are stored determines the attack surface:

- **HttpOnly cookies**: Protected from XSS (JavaScript cannot read them). Vulnerable to CSRF without SameSite and CSRF tokens. The recommended storage for refresh tokens.
- **Authorization header (Bearer token)**: Tokens stored in memory. Lost on page refresh. Not vulnerable to CSRF. Suitable for SPAs where the token is fetched from a server-side session on load.
- **localStorage**: Persistent across sessions but fully accessible to any JavaScript on the page. Never store refresh tokens or long-lived credentials in localStorage — a single XSS vulnerability compromises them.

### CSRF Protection

Cross-Site Request Forgery (CSRF) attacks trick authenticated browsers into making unintended requests. Protection strategies:

- **SameSite cookies**: Set `SameSite=Strict` or `SameSite=Lax` on session cookies. `Strict` prevents the cookie from being sent on any cross-site request, including navigation. `Lax` allows the cookie on top-level GET navigations (safe for most cases).
- **Double-submit cookie**: Generate a random CSRF token, set it as a cookie, and require the client to include it in a custom header (`X-CSRF-Token`). The server verifies the header matches the cookie. Attackers cannot read cross-origin cookies to include the header.
- **Origin header validation**: Check the `Origin` or `Referer` header on state-changing requests. Reject requests from unknown origins. This is a defense-in-depth measure, not a standalone protection.
- **Token-per-request**: For highest security, generate a unique CSRF token per form render and validate it on submission. More complex but eliminates token reuse attacks.

When using JWT bearer tokens in Authorization headers (not cookies), CSRF protection is not needed — the token is not sent automatically by the browser.

### Multi-Factor Authentication Integration

For applications requiring MFA:

- **TOTP (Time-based One-Time Password)**: Standard algorithm (RFC 6238) compatible with Google Authenticator, Authy, 1Password. Generate a secret key, encode as a QR code URI, and verify the 6-digit code during login. Store the secret key encrypted in the database.
- **WebAuthn / Passkeys**: Hardware key or biometric authentication via the Web Authentication API. Strongest option — phishing-resistant. Support as the primary MFA method for security-sensitive applications.
- **Recovery codes**: Generate 8-10 single-use recovery codes during MFA enrollment. Hash them like passwords. Display only once at enrollment. These are the escape hatch when the user loses their MFA device.
