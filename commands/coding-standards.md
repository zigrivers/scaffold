---
description: "Create prescriptive coding standards tailored to the project's tech stack"
long-description: "Creates coding standards tailored to your tech stack — naming conventions, error handling patterns, import organization, AI-specific rules — and generates working linter and formatter config files."
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
- (mvp) Commit message format is [BD-<id>] type(scope): description
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

---

## Domain Knowledge

### coding-conventions

*Universal coding standards patterns across languages and linter/formatter configuration*

# Coding Conventions

Coding conventions eliminate decision fatigue, reduce code review friction, and make codebases navigable by any team member. Good conventions are enforced by tooling, not willpower. This knowledge covers universal patterns across languages, language-specific catalogs, and the tooling that makes conventions stick.

## Summary

### Categories of Standards

Coding standards fall into six categories, each requiring different enforcement strategies:

1. **Naming Conventions** — Variable, function, class, file, and directory naming patterns. Language-specific (camelCase in JS/TS, snake_case in Python/Go). Enforced by linters.
2. **Formatting** — Indentation, line length, brace placement, trailing commas, semicolons. Enforced by formatters (Prettier, Black, gofmt). Never debated in code review.
3. **Error Handling** — How errors are created, propagated, caught, and reported. Language-specific patterns (try/catch, Result types, error returns). Enforced by linters + adherence evals.
4. **Import Organization** — Ordering (stdlib, third-party, local), grouping, path aliasing. Enforced by linters (eslint-plugin-import, isort).
5. **Comment Philosophy** — When to comment (why, not what), documentation comments vs inline, TODO format, deprecation markers. Partially enforced by linters.
6. **Code Structure** — Function length limits, file length guidelines, single responsibility, early returns. Enforced by linters + code review.

### Linter/Formatter Selection

**Rule**: Formatters handle style. Linters handle correctness and patterns. Never configure linter rules that a formatter already handles.

| Language | Formatter | Linter | Config Location |
|----------|-----------|--------|----------------|
| TypeScript | Prettier | ESLint (flat config) | `eslint.config.js`, `.prettierrc` |
| Python | Black / Ruff format | Ruff | `pyproject.toml` |
| Go | gofmt (built-in) | golangci-lint | `.golangci.yml` |
| Shell | shfmt | ShellCheck | `.shellcheckrc`, `.editorconfig` |
| Rust | rustfmt | clippy | `rustfmt.toml`, `clippy.toml` |

### The Golden Rule

If a convention cannot be checked by a tool, it will not be followed consistently. Prefer conventions that can be automated. Document the rest, but accept lower compliance.

### Comment Philosophy at a Glance

Comments explain **why**, not **what**. If you need a comment to explain what code does, the code is too complex — refactor first. Extract well-named functions, use descriptive variables, replace magic numbers with constants. TODOs must include a task ID: `// TODO [BD-123]: Reason`. Bare TODOs are not allowed.

## Deep Guidance

### Language-Specific Convention Catalogs

#### TypeScript / JavaScript

**Naming**: Variables and functions use `camelCase`. Types, interfaces, and classes use `PascalCase`. True constants use `UPPER_SNAKE_CASE`. File names use `kebab-case.ts` for modules, `PascalCase.tsx` for React components. Booleans prefix with `is`, `has`, `can`, `should`. Private class fields use `#` prefix.

**Error handling**: Never catch and swallow — `catch (e) {}` is forbidden. Use custom error classes for domain errors. Never use `any` as a catch-all; use `unknown` and narrow. No `@ts-ignore` without a comment explaining why and linking to an issue.

**Imports**: Order as Node builtins, third-party, path-aliased local (`@/`), relative local. One blank line between groups. Prefer named exports over default exports. Use path aliases over deep relative paths.

**Key ESLint rules**: `no-explicit-any: error`, `no-unused-vars` (with `^_` pattern ignored), `prefer-const: error`, `no-var: error`, `eqeqeq: always`.

#### Python

**Naming**: Variables, functions, methods use `snake_case`. Classes use `PascalCase`. Constants use `UPPER_SNAKE_CASE`. Modules and packages use short `snake_case` names. Type variables use `T`, `K`, `V` or descriptive `UserT`.

