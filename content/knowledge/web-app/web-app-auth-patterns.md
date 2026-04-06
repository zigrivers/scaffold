---
name: web-app-auth-patterns
description: OAuth 2.0 + PKCE flows, cookie security, passkey/WebAuthn, social login, CSRF protection, and auth state management
topics: [web-app, auth, oauth, pkce, webauthn, passkeys, csrf, security]
---

Authentication in web applications is a deep domain where implementation mistakes have severe security consequences. The auth surface spans the browser, the server, and third-party identity providers — and each boundary has its own threat model. OAuth 2.0 with PKCE is now the standard for delegated authorization; WebAuthn/passkeys are rapidly becoming the standard for credential-free authentication; and session cookie security attributes are the baseline that every web app must get right. Skipping any of these correctly has historically led to breaches.

## Summary

### OAuth 2.0 + PKCE Flow

OAuth 2.0 Authorization Code flow with PKCE (Proof Key for Code Exchange) is the correct flow for user-facing web apps. It prevents authorization code interception attacks that plagued the original Authorization Code flow.

**PKCE flow:**
1. Client generates a cryptographically random `code_verifier` (43–128 chars)
2. Client derives `code_challenge = BASE64URL(SHA256(code_verifier))`
3. Client redirects user to authorization server with `code_challenge` and `code_challenge_method=S256`
4. User authenticates with the identity provider
5. Authorization server redirects back with `code` in the query string
6. Client exchanges `code` + `code_verifier` for tokens — the server verifies the challenge hash
7. Without the original `code_verifier`, a stolen `code` is useless

Never store the `code_verifier` in `localStorage` — use `sessionStorage` or in-memory. The code exchange must happen from your backend (BFF pattern) to avoid exposing `client_secret` in browser code.

### Cookie Security Attributes

Every session cookie and auth cookie must have all four attributes correctly configured:

- **HttpOnly** — prevents JavaScript access, blocking XSS-based token theft
- **Secure** — restricts transmission to HTTPS, preventing network interception
- **SameSite=Strict** — cookie not sent on any cross-site request, preventing CSRF
- **SameSite=Lax** — cookie sent on top-level navigations only; use when cross-site POST is never needed but external links should work
- **`__Host-` prefix** — enforces Secure + path=/ + no Domain; prevents subdomain hijacking

Use `SameSite=Strict` for session cookies. If your app needs to accept inbound cross-site navigation with the user's session (e.g., linking from a third-party site into an authenticated page), use `Lax`.

### Passkey / WebAuthn Implementation

WebAuthn is the W3C standard for hardware-backed authentication. Passkeys are synced WebAuthn credentials — the user registers once and the credential is available on all their devices via iCloud Keychain or Google Password Manager.

**Why passkeys matter:**
- No password to phish, leak, or forget
- Phishing-resistant by design — the credential is bound to the origin URL
- Biometric authentication without biometric data leaving the device
- Major platform support as of 2023 (iOS 16+, macOS Ventura+, Android 9+, Windows 11)

**Registration flow:** `navigator.credentials.create()` with a challenge from your server → user authenticates with biometric/PIN → store the public key and credential ID on your server.

**Authentication flow:** `navigator.credentials.get()` with a challenge → WebAuthn assertion → verify signature on server using stored public key.

### Social Login Integration

Social login (Google, GitHub, Apple, etc.) delegates authentication to a trusted identity provider. The implementation pattern:

1. Redirect to provider OAuth endpoint (with PKCE)
2. Provider redirects back with `code`
3. Backend exchanges `code` for `id_token` + `access_token`
4. Verify `id_token` signature against provider's public keys (JWKS endpoint)
5. Extract user identity (`sub`, `email`, `name`) from verified token
6. Look up or create user record; issue your app's session

**Account linking:** The same email across different providers should map to the same user account. Store `provider:sub` pairs linked to a single user record to handle this.

## Deep Guidance

### PKCE Implementation

