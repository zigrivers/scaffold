---
name: web-app-session-patterns
description: Session management architecture, JWT vs cookie sessions, refresh token rotation, session storage, and hijacking prevention
topics: [web-app, auth, sessions, jwt, cookies, security, redis]
---

Session management is the mechanism by which a web application recognizes a returning user between HTTP requests. Because HTTP is stateless, sessions are an application-level construct — and the design decisions here directly affect security, scalability, and user experience. The wrong session architecture causes token theft, session fixation attacks, memory exhaustion on the server, and logout failures that leave users permanently authenticated even after they believe they've signed out.

## Summary

### JWT vs Cookie Sessions

The two primary session patterns have fundamentally different security models:

**Cookie-based sessions (server-authoritative):**
- Server stores session state (database or Redis); client holds an opaque session ID in a cookie
- Immediate revocation: delete the session record and the user is logged out
- Scales horizontally when session storage is centralized (Redis cluster)
- HttpOnly + Secure + SameSite=Strict cookies resist XSS and CSRF simultaneously
- Each request requires a session store lookup — adds latency (~1–5 ms for Redis)

**JWT (stateless):**
- Server stores no session state; the signed token is the complete session
- No revocation without a token denylist (which re-introduces statefulness)
- Zero session store lookups per request — appropriate for stateless microservices
- Tokens can be stolen and reused until expiry — short expiry (15 minutes) is essential
- Refresh tokens enable long sessions without long-lived access tokens

**Rule of thumb:** Use cookie-based sessions for user-facing web apps where revocation matters. Use JWTs for service-to-service auth or APIs where clients are trusted and revocation is not required. Hybrid: short-lived JWTs + server-side refresh token rotation is the most common production pattern.

### Refresh Token Rotation

Refresh token rotation is the critical security mechanism for long-lived JWT sessions:

1. Access token expires in 15 minutes
2. Client uses refresh token to obtain a new access token + new refresh token
3. The old refresh token is immediately invalidated
4. If the old refresh token is ever presented again, all sessions for that user are terminated (token reuse detection indicates theft)

This pattern detects token theft: if an attacker steals a refresh token and uses it, the legitimate user's next refresh attempt will fail and force re-authentication, alerting the user and invalidating the attacker's session.

### Session Storage Backends

| Backend | Best For | Limits |
|---|---|---|
| Redis (single node) | Fast sessions, moderate scale | Single point of failure |
| Redis Cluster | High availability, large scale | Operational complexity |
| Redis Sentinel | Automatic failover for single-node Redis | Less scale than Cluster |
| Database (PostgreSQL) | Simpler stack, queryable sessions | Higher latency than Redis |
| In-process memory | Development only | Lost on restart, no horizontal scale |

For production, Redis is the standard choice: sub-millisecond lookups, TTL-based expiry is native, and session invalidation is an O(1) DEL command.

### Token Expiry Strategy

Define expiry per token type based on risk tolerance:

- **Access token**: 15 minutes — short enough to limit exposure if stolen
- **Refresh token**: 7–30 days — rotate on each use; invalidate on logout
- **Remember-me token**: 90 days — separate from standard refresh, requires stronger audit
- **Email verification token**: 24–48 hours — single-use, invalidate on consumption
- **Password reset token**: 1 hour — single-use, invalidate on consumption, invalidate all sessions on use

## Deep Guidance

### Secure Cookie Configuration

Every session cookie must be configured with all three security attributes:

```typescript
// Express.js session cookie configuration
app.use(session({
  name: '__Host-sessionId',  // __Host- prefix requires Secure + path=/ + no domain
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,       // Inaccessible to JavaScript — prevents XSS token theft
    secure: true,         // HTTPS only — prevents transmission over HTTP
    sameSite: 'strict',   // Not sent on cross-site requests — prevents CSRF
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days in milliseconds
    path: '/',
  },
  store: new RedisStore({ client: redisClient }),
}));
```