**Error handling**: Never bare `except:` — always catch specific exceptions. Use custom exceptions inheriting from a project base exception. Use context managers for resource cleanup. Avoid `assert` in production code (stripped with `-O`).

**Imports**: Order as stdlib, third-party, local (enforced by isort/ruff). No `from module import *`. Absolute imports preferred; relative imports acceptable within a package.

**Ruff config**: Select rules `E, F, W, I, N, UP, B, SIM, T20` covering pycodestyle, pyflakes, isort, naming, pyupgrade, bugbear, simplify, and no-print.

#### Go

**Naming**: Exported identifiers use `PascalCase`, unexported use `camelCase`. Acronyms are all caps (`ID`, `HTTP`, `URL`). Single-method interfaces use method name + `er` suffix (`Reader`, `Writer`). Package names are short, lowercase, no underscores.

**Error handling**: Always check error returns — never discard with `_`. Wrap errors with context: `fmt.Errorf("fetch user %s: %w", id, err)`. Use sentinel errors for expected conditions. Use `errors.Is()` and `errors.As()`, never string comparison. Return errors, don't panic.

**Formatting**: `gofmt` is non-negotiable. Run on save. No style discussions in Go.

**Linter**: Enable `errcheck`, `govet`, `staticcheck`, `unused`, `gosimple`, `ineffassign`, `gocritic` via golangci-lint.

#### Shell (Bash)

**Naming**: Variables use `snake_case`. Constants/environment use `UPPER_SNAKE_CASE`. Functions use `snake_case`. Script files use `kebab-case.sh`.

**Error handling**: Every script starts with `set -euo pipefail`. Use `trap` for cleanup. Quote all variable expansions. Use `[[ ]]` over `[ ]`. Check command existence before use.

**ShellCheck**: Run on all `.sh` files. Address warnings; if a directive is needed, comment why.

### Naming Convention Matrix

| Context | TypeScript | Python | Go |
|---------|-----------|--------|-----|
| Local variable | `camelCase` | `snake_case` | `camelCase` |
| Function/method | `camelCase` | `snake_case` | `PascalCase` (exported) |
| Class/type | `PascalCase` | `PascalCase` | `PascalCase` |
| Constant | `UPPER_SNAKE` | `UPPER_SNAKE` | `PascalCase` (exported) |
| File name | `kebab-case` | `snake_case` | `snake_case` |
| Database column | `snake_case` | `snake_case` | `snake_case` |
| Environment var | `UPPER_SNAKE` | `UPPER_SNAKE` | `UPPER_SNAKE` |
| URL path | `kebab-case` | `kebab-case` | `kebab-case` |

**The context rule**: Follow the convention of the domain you are writing in, not the language you are writing with. Database columns are `snake_case` regardless of whether your ORM is in TypeScript or Go.

### Comment and Documentation Standards

**When to comment**: Explain intent, constraints, and non-obvious decisions. Never narrate code. Bad: `// increment counter` before `counter++`. Good: `// Retry up to 3 times — upstream API has transient 503s during deployments`.

**When code should self-document**: Extract well-named functions instead of commenting blocks. Use descriptive variable names instead of commenting values. Use enums/constants instead of commenting magic numbers.

**Documentation comments**: Public APIs always need documentation comments. TypeScript uses JSDoc `/** */`. Python uses docstrings. Go uses comments above exported identifiers starting with the identifier name.

**TODO format**: `// TODO [BD-123]: Reason for the TODO`. Also `FIXME [BD-456]` and `HACK [BD-789]`. Bare TODOs without task IDs accumulate without accountability and are not allowed.

### Error Handling Patterns by Language

The error handling strategy must be consistent within each architectural layer and documented in `docs/coding-standards.md`.

#### TypeScript Error Pattern

