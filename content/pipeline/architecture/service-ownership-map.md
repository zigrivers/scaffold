---
name: service-ownership-map
description: Define logical domain and data ownership boundaries across services
summary: "Maps which service owns which business domain, data concepts, and event topics. Establishes boundaries that inform database schema design, API contracts, and cross-service communication patterns."
phase: "architecture"
order: 721
dependencies: [review-architecture]
outputs: [docs/service-ownership-map.md]
reads: [system-architecture, domain-modeling]
conditional: null
knowledge-base: [multi-service-architecture, multi-service-data-ownership]
---

## Purpose
Define logical ownership boundaries across services: which service owns which
business domain, data concepts, and event topics. Produces a reference document
that informs database schema design, API contracts, and cross-service
communication patterns. Prevents ownership ambiguity and data-coupling
anti-patterns before implementation begins.

## Inputs
- docs/system-architecture.md (required) — service topology and responsibilities
- docs/domain-modeling.md (optional) — bounded contexts and aggregate roots
- docs/adrs/ (optional) — architecture decisions affecting service boundaries

## Expected Outputs
- docs/service-ownership-map.md — service-to-domain ownership matrix, data
  concept ownership table, event topic ownership list, and cross-cutting concern
  assignments

## Quality Criteria
- (mvp) Each service maps to at least one primary business domain
- (mvp) Every core data concept has exactly one owning service (no orphans, no
  co-owners)
- (mvp) Cross-service reads are listed as explicit access patterns (not implicit
  data sharing)
- (deep) Event topic ownership assigned per service with producer/consumer roles
  listed
- (deep) Data sync strategies documented for each cross-service read pattern
  (sync call, async replication, CQRS projection)
- (deep) Ownership matrix covers all entities from domain model with no gaps
- (deep) Cross-cutting concerns (auth, audit logging, rate limiting, feature
  flags) assigned to named services or shared infrastructure
- (deep) Boundary violations from the current architecture are identified and
  flagged for resolution
- (deep) Ownership conflicts (candidate co-owners) are surfaced with a
  resolution rationale

## Methodology Scaling
- **deep**: Full ownership matrix with every entity and aggregate. Event flow
  diagrams showing producer/consumer relationships. Data sync strategies per
  cross-service read. Cross-cutting concern assignments with rationale. Boundary
  violation inventory.
- **mvp**: Service-to-domain mapping table. Primary data concept ownership list.
  Cross-service read patterns enumerated without sync detail.
- **custom:depth(1-5)**:
  - Depth 1: service-to-domain mapping table only.
  - Depth 2: add primary data concept ownership and list cross-service reads.
  - Depth 3: add event topic ownership with producer/consumer roles.
  - Depth 4: add data sync strategies, cross-cutting concern assignments, and
    boundary violation flags.
  - Depth 5: full ownership matrix with conflict resolution rationale, event flow
    diagrams, and multi-region or multi-tenant ownership considerations.

## Mode Detection
Check for docs/service-ownership-map.md. If it exists, operate in update mode:
read the existing map and diff against the current system architecture and any
updated domain model. Preserve existing ownership assignments unless the
architecture has explicitly reassigned a domain. Surface new services or data
concepts that lack ownership entries and prompt for assignments. Never silently
change an ownership assignment without documenting the reason.

## Update Mode Specifics
- **Detect prior artifact**: docs/service-ownership-map.md exists
- **Preserve**: established service-to-domain assignments, confirmed event topic
  ownership, cross-cutting concern assignments, documented sync strategies
- **Triggers for update**: new service added to architecture, domain model
  changed aggregate boundaries, ADR reassigned data ownership, review identified
  ownership ambiguity
- **Conflict resolution**: if architecture added a new service that overlaps an
  existing domain, surface the conflict with both candidate owners and request a
  resolution decision before updating the map; do not silently absorb the new
  service into an existing owner
