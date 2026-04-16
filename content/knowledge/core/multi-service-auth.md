---
name: multi-service-auth
description: Mutual TLS, service tokens, zero-trust architecture, and audience scoping
topics: [mtls, service-tokens, zero-trust, audience-scoping, token-rotation]
---

## Summary

Service-to-service authentication is distinct from user authentication. Services are long-running workloads with machine identities, not human users. Relying on network perimeter security ("inside the firewall means trusted") is insufficient for modern multi-service architectures. This document provides concrete guidance on mutual TLS for transport-level identity, service-to-service JWT patterns for application-level authorization, zero-trust principles, audience scoping to prevent token misuse, and secret rotation strategies. Every internal service call should be authenticated, authorized, and encrypted — regardless of whether it is within a private network.

## Zero-Trust Architecture Principles

### Never Trust the Network

The traditional security perimeter model assumes that traffic inside the network is trusted. Zero-trust inverts this: every request must be authenticated and authorized regardless of its source.

**Core zero-trust rules:**
1. Every service-to-service call is authenticated — no implicit trust based on network location.
2. Every service-to-service call is authorized — the caller must have explicit permission to call the specific endpoint.
3. All traffic is encrypted — no plaintext HTTP between services, even within a private VPC.
4. Least privilege — services request only the permissions they need, scoped to the minimum audience.
5. Assume breach — design for the case where one service is compromised. Lateral movement must be limited.

**Trade-offs (zero-trust):**
- (+) Compromised service cannot access all other services — blast radius is limited by explicit authorization.
- (+) Insider threat mitigation — a rogue actor who gains network access cannot impersonate services.
- (+) Audit trail — every service call has authenticated identity attached, enabling forensic analysis.
- (-) Operational complexity — certificates, tokens, and rotation must be managed as infrastructure.
- (-) Latency overhead — mTLS handshake and token validation add a few milliseconds per request.
- (-) Requires consistent adoption — a single service using HTTP without auth is a gap in the model.

### Identity for Workloads

Every service must have a cryptographic identity that other services can verify. The two primary models:

**Certificate-based identity (mTLS):** The service presents a TLS client certificate. The certificate's Subject or SAN identifies the service. Verification is done at the TLS layer.

**Token-based identity (JWT):** The service presents a signed token in the `Authorization` header. The token contains claims identifying the service. Verification is done at the application layer.

Use mTLS and JWTs together: mTLS at the transport layer for encryption and certificate-based authentication; JWTs at the application layer for fine-grained authorization claims. A service mesh (Istio, Linkerd) can handle mTLS transparently, leaving application-layer JWT for business authorization logic.

## Mutual TLS (mTLS)

### How mTLS Works

In standard TLS, the client verifies the server's certificate. In mutual TLS, both sides present certificates:

```
Client (Service A)                     Server (Service B)
     |                                         |
     |--- ClientHello ----------------------->  |
     |<-- ServerHello + Server Cert ----------- |
     |--- Client Cert + ClientKeyExchange ---->  |  (A proves identity to B)
     |<-- Finished (session established) ------  |
     |--- Encrypted request ------------------>  |  (B verifies A's cert)
     |<-- Encrypted response ------------------  |
```

Both sides verify that the certificate was signed by a trusted Certificate Authority (CA). The CA can be internal (managed by your organization) or a public CA.

### Certificate Management with Internal CA

For service meshes and internal APIs, an internal CA is the standard approach:

```bash
# Create internal CA using OpenSSL
openssl genrsa -out ca-key.pem 4096
openssl req -new -x509 -days 3650 -key ca-key.pem -out ca-cert.pem \
  -subj "/C=US/O=Acme Corp/CN=Acme Internal CA"

# Generate service certificate (for order-service)
openssl genrsa -out order-service-key.pem 2048
openssl req -new -key order-service-key.pem -out order-service.csr \
  -subj "/C=US/O=Acme Corp/CN=order-service"

# Sign with internal CA — certificate expires in 90 days (rotate frequently)
openssl x509 -req -days 90 -in order-service.csr \
  -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial \
  -out order-service-cert.pem \
  -extfile <(printf "subjectAltName=DNS:order-service,DNS:order-service.production.svc.cluster.local")
```

