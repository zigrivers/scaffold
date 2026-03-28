---
name: operations
description: Define deployment pipeline, deployment strategy, monitoring, alerting, and incident response
phase: "quality"
order: 930
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
- Deployment pipeline has explicit stages (build → test → deploy → verify → rollback-ready)
- Does not redefine base CI stages (lint, test) from git-workflow
- Deployment strategy chosen with rollback procedure
- Rollback procedure tested with specific trigger conditions (e.g., error rate > X%, health check failure)
- Runbook structured by operational scenario (deployment, rollback, incident, scaling)
- Monitoring covers key metrics (latency, error rate, saturation)
- Each monitoring metric has an explicit threshold with rationale
- Health check endpoints defined with expected response codes and latency bounds
- Log aggregation strategy specifies retention period and searchable fields
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
Check for docs/operations-runbook.md. If it exists, operate in update mode:
read existing runbook and diff against current system architecture, ADRs, and
deployment configuration. Preserve existing deployment procedures, monitoring
thresholds, and incident response processes. Update deployment pipeline stages
if architecture changed. Never modify rollback procedures without user approval.

## Update Mode Specifics
- **Detect prior artifact**: docs/operations-runbook.md exists
- **Preserve**: deployment procedures, monitoring thresholds, alerting rules,
  incident response processes, rollback procedures, environment-specific
  configurations
- **Triggers for update**: architecture changed deployment topology, new ADRs
  changed infrastructure, security review identified operational requirements,
  CI pipeline changed (new stages to extend)
- **Conflict resolution**: if architecture changed the deployment target,
  update deployment stages but preserve monitoring and alerting sections;
  verify runbook does not redefine base CI stages from git-workflow.md