```typescript
// PKCE utilities — run in browser before redirect
async function generatePKCE() {
  // Generate cryptographically random code_verifier
  const codeVerifier = base64URLEncode(crypto.getRandomValues(new Uint8Array(32)));

  // Derive code_challenge via SHA-256
  const codeChallenge = base64URLEncode(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
    )
  );

  return { codeVerifier, codeChallenge };
}

function base64URLEncode(buffer: Uint8Array): string {
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Initiate login
async function initiateOAuthLogin(provider: string) {
  const { codeVerifier, codeChallenge } = await generatePKCE();
  const state = base64URLEncode(crypto.getRandomValues(new Uint8Array(16)));

  // Store verifier and state — sessionStorage, never localStorage
  sessionStorage.setItem('pkce_verifier', codeVerifier);
  sessionStorage.setItem('oauth_state', state);

  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID!,
    redirect_uri: `${window.location.origin}/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  window.location.href = `${OAUTH_AUTHORIZATION_ENDPOINT}?${params}`;
}

// Handle callback
async function handleOAuthCallback(searchParams: URLSearchParams) {
  const code = searchParams.get('code');
  const returnedState = searchParams.get('state');

  // Verify state to prevent CSRF
  const savedState = sessionStorage.getItem('oauth_state');
  if (!savedState || returnedState !== savedState) {
    throw new Error('State mismatch — possible CSRF attack');
  }

  const codeVerifier = sessionStorage.getItem('pkce_verifier');
  sessionStorage.removeItem('pkce_verifier');
  sessionStorage.removeItem('oauth_state');

  // Exchange code + verifier for tokens (via your backend)
  return fetch('/api/auth/callback', {
    method: 'POST',
    body: JSON.stringify({ code, codeVerifier }),
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### WebAuthn Passkey Registration

```typescript
// Register a new passkey
async function registerPasskey(userId: string, username: string) {
  // 1. Get challenge from server
  const { challenge, rpId } = await api.getRegistrationChallenge();

  // 2. Create credential
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: base64URLDecode(challenge),
      rp: { name: 'My App', id: rpId },
      user: {
        id: new TextEncoder().encode(userId),
        name: username,
        displayName: username,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256 (most supported)
        { alg: -257, type: 'public-key' }, // RS256 (Windows Hello fallback)
      ],
      authenticatorSelection: {
        residentKey: 'required',          // Required for passkeys
        userVerification: 'required',     // Biometric/PIN required
      },
      attestation: 'none',                // No attestation for consumer apps
    },
  }) as PublicKeyCredential;

  // 3. Send response to server for verification and storage
  const response = credential.response as AuthenticatorAttestationResponse;
  return api.completeRegistration({
    credentialId: base64URLEncode(credential.rawId),
    clientDataJSON: base64URLEncode(response.clientDataJSON),
    attestationObject: base64URLEncode(response.attestationObject),
  });
}
```

Use the `@simplewebauthn/server` library on the backend for verification. It handles the complex binary parsing, signature verification, and CBOR decoding correctly.

### CSRF Protection

With `SameSite=Strict` cookies, CSRF is largely mitigated for standard same-origin flows. However, for APIs that accept `application/json` content type (which browsers can't trigger via forms or `<img>` tags), the risk is already limited.

For applications that cannot use `SameSite=Strict` (e.g., cross-site embedded auth flows):

```typescript
// Double-submit cookie pattern
// Server sets a CSRF token in a readable cookie (not HttpOnly)
// Client reads the cookie and sends it as a request header
// Server validates that header matches cookie value

// Server: set CSRF cookie on login
res.cookie('csrf-token', generateCSRFToken(), {
  httpOnly: false,  // Must be readable by JavaScript
  secure: true,
  sameSite: 'lax',
});

// Client: inject header on every mutating request
apiClient.defaults.headers.common['X-CSRF-Token'] = getCookie('csrf-token');

// Server: validate on every mutation
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (req.headers['x-csrf-token'] !== req.cookies['csrf-token']) {
      return res.status(403).json({ error: 'CSRF token mismatch' });
    }
  }
  next();
});
```

### Auth State Management in React

```typescript
// Auth context — single source of truth for authentication state
interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

// Use React Query to manage auth state (benefits from cache, refetch on focus)
export function useAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.getCurrentUser(),
    retry: false,         // Don't retry 401s
    staleTime: Infinity,  // Only refetch manually or on window focus
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
  };
}

// Route protection
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/login?returnTo=${encodeURIComponent(router.asPath)}`);
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading) return <PageSpinner />;
  if (!isAuthenticated) return null;
  return <>{children}</>;
}
```

Store the return URL before redirecting to login so users land on the page they were trying to reach after authentication.