### mTLS Configuration in Node.js

```typescript
import https from 'https';
import fs from 'fs';
import tls from 'tls';

// Server: require client certificates
const serverOptions: https.ServerOptions = {
  key: fs.readFileSync('/etc/certs/order-service-key.pem'),
  cert: fs.readFileSync('/etc/certs/order-service-cert.pem'),
  ca: fs.readFileSync('/etc/certs/ca-cert.pem'),
  requestCert: true,          // Request client certificate
  rejectUnauthorized: true,   // Reject if client cert is not trusted by CA
};

const server = https.createServer(serverOptions, (req, res) => {
  const clientCert = (req.socket as tls.TLSSocket).getPeerCertificate();

  if (!clientCert || !clientCert.subject) {
    res.writeHead(401);
    res.end('Client certificate required');
    return;
  }

  // Extract service identity from certificate subject
  const callerServiceName = clientCert.subject.CN;

  // Authorize: check if this service is allowed to call this endpoint
  if (!isAuthorized(callerServiceName, req.method, req.url)) {
    res.writeHead(403);
    res.end(`Service ${callerServiceName} not authorized for this endpoint`);
    return;
  }

  // Attach caller identity to request context for audit logging
  (req as any).callerService = callerServiceName;
  handleRequest(req, res);
});

// Client: present certificate when calling other services
const clientOptions: https.RequestOptions = {
  key: fs.readFileSync('/etc/certs/order-service-key.pem'),
  cert: fs.readFileSync('/etc/certs/order-service-cert.pem'),
  ca: fs.readFileSync('/etc/certs/ca-cert.pem'),   // Trust internal CA only
  rejectUnauthorized: true,
};

async function callInventoryService(path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'inventory-service', port: 443, path, ...clientOptions },
      (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }
    );
    req.on('error', reject);
    req.end();
  });
}
```

### mTLS in Kubernetes with Istio

If using a service mesh, mTLS is handled transparently at the sidecar layer — application code does not need to manage certificates:

```yaml
# Istio PeerAuthentication — require mTLS for all services in namespace
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: production
spec:
  mtls:
    mode: STRICT   # STRICT = require mTLS; PERMISSIVE = allow both (for migration)
---
# Istio AuthorizationPolicy — control which services can call order-service
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: order-service-authz
  namespace: production
spec:
  selector:
    matchLabels:
      app: order-service
  rules:
    - from:
        - source:
            principals:
              # Only allow calls from these service identities (SPIFFE URIs)
              - "cluster.local/ns/production/sa/checkout-service"
              - "cluster.local/ns/production/sa/fulfillment-service"
      to:
        - operation:
            methods: ["GET", "POST"]
            paths: ["/orders", "/orders/*"]
```

**Trade-offs (mTLS):**
- (+) Encryption and mutual authentication in one mechanism — transport and identity together.
- (+) Certificate-based identity is cryptographically strong. Cannot be forged without the private key.
- (+) Service mesh handles certificate rotation automatically (Istio rotates every 24 hours by default).
- (-) Certificate management complexity — requires a CA, cert distribution, rotation automation.
- (-) TLS handshake adds latency (~1-5ms for the initial connection).
- (-) Debugging TLS issues requires familiarity with certificate tooling (openssl, istioctl).

## Service-to-Service JWT Patterns

### Why JWTs for Inter-Service Auth

While mTLS provides transport-level identity, JWTs provide application-level claims that carry richer context:

- Which service is calling (subject)
- Which service is the intended recipient (audience)
- What permissions the caller has (scopes)
- The user context being acted on behalf of (propagated user identity)

This enables fine-grained authorization at the application layer, independent of network topology.

### Token Issuance

An internal token issuer (auth service or a shared library) signs JWTs with a private key. Other services verify signatures using the corresponding public key.

