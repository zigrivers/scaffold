---
name: analytics-telemetry
description: Define event taxonomy, crash telemetry, KPI funnels, data pipeline, and privacy compliance for game analytics
summary: "Defines the game analytics layer — event taxonomy with schema versioning, crash telemetry for all games, expanded KPIs and funnels for live-service, data pipeline architecture, offline buffering, and privacy compliance (GDPR/COPPA)."
phase: "quality"
order: 962
dependencies: [game-design-document]
outputs: [docs/analytics-plan.md]
conditional: null
reads: [system-architecture, operations, economy-design]
knowledge-base: [game-liveops-analytics]
---

## Purpose
Define the analytics and telemetry strategy that provides data-driven insight
into player behavior, game health, and business performance. Analytics exists on
a spectrum: every game needs crash telemetry and basic session tracking, while
live-service games need full KPI dashboards, funnel analysis, A/B testing
infrastructure, and real-time alerting.

This plan establishes a structured event taxonomy — a shared vocabulary of
named events with versioned schemas — so that every system emitting telemetry
uses consistent event names, payload shapes, and semantic conventions. Without
a taxonomy, analytics data becomes a disorganized collection of ad-hoc events
that analysts cannot reliably query.

The plan also addresses the data pipeline end-to-end: client-side event
buffering (critical for mobile and offline scenarios), transport and ingestion,
storage and querying, and privacy compliance. GDPR consent flows, COPPA
age-gating, and data retention policies must be designed into the telemetry
system — not retrofitted after launch.

## Inputs
- docs/game-design.md (required) — core loop, progression, monetization model informing which events to track
- docs/plan.md (required) — target platforms, target markets (privacy jurisdiction), business model
- docs/system-architecture.md (optional, forward-read) — backend service topology for data pipeline integration
- docs/operations-runbook.md (optional, forward-read) — monitoring and alerting infrastructure to extend
- docs/economy-design.md (optional, forward-read) — transaction events, currency flow metrics, monetization KPIs

## Expected Outputs
- docs/analytics-plan.md — event taxonomy, crash telemetry specification, KPI
  definitions, data pipeline architecture, offline buffering strategy, QA
  validation plan, and privacy compliance

## Quality Criteria
- (mvp) Event taxonomy defined: hierarchical naming convention (category.action.label), payload schema per event, schema version field for forward compatibility
- (mvp) Crash telemetry specified for all platforms: crash report collection (stack traces, device info, game state snapshot), symbolication pipeline, crash-free session rate target
- (mvp) Session tracking: session start/end events, session duration, platform and device metadata, build version
- (mvp) QA validation plan: how to verify events fire correctly (debug overlay, event log viewer, automated event assertion tests), schema validation at ingestion
- (mvp) Privacy compliance: GDPR consent flow (opt-in before tracking in EU), COPPA handling (no PII collection for under-13), data retention policy with deletion capability
- (deep) KPI definitions for live-service: DAU/MAU, retention (D1/D7/D30), session length distribution, revenue per user (ARPU/ARPPU), conversion funnel stages
- (deep) Funnel analysis: player progression funnel (tutorial → first session → core loop engagement → retention), monetization funnel (browse → view item → purchase → repeat purchase), churn prediction signals
- (deep) A/B testing infrastructure: experiment assignment, variant tracking, statistical significance methodology, guardrail metrics that halt experiments
- (deep) Data pipeline architecture: client-side batching and offline buffering (queue events when offline, flush on reconnect with deduplication), transport (HTTPS batch POST with retry), ingestion service, storage (event warehouse), query layer
- (deep) Real-time alerting: crash rate spike detection, revenue anomaly detection, concurrent player count monitoring, automated incident creation from telemetry thresholds

### Live-Service Conditional Sections
When the game includes live-service elements (battle passes, seasonal content,
live events, real-money monetization), the analytics plan expands to include:
- Economy health metrics: currency inflation rate, sink/faucet ratio tracking, whale concentration index
- Content engagement metrics: event participation rate, content completion rate, seasonal retention lift
- Matchmaking quality metrics: queue times, skill rating accuracy, match satisfaction survey correlation

## Methodology Scaling
- **deep**: Full analytics plan with comprehensive event taxonomy, crash
  telemetry, live-service KPI suite, funnel analysis, A/B testing
  infrastructure, data pipeline architecture with offline buffering, real-time
  alerting, and privacy compliance per jurisdiction. 15-25 pages.
- **mvp**: Event taxonomy, crash telemetry, session tracking, QA validation
  plan, and privacy compliance essentials. 4-8 pages.
- **custom:depth(1-5)**:
  - Depth 1: crash telemetry and session tracking with basic event naming convention.
  - Depth 2: add structured event taxonomy with schema versioning and privacy compliance.
  - Depth 3: add KPI definitions, progression funnel, QA validation plan, and offline buffering strategy.
  - Depth 4: add A/B testing infrastructure, data pipeline architecture, monetization funnel, and real-time alerting.
  - Depth 5: full specification with economy health metrics, matchmaking quality metrics, churn prediction, and multi-jurisdiction privacy compliance.

## Mode Detection
Check for docs/analytics-plan.md. If it exists, operate in update mode: read
existing plan and diff against current GDD features and system architecture.
Preserve existing event taxonomy entries, KPI definitions, and privacy
compliance decisions. Add events for new gameplay systems. Update pipeline
architecture if system-architecture changed backend topology.

## Update Mode Specifics
- **Detect prior artifact**: docs/analytics-plan.md exists
- **Preserve**: event taxonomy entries (never rename events that may already be
  in production), KPI definitions and thresholds, privacy compliance decisions,
  crash telemetry configuration, data retention policy
- **Triggers for update**: GDD added new gameplay systems (new events needed),
  system architecture changed backend topology (pipeline integration needs
  updating), economy design added new transaction types (new monetization
  events), target markets changed (new privacy jurisdictions), operations
  runbook changed monitoring infrastructure
- **Conflict resolution**: if a new feature requires an event name that
  conflicts with an existing taxonomy entry, version the new event rather than
  renaming the existing one; never break backward compatibility of event
  schemas already in production
