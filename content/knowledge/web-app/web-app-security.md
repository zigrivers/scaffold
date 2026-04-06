---
name: web-app-security
description: XSS prevention, Content Security Policy, CSRF tokens, clickjacking, Subresource Integrity, dependency auditing, and OWASP top 10 for web apps
topics: [web-app, security, xss, csp, csrf, clickjacking, owasp, dependency-auditing]
---

Web application security failures are among the most costly and common causes of data breaches. The OWASP Top 10 has catalogued the same categories of vulnerabilities for decades — not because they are new, but because they recur in every generation of frameworks and technologies. Understanding the attack vectors and their mitigations is not optional for engineers building user-facing web applications. Security must be designed in, not bolted on.

## Summary

### XSS (Cross-Site Scripting) Prevention

XSS occurs when attacker-controlled content is rendered as executable script in a victim's browser. It is the most prevalent web vulnerability class.

**Three XSS types:**
- **Stored XSS** — malicious script is stored in the database and rendered for all users (e.g., a comment containing `<script>`)
- **Reflected XSS** — malicious script is in the URL and reflected back in the response (e.g., a search page rendering the query parameter unsanitized)
- **DOM-based XSS** — malicious script is injected via client-side JavaScript manipulation of the DOM (e.g., `element.innerHTML = location.hash`)

**Primary defense: output encoding.** Modern React, Vue, and Angular frameworks automatically escape string interpolation. The vulnerabilities arise when developers bypass the framework: `dangerouslySetInnerHTML`, `v-html`, `innerHTML`, `document.write`, `eval()`.

**Content Security Policy (CSP):** A `Content-Security-Policy` response header instructs the browser to only execute scripts from trusted sources:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://trusted-cdn.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  upgrade-insecure-requests;
```

`'unsafe-inline'` in `script-src` defeats the XSS protection benefit. Use nonces (`'nonce-{random}'`) or hashes instead for inline scripts.

### Clickjacking Prevention

Clickjacking loads your application in a hidden `<iframe>` on an attacker's page. Users believe they are clicking on the attacker's UI but are actually clicking your application's buttons.

**Defense:** `Content-Security-Policy: frame-ancestors 'none'` (preferred) or the older `X-Frame-Options: DENY`. `frame-ancestors 'none'` prevents your app from being embedded in any frame. Use `frame-ancestors 'self'` if you need to allow same-origin framing.

### CSRF Protection

Cross-Site Request Forgery tricks an authenticated user into submitting a request to your application from an attacker's site. The browser automatically sends cookies, making the forged request appear legitimate.

**Primary defense:** `SameSite=Strict` or `SameSite=Lax` cookies. With `SameSite=Strict`, the cookie is never sent on cross-site requests, making CSRF impossible.

**Secondary defense for legacy or cross-site scenarios:** Synchronizer token pattern — include a CSRF token in every form/request and validate it on the server.

### Subresource Integrity (SRI)

When loading scripts or stylesheets from CDNs, SRI prevents a compromised CDN from serving malicious content:

```html
<script
  src="https://cdn.example.com/library.min.js"
  integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/ux8P/C5b2E8x2U6sQ=="
  crossorigin="anonymous"
