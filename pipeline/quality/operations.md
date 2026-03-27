---
name: operations
description: Define deployment pipeline, deployment strategy, monitoring, alerting, and incident response
phase: "quality"
order: 21
dependencies: [review-testing]
outputs: [docs/operations-runbook.md]
conditional: null
knowledge-base: [operations-runbook]
---

## Purpose
Define the production operational strategy: deployment pipeline (extending the
base CI from git-workflow), deployment approach, monitoring and alerting, incident
response, and rollback procedures. References docs/dev-setup.md for local
development setup rather than redefining it.

## Inputs
- docs/system-architecture.md (required) — what to deploy
- docs/tdd-standards.md (required) — CI pipeline test stages
- docs/adrs/ (required) — infrastructure decisions
- docs/dev-setup.md (optional) — local dev setup to reference, not redefine
- docs/git-workflow.md (optional) — base CI pipeline to extend, not redefine

## Expected Outputs
- docs/operations-runbook.md — production operations and deployment runbook

## Quality Criteria
- Deployment pipeline extends existing CI (build, deploy, post-deploy stages)
- Does not redefine base CI stages (lint, test) from git-workflow
- Deployment strategy chosen with rollback procedure
- Monitoring covers key metrics (latency, error rate, saturation)
- Alerting thresholds are justified, not arbitrary
- References docs/dev-setup.md for local dev — does not redefine it
- Incident response process defined

## Methodology Scaling
- **deep**: Full runbook. Deployment topology diagrams. Monitoring dashboard
  specs. Alert playbooks. DR plan. Capacity planning.
- **mvp**: Deploy command. Basic monitoring. Rollback procedure.
- **custom:depth(1-5)**: Depth 1-2: MVP-style. Depth 3: add monitoring and
  alerts. Depth 4-5: full runbook with DR.

## Mode Detection
Update mode if runbook exists.
