---
name: coding-standards
description: Create prescriptive coding standards tailored to the project's tech stack
summary: "Creates coding standards tailored to your tech stack — naming conventions, error handling patterns, import organization, AI-specific rules — and generates working linter and formatter config files."
phase: "foundation"
order: 230
dependencies: [tech-stack]
outputs: [docs/coding-standards.md]
reads: [create-prd]
conditional: null
knowledge-base: [coding-conventions]
---

## Purpose
Define the project's coding conventions with concrete, stack-specific examples
that AI agents reference during every implementation task. Covers project
structure conventions, code patterns, type safety, security, database access,
API design, logging, AI-specific pitfalls, commit message format, and a
self-review checklist.

## Inputs
- docs/tech-stack.md (required) — determines which languages, frameworks, and tools
  the standards apply to
- docs/plan.md (required) — application domain informs which patterns matter most

## Expected Outputs
- docs/coding-standards.md — prescriptive standards document with sections for
  project structure, code patterns, type safety, security, database access, API
  design, logging, AI-specific rules, commit messages, and code review checklist
- Linter/formatter config files (e.g., .eslintrc, .prettierrc, ruff.toml) created
  alongside the standards doc

## Quality Criteria
- (mvp) Every standard references the specific tech stack, not generic principles
- (deep) Includes >= 2 runnable code examples per section showing the RIGHT way for the stack
- (mvp) Commit message format documented: if project uses Beads task tracking: [BD-<id>] type(scope): description; otherwise: type(scope): description following conventional commits
- (mvp) AI-specific coding rules section addresses common AI mistakes (dead code,
  duplication, magic numbers, premature abstraction, unnecessary features)
- (mvp) Linter/formatter configs created and referenced from the document
- (mvp) Every standard has a corresponding linter rule, formatter rule, code review checklist item, or test pattern that enforces it (where applicable tools exist)
- (deep) Every code review checklist item is a binary yes/no question
- (mvp) Linter/formatter config files are valid (lint command runs without config errors)

## Methodology Scaling
- **deep**: Comprehensive standards with examples for every section. Stack-specific
  security patterns. Detailed error handling strategy with code samples. Full
  linter/formatter configuration with custom rules. 15-20 pages.
- **mvp**: Core naming conventions, commit format, import ordering, error handling
  approach, and AI-specific rules. Basic linter config. 3-5 pages.
- **custom:depth(1-5)**:
  - Depth 1: Core naming conventions, commit format, and import ordering. 1-2 pages.
  - Depth 2: Depth 1 + error handling approach and AI-specific rules. Basic linter config. 3-5 pages.
  - Depth 3: Add security and database access patterns. 5-8 pages.
  - Depth 4: Add API design and logging conventions. 8-12 pages.
  - Depth 5: Full suite with all sections, custom linter rules, and code review checklist. 15-20 pages.

## Mode Detection
Update mode if docs/coding-standards.md exists. In update mode: preserve naming
conventions, lint rule customizations, commit message format, and project-specific
patterns. Never change commit message format without checking git-workflow.md
and CI config for references.

## Update Mode Specifics
- **Detect prior artifact**: docs/coding-standards.md exists
- **Preserve**: naming conventions, commit message format, lint/formatter
  configurations, AI-specific coding rules, code review checklist, any
  project-specific patterns added by the team
- **Triggers for update**: tech stack changed (new language or framework
  requires new patterns), new architecture patterns need coding conventions,
  team identified recurring issues needing new rules, commit message format
  changed in docs/git-workflow.md
- **Conflict resolution**: if tech stack added a new framework, add its
  conventions as a new section rather than modifying existing sections;
  verify commit format consistency with git-workflow.md before any changes
