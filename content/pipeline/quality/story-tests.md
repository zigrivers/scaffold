---
name: story-tests
description: Generate test skeletons from user story acceptance criteria
summary: "Generates a test skeleton file for each user story — one pending test case per acceptance criterion, tagged with story and criterion IDs — giving agents a TDD starting point for every feature."
phase: "quality"
order: 915
dependencies: [tdd, review-user-stories, review-architecture]
outputs: [tests/acceptance/, docs/story-tests-map.md]
reads: [tech-stack, coding-standards, project-structure, api-contracts, database-schema, ux-spec]
conditional: null
knowledge-base: [testing-strategy, user-stories]
---

## Purpose
Generate test skeleton files from user story acceptance criteria, creating a
direct, traceable link from every AC to a tagged test case. Each story produces
a test file with one test case per acceptance criterion, tagged with story and
AC IDs for downstream coverage verification. Test cases are created as
pending/skipped — developers implement them during TDD execution.

## Inputs
- docs/user-stories.md (required) — stories with acceptance criteria in GWT format
- docs/tdd-standards.md (required) — test framework, patterns, layer conventions
- docs/tech-stack.md (required) — language, test runner, assertion library
- docs/coding-standards.md (required) — test naming conventions
- docs/system-architecture.md (required) — component structure for layer assignment
- docs/project-structure.md (required) — test file location conventions
- docs/api-contracts.md (optional) — endpoint details for API test skeletons
- docs/database-schema.md (optional) — data layer context for integration tests
- docs/ux-spec.md (optional) — UI component context for component tests

## Expected Outputs
- tests/acceptance/{story-id}-{slug}.test.* — one test file per story with
  tagged pending test cases per AC
- docs/story-tests-map.md — traceability matrix mapping stories → test files,
  ACs → test cases, and layer assignments (unit/integration/e2e)

## Quality Criteria
- (mvp) Every Must-have user story has a corresponding test file
- (mvp) Every acceptance criterion has at least one tagged test case
- (mvp) Test cases are tagged with story ID and AC ID for traceability
- (deep) Test layer assignment: single-function ACs → unit; cross-component ACs → integration; full user journey ACs → e2e
- (mvp) Test files use the project's test framework from docs/tech-stack.md
- (mvp) All test cases are created as pending/skipped (or equivalent framework pause/skip mechanism) (not implemented)
- (mvp) docs/story-tests-map.md shows 100% AC-to-test-case coverage
- (mvp) Test file location follows conventions from docs/project-structure.md
- (deep) Test data fixtures and dependencies documented for each test file
- (deep) Each pending test case includes story ID and AC ID tags, GWT structure, and at least one assertion hint
- (mvp) If api-contracts.md does not exist, API test skeletons derived from user story acceptance criteria instead

## Methodology Scaling
- **deep**: All stories get test files. Negative test cases for every happy path
  AC. Boundary condition tests. Layer-specific skeletons (unit + integration +
  e2e where applicable). Traceability matrix with confidence analysis.
- **mvp**: Test files for Must-have stories only. One test case per AC. No
  layer splitting — all tests in acceptance/ directory.
- **custom:depth(1-5)**:
  - Depth 1: Must-have stories only, one test case per AC
  - Depth 2: Add Should-have stories
  - Depth 3: Add negative test cases for every happy-path AC
  - Depth 4: Add boundary condition tests and layer splitting (unit/integration/e2e)
  - Depth 5: Full suite — all stories including Could-have, edge cases, and confidence analysis in traceability matrix

## Mode Detection
Update mode if tests/acceptance/ directory exists. In update mode: add test
files for new stories, add test cases for new ACs in existing stories, never
delete user-implemented test logic (only add new pending cases). Update
docs/story-tests-map.md with new mappings.

## Update Mode Specifics
- **Detect prior artifact**: tests/acceptance/ directory exists with test files
- **Preserve**: all user-implemented test logic, existing test file names and
  structure, story ID and AC ID tags, traceability mappings in
  docs/story-tests-map.md
- **Triggers for update**: user stories added or changed acceptance criteria,
  architecture changed component structure (layer assignments may shift),
  tdd-standards.md changed test patterns or framework
- **Conflict resolution**: if a story's AC was reworded, update the test case
  description but preserve any implemented test body; if layer assignment
  changed, move the test case to the correct layer file
