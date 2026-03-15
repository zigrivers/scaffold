---
name: system-architecture
description: Design and document system architecture
phase: "architecture"
order: 11
dependencies: [adrs]
outputs: [docs/system-architecture.md]
conditional: null
knowledge-base: [system-architecture]
---

## Purpose
Design and document the system architecture, translating domain models and ADR
decisions into a concrete component structure, data flows, and module
organization. Project directory structure and module organization are defined here.

## Inputs
- docs/domain-models/ (required) — domain models from phase 1
- docs/adrs/ (required) — architecture decisions from phase 2
- docs/prd.md (required) — requirements driving architecture

## Expected Outputs
- docs/system-architecture.md — architecture document with component design,
  data flows, module structure, and extension points

## Quality Criteria
- Every domain model lands in a component or module
- Every ADR constraint is respected in the architecture
- All components appear in at least one data flow diagram
- Extension points are both documented and designed (not just listed)
- Project directory structure is defined with file-level granularity

## Methodology Scaling
- **deep**: Full architecture document. Component diagrams, data flow diagrams,
  module structure with file-level detail, state management design, extension
  point inventory, deployment topology.
- **mvp**: High-level component overview. Key data flows. Enough structure for
  an agent to start building without ambiguity.
- **custom:depth(1-5)**: Depth 1-2: MVP-style. Depth 3: add component diagrams
  and module boundaries. Depth 4-5: full architecture approach.

## Mode Detection
If outputs already exist, operate in update mode: read existing content, diff
against current project state and new ADRs, propose targeted updates rather
than regenerating.