```typescript
import jwt from 'jsonwebtoken';
import fs from 'fs';

const PRIVATE_KEY = fs.readFileSync('/etc/secrets/service-signing-key.pem');
const TOKEN_TTL_SECONDS = 300; // 5 minutes — short-lived for internal tokens

interface ServiceTokenClaims {
  iss: string;        // Issuer: which service issued the token
  sub: string;        // Subject: the calling service's identity
  aud: string;        // Audience: the specific target service
  iat: number;        // Issued at
  exp: number;        // Expiration
  jti: string;        // JWT ID — unique token identifier (for replay prevention)
  scope: string[];    // Authorized scopes for this token
  // Optional: propagate user context
  user_id?: string;
  user_roles?: string[];
}

function issueServiceToken(options: {
  callerService: string;
  targetService: string;
  scopes: string[];
  userContext?: { userId: string; roles: string[] };
}): string {
  const claims: ServiceTokenClaims = {
    iss: options.callerService,
    sub: options.callerService,
    aud: options.targetService,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    jti: crypto.randomUUID(),
    scope: options.scopes,
    ...(options.userContext && {
      user_id: options.userContext.userId,
      user_roles: options.userContext.roles,
    }),
  };

  return jwt.sign(claims, PRIVATE_KEY, { algorithm: 'RS256' });
}
```

### Token Validation

```typescript
import jwt, { JwtPayload } from 'jsonwebtoken';

// Load public keys from a JWKS endpoint or static file
// In production: use a JWKS endpoint so keys can rotate without redeployment
const PUBLIC_KEYS = loadPublicKeys('/etc/certs/service-signing-pub.pem');

interface ValidationOptions {
  expectedAudience: string;      // This service's identity
  allowedIssuers: string[];      // Which services are authorized to call
  requiredScopes?: string[];     // Scopes required for this endpoint
}

async function validateServiceToken(
  token: string,
  options: ValidationOptions,
): Promise<ServiceTokenClaims> {
  let claims: JwtPayload;

  try {
    claims = jwt.verify(token, PUBLIC_KEYS, {
      algorithms: ['RS256'],
      audience: options.expectedAudience,
      clockTolerance: 5, // Allow 5 seconds of clock skew
    }) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthError('TOKEN_EXPIRED', 'Service token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthError('TOKEN_INVALID', 'Service token signature is invalid');
    }
    throw error;
  }

  // Verify issuer is an authorized caller
  if (!options.allowedIssuers.includes(claims.iss as string)) {
    throw new AuthError('UNAUTHORIZED_ISSUER', `Service ${claims.iss} is not authorized`);
  }

  // Verify audience matches this service (prevents token reuse across services)
  if (claims.aud !== options.expectedAudience) {
    throw new AuthError('AUDIENCE_MISMATCH', 'Token was not issued for this service');
  }

  // Verify required scopes are present
  if (options.requiredScopes) {
    const tokenScopes = new Set<string>(claims.scope as string[]);
    const missingScopes = options.requiredScopes.filter(s => !tokenScopes.has(s));
    if (missingScopes.length > 0) {
      throw new AuthError('INSUFFICIENT_SCOPE', `Missing scopes: ${missingScopes.join(', ')}`);
    }
  }

  return claims as unknown as ServiceTokenClaims;
}

// Express middleware
function requireServiceAuth(requiredScopes?: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: { code: 'MISSING_TOKEN' } });
    }

    const token = authHeader.slice(7);

    try {
      const claims = await validateServiceToken(token, {
        expectedAudience: 'order-service',
        allowedIssuers: ['checkout-service', 'fulfillment-service', 'admin-service'],
        requiredScopes,
      });

      req.callerService = claims.sub;
      req.callerScopes = claims.scope;
      if (claims.user_id) req.propagatedUserId = claims.user_id;

      next();
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(401).json({ error: { code: error.code, message: error.message } });
      }
      next(error);
    }
  };
}
```