```typescript
// Domain errors with discriminated unions
class AppError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AppError';
  }
}
class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND');
  }
}

// Service layer: throw domain errors
async function getUser(id: string): Promise<User> {
  const user = await userRepo.findById(id);
  if (!user) throw new NotFoundError('User', id);
  return user;
}

// Controller layer: catch and map to HTTP responses
app.get('/users/:id', async (req, res) => {
  try {
    const user = await getUser(req.params.id);
    res.json(user);
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err; // re-throw unexpected errors for global handler
  }
});
```

#### Python Error Pattern

```python
class AppError(Exception):
    """Base exception for the application."""
    def __init__(self, message: str, code: str = "INTERNAL"):
        super().__init__(message)
        self.code = code

class NotFoundError(AppError):
    def __init__(self, resource: str, id: str):
        super().__init__(f"{resource} not found: {id}", "NOT_FOUND")

# FastAPI exception handler
@app.exception_handler(NotFoundError)
async def not_found_handler(request, exc):
    return JSONResponse(status_code=404, content={"error": str(exc)})
```

#### Go Error Pattern

```go
var ErrNotFound = errors.New("not found")

func (r *UserRepo) FindByID(ctx context.Context, id string) (*User, error) {
    user, err := r.db.QueryRow(ctx, "SELECT ... WHERE id = $1", id)
    if err != nil {
        if errors.Is(err, sql.ErrNoRows) {
            return nil, fmt.Errorf("user %s: %w", id, ErrNotFound)
        }
        return nil, fmt.Errorf("query user %s: %w", id, err)
    }
    return user, nil
}
```

### Import Organization Details

Consistent import ordering makes files scannable and diffs cleaner. Every language has an established convention:

**TypeScript** (enforced by `eslint-plugin-import`):
```typescript
// 1. Node built-ins
import { readFileSync } from 'fs';
import path from 'path';

// 2. Third-party packages
import express from 'express';
import { z } from 'zod';

// 3. Path-aliased local imports
import { config } from '@/config/env';
import { UserService } from '@/features/auth';

// 4. Relative imports
import { validateInput } from './helpers';
import type { RequestContext } from './types';
```

**Python** (enforced by `isort` or `ruff`):
```python
# 1. Standard library
import os
from pathlib import Path

# 2. Third-party
from fastapi import Depends
from sqlalchemy.orm import Session

# 3. Local
from app.core.config import settings
from app.services.auth import AuthService
```

### Linter Configuration Strategies

**Strict from Day One**: Enable all rules at project start. Zero warnings policy. Best for new projects and small teams.

**Progressive Adoption**: Start with formatter + critical rules only. Add rules incrementally. Track `eslint-disable-next-line` counts as a health metric — they should decrease over time, not increase. Best for existing projects and large teams.

**The Warning Trap**: Never leave linter rules as warnings long-term. Warnings are ignored. Either a rule is an error (enforced) or off (not enforced). Warnings create noise without value.

**Monorepo inheritance**: Root config has shared rules. Package configs extend root with package-specific additions. Override blocks handle per-directory exceptions (test files get relaxed rules).

### Common Anti-Patterns

**Inconsistent Naming**: Same concept has different names — `userId`, `user_id`, `UserID`, `uid` in one codebase. Fix: define a naming glossary in `docs/coding-standards.md`. One name for one concept.

**Swallowed Errors**: `catch (e) {}` or `except: pass` discards errors silently. Fix: lint rules that forbid empty catch blocks. If truly intentional, require a justification comment.

**Magic Numbers**: `if (retries > 3)` or `setTimeout(fn, 86400000)` with no context. Fix: extract to named constants. Lint rules can flag numeric literals in conditionals.

**Over-Commenting**: Every line has a comment restating what the code does. Fix: delete comments that restate code. Keep only "why" comments.

**Inconsistent Error Handling**: Some functions throw, some return null, some return error codes. Fix: document one error strategy per architectural layer. Controllers throw HTTP errors. Services return Result types. Repositories throw data access errors.

**Import Chaos**: No ordering, mixed styles, deep relative paths. Fix: configure import-ordering tools (`eslint-plugin-import`, `isort`) and path aliases. Run formatter on save.

---

## After This Step

Continue with: `/scaffold:project-structure`, `/scaffold:tdd`
