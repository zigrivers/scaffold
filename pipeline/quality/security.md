---
name: phase-10-security
description: Security review and documentation
phase: "10"
dependencies: [phase-09-operations]
outputs: [docs/security-review.md]
conditional: null
knowledge-base: [security-review]
---

## Purpose
Conduct a security review of the entire system design. Document security
controls, threat model, auth/authz approach, data protection, secrets
management, and dependency audit strategy.

## Inputs
- docs/system-architecture.md (required) — attack surface
- docs/api-contracts.md (optional) — auth/authz boundaries
- docs/database-schema.md (optional) — data protection needs
- docs/operations-runbook.md (required) — secrets and deployment security

## Expected Outputs
- docs/security-review.md — security review and controls document

## Quality Criteria
- OWASP top 10 addressed for this specific project
- Auth/authz boundaries defined and consistent with API contracts
- Data classified by sensitivity with handling requirements
- Secrets management strategy defined (no secrets in code)
- Threat model covers all trust boundaries
- Dependency audit integrated into CI

## Methodology Scaling
- **deep**: Full threat model (STRIDE). OWASP analysis per component.
  Data classification matrix. Secrets rotation plan. Penetration testing
  scope. Compliance checklist (if applicable).
- **mvp**: Key security controls. Auth approach. No secrets in code.
  Basic input validation strategy.
- **custom:depth(1-5)**: Depth 1-2: MVP-style. Depth 3: add threat model.
  Depth 4-5: full security review.

## Mode Detection
Update mode if review exists.