**Trade-offs (service JWTs):**
- (+) Rich authorization claims — scopes, propagated user context, audience constraints.
- (+) Stateless validation — verifying a JWT requires only the public key, no database lookup.
- (+) Short TTL limits the window for a stolen token to be used.
- (-) Cannot revoke individual tokens before expiry (use short TTLs to limit damage).
- (-) Public key distribution requires a JWKS endpoint or coordinated rotation.
- (-) Token forwarding risk — a compromised service could forward its tokens to other services.

## Audience Scoping

### Why Audience Scoping Matters

Without audience scoping, a token issued for service A can be used to call service B. If an attacker steals a token from service A's request, they can replay it against any service.

**The attack without audience scoping:**
```
Attacker intercepts token from A → B request
Attacker replays token to call C (which A has no business calling)
C accepts the token because it's validly signed
```

**With audience scoping:**
```
Token for A → B includes aud: "service-B"
Attacker replays token to call C
C rejects: aud "service-B" does not match "service-C"
```

### Audience Scoping Patterns

**Per-service audiences:** Each service has a unique audience identifier. Tokens are issued with a specific target service's audience.

```typescript
// Token issued by checkout-service to call order-service
const token = issueServiceToken({
  callerService: 'checkout-service',
  targetService: 'order-service',  // aud: "order-service"
  scopes: ['orders:create', 'orders:read'],
});

// This token cannot be used to call inventory-service
// inventory-service expects aud: "inventory-service"
```

**Per-operation audiences:** For even tighter scoping, include the operation in the audience:

```typescript
// Token scoped to a specific endpoint
const token = issueServiceToken({
  callerService: 'billing-service',
  targetService: 'order-service:GET:/orders/:id',
  scopes: ['orders:read'],
});
```

**Trade-offs (audience scoping):**
- (+) Stolen tokens cannot be replayed against arbitrary services.
- (+) Defense-in-depth: limits blast radius if one service is compromised.
- (-) More tokens to manage — each service pair requires separate token issuance.
- (-) Token caching becomes harder — a token cached for A→B cannot be reused for A→C.

### Token Caching for Performance

Short-lived tokens (5 minutes) require frequent issuance. Cache tokens with a safety margin:

```typescript
class ServiceTokenCache {
  private cache = new Map<string, { token: string; expiresAt: number }>();
  private readonly SAFETY_MARGIN_MS = 30_000; // Refresh 30s before expiry

  async getToken(callerService: string, targetService: string, scopes: string[]): Promise<string> {
    const cacheKey = `${callerService}:${targetService}:${scopes.sort().join(',')}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiresAt - Date.now() > this.SAFETY_MARGIN_MS) {
      return cached.token;
    }

    const token = await issueServiceToken({ callerService, targetService, scopes });
    const decoded = jwt.decode(token) as JwtPayload;

    this.cache.set(cacheKey, {
      token,
      expiresAt: (decoded.exp ?? 0) * 1000,
    });

    return token;
  }
}
```

## SPIFFE/SPIRE Identity Framework

### What SPIFFE Provides

SPIFFE (Secure Production Identity Framework for Everyone) is an open standard for workload identity in multi-cloud and multi-cluster environments. SPIRE is its reference implementation.

**Core concept:** Every workload gets a SPIFFE Verifiable Identity Document (SVID) — a short-lived X.509 certificate or JWT containing a SPIFFE ID:

```
spiffe://trust-domain/path/to/workload

# Examples:
spiffe://acme.com/ns/production/sa/order-service
spiffe://acme.com/ns/production/sa/checkout-service
```

### SPIRE Architecture

```
SPIRE Server (runs once per cluster/region)
  ↓ issues SVIDs via workload API
SPIRE Agent (runs on every node as DaemonSet)
  ↓ attests workload identity
Workload (your service)
  ↓ presents SVID for mTLS or JWT auth
```

**SPIRE agent configuration:**

```hcl
# spire-agent.conf
agent {
  data_dir     = "/var/lib/spire/agent"
  log_level    = "INFO"
  trust_domain = "acme.com"
  server_address = "spire-server.spire.svc.cluster.local"
  server_port  = 8081
}

