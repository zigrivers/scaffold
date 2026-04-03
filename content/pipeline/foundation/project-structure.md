---
name: project-structure
description: Design directory layout and scaffold the actual project structure
summary: "Designs a directory layout optimized for parallel AI agent work (minimizing file conflicts), documents where each type of file belongs, and creates the actual directories in your project."
phase: "foundation"
order: 250
dependencies: [tech-stack, coding-standards]
outputs: [docs/project-structure.md]
reads: [create-prd, user-stories, tdd]
conditional: null
knowledge-base: [project-structure-patterns]
---

## Purpose
Design the directory layout optimized for parallel AI agent work (minimizing
merge conflicts and maximizing task independence), document file placement rules,
and scaffold the actual directories and placeholder files. Updates CLAUDE.md
with a Quick Reference section for file placement.

## Inputs
- docs/tech-stack.md (required) — framework conventions determine structure
- docs/coding-standards.md (required) — naming and organization conventions
- docs/tdd-standards.md (optional) — test co-location rules
- docs/plan.md (required) — features inform organization strategy choice

## Expected Outputs
- docs/project-structure.md — complete directory tree with purpose annotations,
  module organization strategy, file placement rules, shared code strategy,
  import conventions, barrel file policy, test file location, and generated
  vs. committed file rules
- Scaffolded directories with .gitkeep files
- Updated .gitignore for the tech stack
- CLAUDE.md updated with Project Structure Quick Reference section

## Quality Criteria
- (mvp) Module organization strategy chosen and justified (feature-based, layer-based, or hybrid)
- (mvp) File placement table covers all file types (routes, services, models, types, utils, tests)
- (deep) High-contention files identified with merge-conflict mitigation strategies
- (mvp) Shared utilities rule enforced (2+ features before promoting to shared)
- (mvp) Import conventions defined with ordering rules
- (mvp) Test file location aligns with tdd-standards.md (if it exists)
- (mvp) .gitignore covers all generated files for the tech stack
- (mvp) Structure follows the chosen framework's conventions
- (mvp) CLAUDE.md contains Project Structure Quick Reference section with file placement table
- (mvp) All documented directories exist on disk with .gitkeep placeholder files
- (mvp) CLAUDE.md Project Structure Quick Reference matches the directory tree in docs/project-structure.md

## Methodology Scaling
- **deep**: Comprehensive structure with high-contention analysis, shared code
  strategy, import path aliases, barrel file policy, responsive breakpoints for
  screenshots, and generated vs. committed file inventory.
- **mvp**: Directory tree with annotations, basic file placement table, .gitignore.
  Skip shared code strategy and high-contention analysis.
- **custom:depth(1-5)**:
  - Depth 1: Directory tree with purpose annotations and .gitignore. Minimal.
  - Depth 2: Depth 1 + file placement table covering all file types.
  - Depth 3: Add shared code strategy (2+ features before promoting to shared).
  - Depth 4: Add high-contention file analysis with merge-conflict mitigation strategies.
  - Depth 5: Full suite with barrel file policy, import path aliases, and generated vs. committed file inventory.

## Mode Detection
Update mode if docs/project-structure.md exists. In update mode: never delete
existing directories (only add new ones), preserve module organization strategy
choice, update CLAUDE.md Quick Reference section in-place.

## Update Mode Specifics
- **Detect prior artifact**: docs/project-structure.md exists
- **Preserve**: module organization strategy (feature-based, layer-based, hybrid),
  existing directory tree, file placement rules, import conventions, barrel file
  policy, .gitignore entries
- **Triggers for update**: new features require new directories, architecture
  changed module boundaries, tech stack added new file types needing placement
  rules, tdd-standards.md changed test co-location rules
- **Conflict resolution**: if architecture restructured modules, add new
  directories but do not remove existing ones until migration is complete;
  update CLAUDE.md Quick Reference to reflect additions
