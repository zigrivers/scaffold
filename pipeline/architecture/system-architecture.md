---
name: system-architecture
description: Design and document system architecture
summary: "Designs the system blueprint — which components exist, how data flows between them, where each module lives in the directory tree, and where extension points allow custom behavior."
phase: "architecture"
order: 710
dependencies: [review-adrs]
outputs: [docs/system-architecture.md]
reads: [create-prd, domain-modeling, adrs]
conditional: null
knowledge-base: [system-architecture, domain-modeling]
---

## Purpose
Design and document the system architecture, translating domain models and ADR
decisions into a concrete component structure, data flows, and module
organization. Project directory structure and module organization are defined
here. This is the blueprint that agents reference when deciding where code
lives and how components communicate.

## Inputs
- docs/domain-models/ (required) — domain models from modeling phase
- docs/adrs/ (required) — architecture decisions from decisions phase
- docs/plan.md (required) — requirements driving architecture

## Expected Outputs
- docs/system-architecture.md — architecture document with component design,
  data flows, module structure, and extension points

## Quality Criteria
- (mvp) Every domain model lands in a component or module
- (mvp) Every ADR constraint is respected in the architecture
- (mvp) All components appear in at least one data flow diagram
- (deep) Each extension point has interface definition, example usage scenario, and constraints on what can/cannot be extended
- (mvp) System components map to modules defined in docs/project-structure.md
- (deep) Component diagram shows all system components from domain models plus infrastructure
- (deep) Data flow diagrams cover all happy-path user journeys from Must-have stories

## Methodology Scaling
- **deep**: Full architecture document. Component diagrams, data flow diagrams,
  module structure with file-level detail, state management design, extension
  point inventory, deployment topology.
- **mvp**: High-level component overview. Key data flows. Enough structure for
  an agent to start building without ambiguity.
- **custom:depth(1-5)**: Depth 1: high-level component overview with key data
  flows. Depth 2: component overview with module boundaries and primary data
  flows. Depth 3: add component diagrams, module boundaries, and state
  management design. Depth 4: full architecture with extension point inventory,
  deployment topology, and file-level module detail. Depth 5: full architecture
  with cross-cutting concern analysis, failure mode documentation, and
  scalability annotations.

## Mode Detection
If outputs already exist, operate in update mode: read existing content, diff
against current project state and new ADRs, propose targeted updates rather
than regenerating.

## Update Mode Specifics
- **Detect prior artifact**: docs/system-architecture.md exists
- **Preserve**: component structure, data flow diagrams, module organization,
  extension points, deployment topology decisions
- **Triggers for update**: new ADRs introduced (technology or pattern changes),
  domain models added new bounded contexts, PRD requirements changed system
  boundaries, implementation revealed architectural gaps
- **Conflict resolution**: if a new ADR contradicts the current architecture,
  update the affected components and data flows while preserving unaffected
  sections; flag breaking changes for user review