plugins {
  KeyManager "disk" {
    plugin_data {
      directory = "/var/lib/spire/agent/keys"
    }
  }

  NodeAttestor "k8s_psat" {
    plugin_data {
      cluster = "production-cluster"
    }
  }

  WorkloadAttestor "k8s" {
    plugin_data {
      skip_kubelet_verification = false
    }
  }
}
```

**SPIRE registration entry (maps workload to SPIFFE ID):**

```bash
# Register order-service workload
spire-server entry create \
  -spiffeID spiffe://acme.com/ns/production/sa/order-service \
  -parentID spiffe://acme.com/spire/agent/k8s_psat/production-cluster/node1 \
  -selector k8s:ns:production \
  -selector k8s:sa:order-service \
  -ttl 3600
```

**Trade-offs (SPIFFE/SPIRE):**
- (+) Automated workload identity — no manual certificate management per service.
- (+) Short-lived SVIDs (hours, not years) — compromise window is narrow.
- (+) Works across clouds, clusters, and on-premises — not tied to one provider.
- (-) Operational overhead — SPIRE Server and Agent fleet must be highly available.
- (-) Learning curve — SPIFFE concepts and SPIRE configuration are non-trivial.
- (-) Not necessary for single-cluster deployments where Istio/Linkerd already provide workload identity.

**Use SPIFFE/SPIRE when:** Multi-cloud or multi-cluster architectures where workload identity must span infrastructure boundaries, or when you need a provider-agnostic identity standard.

## Secret Rotation Strategies

### Rotation Principles

Secrets that never rotate are a liability: a leaked secret is valid forever. All credentials — certificates, tokens, API keys, database passwords — should be rotated on a schedule shorter than your expected breach detection time.

**Target rotation windows:**
- mTLS certificates: 24–90 days (Istio default: 24 hours)
- Service JWT signing keys: 30–90 days
- Database passwords: 30–90 days
- API keys (third-party): 90–365 days (limited by provider)
- Secrets in Kubernetes: sync with source on every deployment

### Zero-Downtime Key Rotation

Rotating JWT signing keys requires a transition period where both old and new keys are valid:

```typescript
// JWKS endpoint — serves multiple active keys
// Tokens signed with old key are still valid until they expire
// New tokens are signed with the new key
app.get('/.well-known/jwks.json', (req, res) => {
  res.json({
    keys: [
      // New key (primary — used for signing new tokens)
      {
        kid: 'key-2026-04',
        kty: 'RSA',
        use: 'sig',
        alg: 'RS256',
        n: newKeyPublicN,
        e: 'AQAB',
      },
      // Old key (secondary — only for verifying tokens signed before rotation)
      // Remove this entry after all old tokens have expired (after max TTL)
      {
        kid: 'key-2026-01',
        kty: 'RSA',
        use: 'sig',
        alg: 'RS256',
        n: oldKeyPublicN,
        e: 'AQAB',
      },
    ],
  });
});

// Validator: try all active public keys — succeeds if any key verifies the token
async function verifyWithAnyActiveKey(token: string): Promise<JwtPayload> {
  const header = jwt.decode(token, { complete: true })?.header;
  const kid = header?.kid;

  // Try the specific key if kid is present
  if (kid) {
    const key = getKeyById(kid);
    if (!key) throw new AuthError('UNKNOWN_KEY_ID', `Key ${kid} not found`);
    return jwt.verify(token, key, { algorithms: ['RS256'] }) as JwtPayload;
  }

  // No kid — try all active keys
  for (const key of getActivePublicKeys()) {
    try {
      return jwt.verify(token, key, { algorithms: ['RS256'] }) as JwtPayload;
    } catch {
      continue;
    }
  }

  throw new AuthError('TOKEN_INVALID', 'No active key could verify this token');
}
```

### Secret Management Infrastructure

```typescript
// Kubernetes Secret with rotation via external-secrets-operator
// Syncs from AWS Secrets Manager / HashiCorp Vault on a schedule
```

```yaml
# external-secrets-operator ExternalSecret
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: order-service-secrets
  namespace: production
