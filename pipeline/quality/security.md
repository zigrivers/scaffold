---
name: security
description: Security review and documentation
phase: "quality"
order: 950
dependencies: [review-operations]
outputs: [docs/security-review.md]
reads: [system-architecture]
conditional: null
knowledge-base: [security-best-practices]
---

## Purpose
Conduct a security review of the entire system design. Document security
controls, threat model, auth/authz approach, data protection, secrets
management, and dependency audit strategy. The review covers OWASP Top 10
analysis specific to this project's stack and architecture, plus STRIDE
threat modeling across all trust boundaries.

## Inputs
- docs/system-architecture.md (required) — attack surface
- docs/api-contracts.md (optional) — auth/authz boundaries
- docs/database-schema.md (optional) — data protection needs
- docs/operations-runbook.md (required) — secrets and deployment security

## Expected Outputs
- docs/security-review.md — security review and controls document

## Quality Criteria
- (mvp) OWASP top 10 addressed for this specific project
- (mvp) Every API endpoint has authentication and authorization requirements specified
- (mvp) Auth/authz boundaries defined and consistent with API contracts
- (mvp) Input validation rules defined for each user-facing field (type, length, pattern)
- (deep) Data classified by sensitivity with handling requirements
- (mvp) Secrets management strategy documented with rotation policy (no hardcoded secrets in code)
- (deep) CORS policy explicitly configured per origin (not wildcard in production)
- (deep) Rate limiting defined for public-facing endpoints with specific thresholds
- (deep) Threat model covers all trust boundaries
- (deep) Dependency audit strategy documented (automated scanning, update cadence)
- (deep) Dependency audit integrated into CI

## Methodology Scaling
- **deep**: Full threat model (STRIDE). OWASP analysis per component.
  Data classification matrix. Secrets rotation plan. Penetration testing
  scope. Compliance checklist (if applicable).
- **mvp**: Key security controls. Auth approach. No secrets in code.
  Basic input validation strategy.
- **custom:depth(1-5)**: Depth 1-2: MVP-style. Depth 3: add threat model.
  Depth 4-5: full security review.

## Mode Detection
Check for docs/security-review.md. If it exists, operate in update mode: read
existing security controls and threat model, diff against current system
architecture and API contracts. Preserve existing threat model entries, auth
decisions, and data classification. Add new threat boundaries for new
components. Update auth requirements if API contracts changed.

## Update Mode Specifics
- **Detect prior artifact**: docs/security-review.md exists
- **Preserve**: threat model entries, data classification matrix, auth/authz
  decisions, secrets management strategy, dependency audit configuration,
  compliance checklist items
- **Triggers for update**: architecture added new components (new attack surface),
  API contracts changed auth requirements, database schema changed data
  sensitivity, operations runbook changed deployment security
- **Conflict resolution**: if a new component introduces a trust boundary
  that conflicts with existing auth approach, document both and flag for
  user decision; never weaken existing security controls without approval
