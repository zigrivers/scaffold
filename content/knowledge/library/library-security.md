---
name: library-security
description: Supply chain security, dependency auditing, npm provenance, SBOM, and security policy for published libraries
topics: [library, security, supply-chain, npm-provenance, sbom, dependency-auditing, cve]
---

Library security is supply chain security. When a library is published to npm and installed by thousands of projects, a single compromised release or a malicious dependency can propagate vulnerabilities to all consumers simultaneously. The 2021 `ua-parser-js` incident and the 2022 `node-ipc` sabotage demonstrated that even widely-used libraries with established maintainers can be compromised. Library authors bear a responsibility to their consumers that application developers do not — a security failure in a library is a security failure for every project that depends on it.

## Summary

Library security encompasses four areas: dependency hygiene (minimal, audited, regularly updated dependencies), publish security (protected npm accounts, CI-based publishing with provenance), input validation (libraries that process untrusted input must handle malformed data safely), and disclosure (responsible vulnerability reporting process for consumers to report issues). Enable npm provenance on all published packages. Pin GitHub Actions to commit SHAs. Keep devDependencies patched and runtime dependencies minimal.

Core security practices:
- `npm audit` in CI — fail on high/critical vulnerabilities
- npm publish with `--provenance` for attestation
- Two-factor authentication on npm account
- Pin GitHub Actions to commit SHAs, not tags
- SECURITY.md with disclosure process
- Minimal runtime dependencies (each dep is an attack surface)

## Deep Guidance

### Dependency Auditing

Every dependency is a trust decision. Minimize trust surface:

**In CI, fail on vulnerabilities:**
```yaml
# .github/workflows/ci.yml
- name: Security audit
  run: npm audit --audit-level=high
  # Fails if any high or critical CVEs are found in dependencies
```

**Regular automated updates:**
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 10
    groups:
      devDependencies:
        dependency-type: development
```

Dependabot opens PRs for dependency updates weekly. Review them and merge; don't let them accumulate. Stale dependencies accumulate vulnerabilities.

**Audit devDependencies too:**
```bash
# npm audit includes devDependencies by default
npm audit

# Check only production dependencies (what consumers install)
npm audit --omit=dev
```

A vulnerability in a devDependency can compromise your CI pipeline and inject malicious code into the published package even if consumers never install the devDependency.

### npm Provenance

npm provenance creates a cryptographic link between a published package and the GitHub Actions workflow that built it. Consumers can verify that `my-library@1.0.0` was built from exactly commit `abc123` by the expected workflow:

```yaml
# .github/workflows/release.yml
jobs:
  release:
    permissions:
      id-token: write  # Required for provenance
      contents: read
    steps:
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

After publishing with `--provenance`, consumers can verify:
```bash
npm audit signatures my-library
# Verifies: Attestation verified for my-library@1.0.0
```

Provenance is essential for libraries installed in security-sensitive environments. Enable it on all public packages.

### npm Account Security

The npm account is the most critical attack surface for library security:

1. **Enable 2FA (mandatory):** npm.com → Account Settings → Two-Factor Authentication → Enable for auth and publishing
2. **Use Granular Access Tokens:** Create a publish token with `Automation` type and scope to specific packages only
3. **Rotate tokens regularly:** Invalidate and recreate publish tokens quarterly
4. **Use trusted publishing** (npm + GitHub Actions OIDC): Eliminates long-lived tokens entirely:

```bash
# npm trusted publishing: configure in npm package settings, then:
npm publish --provenance
# No NPM_TOKEN secret needed — GitHub OIDC provides the auth
```

Trusted publishing is the most secure approach — there is no token to steal, rotate, or accidentally expose in logs.

### Pinning GitHub Actions to Commit SHAs

GitHub Actions tags (like `actions/checkout@v4`) can be moved by the action author, making them effectively mutable. A compromised action author could update `v4` to inject malicious code. Pin to commit SHAs:

```yaml
# BAD: tag can be moved
- uses: actions/checkout@v4
- uses: actions/setup-node@v4

# GOOD: pinned to specific commit
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
- uses: actions/setup-node@39370e3970a6d050c480ffad4ff0ed4d3fdee5af  # v4.1.0
```

Use a tool like `renovate` or `pin-github-action` to automate SHA pinning and updates:

```bash
npx pin-github-action .github/workflows/*.yml
```

This converts all `@v4` references to pinned SHAs and creates a comment with the resolved version.

### Input Validation and Denial of Service

Libraries that parse untrusted input must handle malformed data defensively:

**ReDoS (Regular Expression Denial of Service):**
```typescript
// VULNERABLE: catastrophic backtracking on malformed input
const emailRegex = /^([a-zA-Z0-9]+)*@/

// SAFE: linear time regex or use a dedicated library
import { isEmail } from 'validator'  // battle-tested input validation library
```

Test regex performance with adversarial inputs:
```bash
npx vuln-regex-detector 'your regex here'
```

**Size limits for inputs:**
```typescript
export function parseConfig(input: string, options?: ParseOptions): Config {
  const maxSize = options?.maxSize ?? 1_048_576  // 1 MB default

  if (Buffer.byteLength(input, 'utf-8') > maxSize) {
    throw new ParseError(
      `Input exceeds maximum size of ${maxSize} bytes`,
      0, 0
    )
  }
  // ... parse
}
```

**Prototype pollution prevention:**
```typescript
// When merging user-provided objects, guard against prototype pollution
function mergeOptions<T extends object>(defaults: T, overrides: unknown): T {
  if (typeof overrides !== 'object' || overrides === null) return defaults
  // Guard against __proto__, constructor, prototype keys
  const safe = Object.fromEntries(
    Object.entries(overrides as Record<string, unknown>)
      .filter(([key]) => key !== '__proto__' && key !== 'constructor' && key !== 'prototype')
  )
  return { ...defaults, ...safe }
}
```

### SECURITY.md and Disclosure Policy

Every library must have a SECURITY.md file documenting how to report vulnerabilities:

```markdown
<!-- SECURITY.md -->
# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x     | Yes       |
| 1.x     | Security fixes only until 2025-01-01 |
| < 1.0   | No        |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report vulnerabilities via GitHub's private vulnerability reporting:
https://github.com/org/my-library/security/advisories/new

Or email: security@example.com

Include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Affected versions

**Response timeline:**
- Acknowledgment: within 48 hours
- Initial assessment: within 7 days
- Fix + disclosure: within 90 days (coordinated disclosure)

We follow [responsible disclosure](https://en.wikipedia.org/wiki/Responsible_disclosure).
```

### Software Bill of Materials (SBOM)

For libraries used in regulated industries (healthcare, finance, government), consumers may require an SBOM — a machine-readable list of all dependencies:

```yaml
# .github/workflows/release.yml
- name: Generate SBOM
  uses: anchore/sbom-action@v0
  with:
    format: spdx-json
    artifact-name: sbom.spdx.json

- name: Attach SBOM to release
  uses: softprops/action-gh-release@v2
  with:
    files: sbom.spdx.json
```

This generates a SPDX-format SBOM and attaches it to the GitHub Release. Consumers in regulated environments can use this to verify the library's dependency chain.

### Secret Detection

Never accidentally publish secrets in the library source:

```bash
# Add git-secrets or similar to pre-commit hooks
brew install git-secrets
git secrets --install
git secrets --register-aws

# Or use gitleaks:
brew install gitleaks
gitleaks protect --staged  # Pre-commit check
```

In CI:
```yaml
- name: Scan for secrets
  uses: trufflesecurity/trufflehog@main
  with:
    path: ./
    base: ${{ github.event.repository.default_branch }}
```

Never include `.env` files, API keys, private keys, or credentials in the published package. The `files` field in `package.json` is the allowlist — everything else is excluded. Verify with `npm pack --dry-run`.