spec:
  refreshInterval: 1h            # Re-sync from source every hour
  secretStoreRef:
    name: aws-secretsmanager
    kind: ClusterSecretStore
  target:
    name: order-service-secrets  # Kubernetes Secret name
    creationPolicy: Owner
    template:
      engineVersion: v2
      data:
        DATABASE_URL: "{{ .db_url }}"
        JWT_SIGNING_KEY: "{{ .jwt_private_key }}"
  data:
    - secretKey: db_url
      remoteRef:
        key: production/order-service/database
        property: url
    - secretKey: jwt_private_key
      remoteRef:
        key: production/order-service/jwt
        property: private_key
```

**Trade-offs (rotation):**
- (+) Limits the damage window if a secret is leaked — the leaked value expires.
- (+) Forces secret hygiene — stale secrets are cleaned up on a schedule.
- (-) Requires automation — manual rotation at scale is error-prone and skipped.
- (-) Rotation bugs cause outages — test rotation in staging before enabling in production.

## Propagating User Context

When a user's request causes service A to call service B, service B may need to know who the original user is (for authorization, audit logging, or personalization). The user context must be propagated securely.

```typescript
// Service A: propagate user context in the outgoing service token
const token = issueServiceToken({
  callerService: 'checkout-service',
  targetService: 'order-service',
  scopes: ['orders:create'],
  userContext: {
    userId: req.user.id,
    roles: req.user.roles,
  },
});

// Service B: extract and use the propagated user context
app.post('/orders', requireServiceAuth(['orders:create']), async (req, res) => {
  const userId = req.propagatedUserId; // Set by auth middleware from JWT claims

  // Use for authorization: can this user create an order?
  const user = await userService.getUser(userId);
  if (!user.canPlaceOrders()) {
    return res.status(403).json({ error: { code: 'USER_NOT_AUTHORIZED' } });
  }

  // Use for audit logging: attribute the action to the user, not the service
  logger.info({ userId, callerService: req.callerService }, 'Creating order on behalf of user');

  const order = await createOrder({ userId, ...req.body });
  res.status(201).json(order);
});
```

**Trade-offs:**
- (+) Service B has full context for authorization and audit — the user identity is not lost in the call chain.
- (-) Never use the propagated user context without also verifying the caller service is authorized. A malicious caller could forge user context claims if the token itself is valid.

## Common Pitfalls

**Network trust without mTLS.** Assuming that traffic inside a VPC or Kubernetes cluster is trusted. A compromised pod can make requests to any other pod. Fix: enforce mTLS between all services. Use a service mesh with STRICT mTLS mode.

**Long-lived service credentials.** API keys or static tokens that never expire. A leaked credential is valid indefinitely. Fix: use short-lived JWTs (5-15 minutes) and automate rotation of all longer-lived credentials.

**No audience validation.** Tokens are validated for signature but not audience. A token issued for service A can be replayed against service B. Fix: always validate the `aud` claim matches the expected audience for this service.

**Broad token scopes.** Issuing tokens with `scope: ["*"]` or all permissions. A compromised caller can do anything its target service allows. Fix: request and grant minimum required scopes per operation.

**Secret sprawl.** Secrets hard-coded in environment variables, config files, or source code. Rotation requires redeployment. Fix: use a secrets manager (Vault, AWS Secrets Manager) and inject secrets at runtime via external-secrets-operator or equivalent.

**Missing token replay prevention.** The same JWT can be presented multiple times within its validity window. Fix: for high-value operations, maintain a token revocation list keyed by `jti` and reject tokens whose `jti` has been seen within the validity window.

**Certificate pinning without rotation plan.** Hard-coding a certificate's fingerprint in a service for "extra security." When the certificate rotates, the pinned service breaks. Fix: pin the CA certificate, not the leaf certificate — or use the JWKS endpoint pattern for key distribution.

## See Also

- [multi-service-architecture](./multi-service-architecture.md) — Service discovery and networking topology
- [multi-service-api-contracts](./multi-service-api-contracts.md) — API versioning, retries, and idempotency
- [security-best-practices](./security-best-practices.md) — OWASP Top 10, secrets management, and threat modeling
