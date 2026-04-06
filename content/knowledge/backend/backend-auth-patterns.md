---
name: backend-auth-patterns
description: JWT lifecycle, OAuth2 authorization code flow, API key management, and service-to-service authentication
topics: [backend, auth, jwt, oauth2, api-keys, mtls, security]
---

## JWT Lifecycle

Issue JWTs with short expiry (15–60 minutes) signed with RS256 or ES256. Include only the minimum claims needed: `sub`, `iat`, `exp`, `iss`, `aud`, and application-specific role or scope claims. Never put sensitive data in the payload — it is base64-encoded, not encrypted.

**Refresh flow:** Issue a long-lived refresh token (7–30 days) stored in an HttpOnly, Secure, SameSite=Strict cookie. On access-token expiry the client posts to `/auth/refresh`; the server validates the refresh token, issues a new access token, and optionally rotates the refresh token (sliding expiry). Implement refresh-token rotation to detect token theft: if an already-used refresh token is presented, revoke the entire family and force re-login.

**Revocation:** JWTs are stateless by design — revocation requires a blocklist. Store revoked token JTIs in Redis with TTL matching the token's remaining lifetime. Check the blocklist on every request only for high-security operations; skip the check for low-risk reads when performance matters and accept the short window of continued validity.

**Key rotation:** Support multiple active signing keys identified by `kid` header. Add the new key to the JWKS endpoint, start signing with it, keep the old key for validation until all tokens signed with it have expired, then remove it.

## OAuth2 Authorization Code Flow

Use the authorization code flow (with PKCE) for any user-facing OAuth2 integration — never implicit or client credentials on the frontend.

1. Generate a cryptographically random `state` parameter and PKCE `code_verifier`/`code_challenge`. Store both in the session.
2. Redirect the user to the provider's authorization endpoint with `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, and `code_challenge`.
3. On callback, verify `state` matches the session value (CSRF protection), then exchange `code` + `code_verifier` for tokens via a server-side POST.
4. Store the provider's access token server-side (never expose it to the browser). Use it to fetch the user's profile and map to a local user record.
5. Issue your own session or JWT — do not use the provider's token as your application's auth token.

## API Key Management

**Generation:** Use cryptographically random 32-byte values encoded as hex or base58. Prefix keys with a service identifier (`sk_live_`, `pk_test_`) for easy identification in logs and leaked-credential scanners.

**Storage:** Hash the key (SHA-256) before storing in the database, just like a password. Only show the full key once at creation time. Store metadata alongside the hash: name, scopes, last-used timestamp, expiry, owner.

**Scoping:** Define fine-grained scopes (`orders:read`, `webhooks:write`) and require callers to request minimum necessary scopes. Validate scope on each request against the endpoint's required permissions.

**Rotation:** Provide a rotation endpoint that issues a new key and returns both old and new simultaneously. Set a grace period (e.g., 24 hours) during which both keys are valid, then revoke the old key. Send email/webhook notifications before expiry.

## Service-to-Service Authentication

**mTLS:** Both client and server present TLS certificates. The server verifies the client certificate against a trusted CA. Use a private CA (cert-manager on Kubernetes, AWS Private CA) to issue short-lived service certificates. Rotate certificates automatically before expiry. mTLS is the strongest service-to-service option and integrates with service meshes (Istio, Linkerd).

**Shared secrets / HMAC request signing:** For simpler setups, sign requests with an HMAC-SHA256 of the canonical request (method + path + timestamp + body hash) using a shared secret. Include the signature and timestamp in a request header. The receiving service verifies the signature and rejects requests with timestamps older than 5 minutes (replay protection). Rotate shared secrets via a dual-key window.

**Workload identity:** On cloud platforms, prefer workload identity (AWS IAM roles for service accounts, GCP Workload Identity Federation) over static shared secrets. Credentials are issued dynamically by the platform and rotate automatically.