The `__Host-` cookie name prefix is a browser-enforced security policy that prevents subdomain hijacking — it requires `Secure`, `path=/`, and no `Domain` attribute. Use it for session cookies in production.

### Refresh Token Rotation Implementation

```typescript
interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
}

async function rotateRefreshToken(
  incomingRefreshToken: string
): Promise<TokenPair> {
  // 1. Look up the incoming refresh token
  const storedToken = await db.refreshToken.findUnique({
    where: { token: incomingRefreshToken },
    include: { user: true },
  });

  if (!storedToken) {
    // Token not found — could be expired, already rotated, or forged
    throw new AuthError('INVALID_REFRESH_TOKEN');
  }

  if (storedToken.usedAt !== null) {
    // REUSE DETECTED: token was already rotated — potential theft
    // Invalidate ALL refresh tokens for this user
    await db.refreshToken.updateMany({
      where: { userId: storedToken.userId },
      data: { revokedAt: new Date() },
    });
    throw new AuthError('TOKEN_REUSE_DETECTED');
  }

  if (storedToken.revokedAt !== null || storedToken.expiresAt < new Date()) {
    throw new AuthError('REFRESH_TOKEN_EXPIRED');
  }

  // 2. Mark old token as used (not deleted — needed for reuse detection)
  await db.refreshToken.update({
    where: { id: storedToken.id },
    data: { usedAt: new Date() },
  });

  // 3. Issue new token pair
  const newAccessToken = signAccessToken({ sub: storedToken.userId });
  const newRefreshToken = await db.refreshToken.create({
    data: {
      userId: storedToken.userId,
      token: generateSecureToken(),
      expiresAt: addDays(new Date(), 30),
      parentTokenId: storedToken.id,  // Track rotation chain
    },
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken.token,
    accessTokenExpiresAt: addMinutes(new Date(), 15),
  };
}
```

### Session Hijacking Prevention

Beyond secure cookies, defend against session hijacking at the application layer:

**IP binding (optional, use carefully):**
- Store the client IP at session creation and validate on each request
- Breaks for legitimate users on mobile networks (IP changes per cell tower)
- Use only for high-security flows (admin panels, bank-grade apps), not general user sessions

**User-Agent fingerprint:**
- Store a hash of the User-Agent string at session creation
- Validate on each request; suspicious changes invalidate the session
- Not a strong defense (UA is spoofable) but raises the cost of attack

**Session fixation prevention:**
- Always regenerate the session ID on successful authentication
- Never allow the session ID to be set via URL parameters (cookie-only)
- In Express: call `req.session.regenerate()` after successful login

**Concurrent session limits:**
- Track active session count per user in Redis
- On new login, offer the user the choice to log out other sessions or enforce a maximum
- Essential for compliance in regulated industries

### Redis Session Store with TTL

```typescript
import Redis from 'ioredis';
import RedisStore from 'connect-redis';

const redisClient = new Redis({
  host: process.env.REDIS_HOST,
  port: 6379,
  // Lazy connect — don't block startup if Redis is temporarily unavailable
  lazyConnect: true,
  // Retry strategy — exponential backoff
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
});

// Sessions expire automatically via Redis TTL — no cleanup job needed
const sessionStore = new RedisStore({
  client: redisClient,
  prefix: 'sess:',
  ttl: 7 * 24 * 60 * 60,  // 7 days in seconds
});

// Invalidate a specific session (logout)
async function invalidateSession(sessionId: string): Promise<void> {
  await redisClient.del(`sess:${sessionId}`);
}

// Invalidate all sessions for a user (force logout everywhere)
async function invalidateAllUserSessions(userId: string): Promise<void> {
  // Requires storing a user→sessions index in Redis
  const sessionIds = await redisClient.smembers(`user:sessions:${userId}`);
  if (sessionIds.length > 0) {
    await redisClient.del(...sessionIds.map(id => `sess:${id}`));
    await redisClient.del(`user:sessions:${userId}`);
  }
}
```

Maintain a `user:sessions:{userId}` Redis set to enable "logout everywhere" — essential for security incident response.
