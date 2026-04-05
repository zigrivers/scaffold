---
name: live-ops-plan
description: Plan content cadence, event systems, hotfix deployment, maintenance windows, and content update pipeline
summary: "Plans the live operations strategy — content cadence aligned to player retention, event system design, hotfix deployment procedures, maintenance windows, and the content update pipeline from creation through certification to release."
phase: "quality"
order: 963
dependencies: [game-design-document, analytics-telemetry]
outputs: [docs/live-ops-plan.md]
conditional: "if-needed"
reads: [operations]
knowledge-base: [game-liveops-analytics]
---

## Purpose
Define the live operations strategy that sustains the game after launch. Live
ops is the practice of operating a game as a service — delivering regular
content updates, running time-limited events, deploying hotfixes without
extended downtime, and using analytics data to inform the content roadmap.

This plan bridges the gap between development (building the game) and
operations (running the game). It requires input from game design (what
content to deliver), analytics (which metrics indicate health), and
infrastructure (how to deploy updates safely). Without a live-ops plan,
post-launch content delivery becomes reactive and ad-hoc, leading to player
churn and operational incidents.

The plan covers five areas: content cadence (what ships and when), event
system design (how time-limited events are authored, scheduled, and
delivered), hotfix deployment (how to ship critical fixes outside the regular
cadence), maintenance windows (how to communicate and execute downtime), and
the content update pipeline (the workflow from content creation through QA,
certification, staging, and release).

## Conditional Evaluation
Enable when: the project configuration `onlineServices` includes `live-ops`,
or the GDD describes any of the following — seasonal content drops, battle
passes, live events, post-launch content roadmap, games-as-a-service model,
regular content updates, or any ongoing content delivery after initial release.

Skip when: the game is a ship-and-done product with no planned post-launch
content updates — premium single-player titles, arcade games, or any project
where the launch build is the final build (aside from bug-fix patches).

## Inputs
- docs/game-design.md (required) — content types, event mechanics, seasonal structure
- docs/analytics-plan.md (required) — KPIs that drive live-ops decisions, player retention metrics
- docs/plan.md (required) — launch timeline, post-launch support commitment
- docs/operations-runbook.md (optional, forward-read) — deployment pipeline, rollback procedures, monitoring infrastructure

## Expected Outputs
- docs/live-ops-plan.md — content cadence, event system design, hotfix
  deployment procedures, maintenance windows, and content update pipeline

## Quality Criteria
- (mvp) Content cadence defined: update frequency (weekly/biweekly/seasonal), content types per cadence tier (minor balance patches vs. major content drops), and target release day/time
- (mvp) Event system design: how time-limited events are authored (data-driven, not code-driven), event lifecycle (announcement → active → wind-down → rewards), event scheduling (calendar-based with remote config)
- (mvp) Hotfix deployment procedure: criteria for emergency hotfix (severity classification), approval chain, deployment steps, rollback trigger, player communication template
- (mvp) Maintenance window policy: scheduled maintenance cadence, advance notice period, expected duration, communication channels (in-game, social media, status page)
- (deep) Content update pipeline: creation (design + art + engineering) → internal QA → playtest → certification (if console) → staging → canary release → full rollout → post-release monitoring
- (deep) Content versioning and compatibility: how clients handle version mismatches, forced update vs. graceful degradation, asset bundle versioning for hot-loaded content
- (deep) Live-ops calendar: quarterly content roadmap template with theme, headline feature, supporting events, and target retention metric per update
- (deep) Feature flag and remote config integration: how live-ops uses feature flags for gradual rollout, kill switches for broken features, A/B testing for content variants
- (deep) Incident response for live-ops: when a content update causes issues (broken economy, exploitable event, server instability), escalation path, rollback decision tree, and player compensation policy

## Methodology Scaling
- **deep**: Full live-ops plan with quarterly content calendar, event system
  architecture, content update pipeline with certification gates, hotfix
  procedures with severity classification, maintenance window policy, feature
  flag integration, live-ops incident response, and player compensation
  framework. 15-25 pages.
- **mvp**: Content cadence, basic event system design, hotfix deployment
  procedure, and maintenance window policy. 4-8 pages.
- **custom:depth(1-5)**:
  - Depth 1: content update frequency and basic hotfix deployment procedure.
  - Depth 2: add event system design and maintenance window policy.
  - Depth 3: add content update pipeline, content versioning strategy, and live-ops calendar template.
  - Depth 4: add feature flag integration, incident response for live-ops, and certification gates in content pipeline.
  - Depth 5: full plan with player compensation framework, A/B testing for content variants, retention-driven content prioritization, and cross-platform content delivery synchronization.

## Mode Detection
Check for docs/live-ops-plan.md. If it exists, operate in update mode: read
existing plan and diff against current GDD content plans and analytics KPIs.
Preserve existing content cadence, event system design, and hotfix procedures.
Update pipeline stages if operations runbook changed deployment infrastructure.
Add new event types if GDD expanded seasonal content.

## Update Mode Specifics
- **Detect prior artifact**: docs/live-ops-plan.md exists
- **Preserve**: content cadence and release schedule, event system design,
  hotfix deployment procedures, maintenance window policy, live-ops calendar
  entries, player compensation precedents
- **Triggers for update**: GDD added new content types or event mechanics,
  analytics plan changed KPIs that drive content decisions, operations runbook
  changed deployment pipeline, target platforms changed (new certification
  requirements in content pipeline)
- **Conflict resolution**: if content cadence changes conflict with
  certification timelines (e.g., weekly updates impossible with console cert
  turnaround), document the constraint and propose a cadence that accommodates
  all target platforms; never promise a cadence the pipeline cannot sustain
