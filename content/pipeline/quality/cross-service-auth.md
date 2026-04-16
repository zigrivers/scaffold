---
name: cross-service-auth
description: Define inter-service trust model — mTLS, service tokens, audience scoping
summary: "Designs the internal service identity and trust framework: mutual TLS configuration, service-to-service token issuance and validation, audience scoping, and zero-trust boundary definitions."
phase: "quality"
order: 952
dependencies: [security, service-ownership-map]
outputs: [docs/cross-service-auth.md]
reads: [inter-service-contracts]
conditional: null
knowledge-base: [multi-service-auth]
---

## Purpose
Define the inter-service trust model for multi-service systems: how services
establish identity, authenticate to one another, and enforce authorization at
service boundaries. Produces a document specifying the chosen trust mechanism
(mTLS, service tokens, or both), certificate or token lifecycle management,
audience scoping per service, and zero-trust boundary definitions. Complements
docs/security-review.md (which covers user-facing auth) by focusing exclusively
on machine-to-machine trust.

## Inputs
- docs/security-review.md (required) — user-facing auth controls and trust model
- docs/service-ownership-map.md (required) — which services communicate and
  who owns which trust boundary
- docs/inter-service-contracts.md (required) — auth mechanism noted per contract
- docs/system-architecture.md (optional) — service topology and transport choices
- docs/operations-runbook.md (optional) — certificate and secret rotation context

## Expected Outputs
- docs/cross-service-auth.md — inter-service trust model: identity approach,
  mTLS configuration, token issuance and validation, audience scoping, and
  zero-trust boundary definitions

## Quality Criteria
- (mvp) Trust mechanism chosen (mTLS, short-lived service tokens, or hybrid)
  with rationale tied to architecture constraints
- (mvp) Every cross-service call from the ownership map has an assigned trust
  mechanism (no gaps)
- (mvp) Audience scoping defined: each service token specifies the intended
  recipient service and is rejected outside that scope
- (mvp) Token issuance authority identified (internal token service, mesh
  control plane, or cloud IAM)
- (mvp) Certificate or token lifetime documented with rotation policy
- (deep) mTLS configuration specified: CA hierarchy, certificate SAN fields,
  validation rules, and revocation strategy
- (deep) Token claims schema documented (issuer, subject, audience, expiry,
  scope) with validation rules per receiving service
- (deep) Zero-trust boundary definitions: each service trusts no caller by
  default; allowed callers enumerated per service
- (deep) Service identity bootstrapping process documented (how a new service
  instance proves identity before receiving credentials)
- (deep) Token revocation or short-lived-token refresh strategy documented for
  compromise scenarios
- (deep) Lateral movement controls: a compromised service cannot escalate
  privileges or reach services outside its allowed caller list
- (deep) Auth enforcement point identified per contract (sidecar, library, or
  service-level middleware) so no contract relies on network-only isolation

## Methodology Scaling
- **deep**: Full zero-trust model. mTLS CA hierarchy with revocation strategy.
  Token claims schema with validation rules per service. Service identity
  bootstrapping. Lateral movement controls. Enforcement point per contract.
- **mvp**: Trust mechanism choice with rationale. Audience scoping. Token
  lifetime and rotation policy. Allowed-caller list per service.
- **custom:depth(1-5)**:
  - Depth 1: trust mechanism choice and audience scoping only.
  - Depth 2: add token lifetime, rotation policy, and allowed-caller list per service.
  - Depth 3: add token claims schema and validation rules; or mTLS CA hierarchy
    and SAN fields if mTLS is chosen.
  - Depth 4: add zero-trust boundary definitions, service identity bootstrapping,
    and enforcement point per contract.
  - Depth 5: full zero-trust model with lateral movement controls, revocation
    strategy, and compromise-scenario runbook.

## Mode Detection
Check for docs/cross-service-auth.md. If it exists, operate in update mode:
read the existing trust model and diff against the current service ownership
map, security review, and inter-service contracts. Preserve confirmed trust
mechanism choices, audience scoping rules, and rotation policies. Surface new
cross-service calls that lack an assigned trust mechanism. Flag contracts whose
auth mechanism changed in the inter-service contracts document.

## Update Mode Specifics
- **Detect prior artifact**: docs/cross-service-auth.md exists
- **Preserve**: confirmed trust mechanism, mTLS configuration, token claims
  schema, audience scoping rules, rotation policies, zero-trust boundary
  definitions, enforcement points
- **Triggers for update**: ownership map added a new cross-service call,
  security review changed the trust model, inter-service contracts updated
  an auth mechanism, architecture changed transport or added a new service
- **Conflict resolution**: if a new cross-service call introduces a caller
  that is not on the allowed-caller list of the target service, surface the
  gap and request an explicit approval decision before expanding the trust
  boundary; never silently widen a zero-trust boundary
