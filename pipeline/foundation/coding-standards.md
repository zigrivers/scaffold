---
name: coding-standards
description: Create prescriptive coding standards tailored to the project's tech stack
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
- Every standard references the specific tech stack, not generic principles
- Includes runnable code examples showing the RIGHT way for the stack
- Commit message format is [BD-<id>] type(scope): description
- AI-specific coding rules section addresses common AI mistakes (dead code,
  duplication, magic numbers, premature abstraction, unnecessary features)
- Linter/formatter configs created and referenced from the document
- Every standard has a corresponding linter rule, code review checklist item, or test pattern that enforces it
- Every code review checklist item is a binary yes/no question
- (mvp) Linter/formatter config files are valid (lint command runs without config errors)

## Methodology Scaling
- **deep**: Comprehensive standards with examples for every section. Stack-specific
  security patterns. Detailed error handling strategy with code samples. Full
  linter/formatter configuration with custom rules. 15-20 pages.
- **mvp**: Core naming conventions, commit format, import ordering, error handling
  approach, and AI-specific rules. Basic linter config. 3-5 pages.
- **custom:depth(1-5)**: Depth 1-2: MVP conventions. Depth 3: add security and
  database patterns. Depth 4: add API design and logging. Depth 5: full suite
  with all sections and custom linter rules.

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
  team identified recurring issues needing new rules
- **Conflict resolution**: if tech stack added a new framework, add its
  conventions as a new section rather than modifying existing sections;
  verify commit format consistency with git-workflow.md before any changes
