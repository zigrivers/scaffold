---
name: operations
description: Define operations, deployment, and dev environment strategy
phase: "quality"
order: 21
dependencies: [testing-strategy]
outputs: [docs/operations-runbook.md]
conditional: null
knowledge-base: [operations-runbook]
---

## Purpose
Define the operational strategy: CI/CD pipeline, deployment approach, monitoring
and alerting, incident response, rollback procedures, and dev environment setup.
This is both the production operations guide and the local development workflow.

## Inputs
- docs/system-architecture.md (required) — what to deploy
- docs/testing-strategy.md (required) — CI pipeline test stages
- docs/adrs/ (required) — infrastructure decisions

## Expected Outputs
- docs/operations-runbook.md — operations and deployment runbook

## Quality Criteria
- CI/CD pipeline defined with all stages (build, test, lint, deploy)
- Deployment strategy chosen with rollback procedure
- Monitoring covers key metrics (latency, error rate, saturation)
- Alerting thresholds are justified, not arbitrary
- Dev environment setup is documented and reproducible
- Incident response process defined

## Methodology Scaling
- **deep**: Full runbook. Deployment topology diagrams. Monitoring dashboard
  specs. Alert playbooks. DR plan. Capacity planning. Local dev with
  containers matching production.
- **mvp**: Basic CI/CD pipeline. Deploy command. How to run locally.
- **custom:depth(1-5)**: Depth 1-2: MVP-style. Depth 3: add monitoring and
  alerts. Depth 4-5: full runbook with DR.

## Mode Detection
Update mode if runbook exists.
