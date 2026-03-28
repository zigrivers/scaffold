---
name: story-tests
description: Generate test skeletons from user story acceptance criteria
phase: "quality"
order: 915
dependencies: [tdd, review-user-stories, review-architecture]
outputs: [tests/acceptance/, docs/story-tests-map.md]
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
- Every user story in docs/user-stories.md has a corresponding test file
- Every acceptance criterion has at least one tagged test case
- Test cases are tagged with story ID and AC ID for traceability
- Test layer (unit/integration/e2e) is assigned based on AC type and architecture
- Test files use the project's test framework from docs/tech-stack.md
- All test cases are created as pending/skipped (not implemented)
- docs/story-tests-map.md shows 100% AC-to-test-case coverage
- Test file location follows conventions from docs/project-structure.md

## Methodology Scaling
- **deep**: All stories get test files. Negative test cases for every happy path
  AC. Boundary condition tests. Layer-specific skeletons (unit + integration +
  e2e where applicable). Traceability matrix with confidence analysis.
- **mvp**: Test files for Must-have stories only. One test case per AC. No
  layer splitting — all tests in acceptance/ directory.
- **custom:depth(1-5)**: Depth 1: Must-have stories only. Depth 2: add
  Should-have. Depth 3: add negative cases. Depth 4: add boundary conditions
  and layer splitting. Depth 5: full suite with all stories and edge cases.

## Mode Detection
Update mode if tests/acceptance/ directory exists. In update mode: add test
files for new stories, add test cases for new ACs in existing stories, never
delete user-implemented test logic (only add new pending cases). Update
docs/story-tests-map.md with new mappings.