></script>
```

The browser verifies the hash of the loaded resource. If it does not match, the resource is blocked. Generate hashes with: `openssl dgst -sha384 -binary file.js | openssl base64 -A`.

### Dependency Auditing

Third-party dependencies are the most underestimated attack surface. The 2021 Log4Shell vulnerability and 2022 node-ipc supply chain attack demonstrated that a dependency in a dependency can cause a critical vulnerability.

**Baseline practices:**
- Run `npm audit` or `pnpm audit` in CI — fail the build on critical/high severities
- Pin exact dependency versions in production builds (lockfile required)
- Review dependency additions as carefully as code additions
- Subscribe to security advisories for critical dependencies (GitHub Dependabot, Snyk)

## Deep Guidance

### Content Security Policy Implementation

Deploying CSP in production requires a staged approach — a strict policy will break things:

**Phase 1: Report-only mode.** Use `Content-Security-Policy-Report-Only` with a `report-uri` endpoint. This logs violations without blocking anything. Collect violations for 1–2 weeks.

**Phase 2: Fix violations.** Address inline scripts (move to external files or use nonces), fix disallowed origins, and handle third-party widget requirements.

**Phase 3: Enforce.** Switch to `Content-Security-Policy`. Monitor violation reports for regressions.

```typescript
// Next.js CSP with nonces (recommended over 'unsafe-inline')
import { headers } from 'next/headers';
import crypto from 'crypto';

export default function RootLayout({ children }) {
  const nonce = crypto.randomBytes(16).toString('base64');

  const cspHeader = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' blob: data: https:`,
    `font-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');

  return (
    <html>
      <head>
        <meta httpEquiv="Content-Security-Policy" content={cspHeader} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### Security Headers Checklist

Every production web app must serve these response headers:

```
# Prevent clickjacking
Content-Security-Policy: frame-ancestors 'none'
X-Frame-Options: DENY  # Legacy browsers

# Prevent MIME sniffing
X-Content-Type-Options: nosniff

# Enable HSTS (HTTP Strict Transport Security)
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload

# Control referrer information
Referrer-Policy: strict-origin-when-cross-origin

# Control browser features
Permissions-Policy: camera=(), microphone=(), geolocation=()

# Prevent IE compatibility mode
X-UA-Compatible: IE=edge
```

Configure these in your CDN (Cloudflare, Vercel, Fastly) or reverse proxy rather than application code — they should apply to all responses including static assets.

### HTML Sanitization for User Content

When you must render user-supplied HTML (rich text editors, markdown with HTML), use a server-side sanitization library:

```typescript
import DOMPurify from 'isomorphic-dompurify';

// GOOD: Sanitize before storage and before rendering
function sanitizeUserHTML(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'br', 'blockquote'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    FORBID_ATTR: ['style', 'class', 'id'],
    ADD_ATTR: ['rel'],  // Ensure all links have rel="noopener noreferrer"
    FORCE_BODY: true,
  });
}

// BAD: Rendering user HTML without sanitization
function UnsafeComponent({ userContent }) {
  return <div dangerouslySetInnerHTML={{ __html: userContent }} />; // XSS risk
}

// GOOD: Sanitize before rendering
function SafeComponent({ userContent }) {
  return <div dangerouslySetInnerHTML={{ __html: sanitizeUserHTML(userContent) }} />;
}
```

**Always add `rel="noopener noreferrer"` to user-supplied links.** Without `noopener`, the linked page can access `window.opener` and redirect the original tab.

### OWASP Top 10 Mapping

| OWASP 2021 | Web App Mitigation |
|---|---|
| A01 Broken Access Control | Server-side authz on every endpoint; never trust client-claimed identity |
| A02 Cryptographic Failures | TLS everywhere; never store passwords in plaintext; use bcrypt/Argon2 |
| A03 Injection | Parameterized queries; ORM; never concatenate user input into SQL/shell commands |
| A04 Insecure Design | Threat model before building auth/payment flows |
| A05 Security Misconfiguration | Headers checklist; disable debug endpoints in production; rotate default credentials |
| A06 Vulnerable Components | `npm audit` in CI; Dependabot alerts; pin lockfile |
| A07 Auth Failures | PKCE; rate limiting on login; MFA; session timeout |
| A08 Software Integrity | SRI for CDN assets; verify npm package checksums; signed commits |
| A09 Logging Failures | Log auth events; alert on anomalies; never log passwords or tokens |
| A10 SSRF | Validate and restrict URLs in server-side fetch calls; block private IP ranges |

Run a security review against this checklist before the first production deployment and after any major auth or data flow change.
