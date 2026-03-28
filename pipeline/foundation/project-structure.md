---
name: project-structure
description: Design directory layout and scaffold the actual project structure
phase: "foundation"
order: 250
dependencies: [tech-stack, coding-standards]
outputs: [docs/project-structure.md]
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
- Module organization strategy chosen and justified (feature-based, layer-based, or hybrid)
- File placement table covers all file types (routes, services, models, types, utils, tests)
- High-contention files identified with merge-conflict mitigation strategies
- Shared utilities rule enforced (2+ features before promoting to shared)
- Import conventions defined with ordering rules
- Test file location aligns with tdd-standards.md (if it exists)
- .gitignore covers all generated files for the tech stack
- Structure follows the chosen framework's conventions

## Methodology Scaling
- **deep**: Comprehensive structure with high-contention analysis, shared code
  strategy, import path aliases, barrel file policy, responsive breakpoints for
  screenshots, and generated vs. committed file inventory.
- **mvp**: Directory tree with annotations, basic file placement table, .gitignore.
  Skip shared code strategy and high-contention analysis.
- **custom:depth(1-5)**: Depth 1-2: tree + placement table. Depth 3: add shared
  code rules. Depth 4: add contention analysis. Depth 5: full suite with barrel
  policy and import aliases.

## Mode Detection
Update mode if docs/project-structure.md exists. In update mode: never delete
existing directories (only add new ones), preserve module organization strategy
choice, update CLAUDE.md Quick Reference section in-place.
