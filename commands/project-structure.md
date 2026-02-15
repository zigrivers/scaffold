---
description: "Define and scaffold project directory structure"
---

Research best practices for project structure based on our tech stack and standards. Review docs/tech-stack.md, docs/coding-standards.md, docs/tdd-standards.md, and docs/plan.md, then create docs/project-structure.md and scaffold the actual directory structure.

## Why This Matters for AI Development

With up to 10 Claude Code agents working in parallel, project structure directly impacts:
- **Merge conflict frequency** — Poor structure means agents constantly edit the same files
- **Context window efficiency** — Clear boundaries mean agents load only what they need
- **Task independence** — Good structure lets agents complete tasks without coordinating

## What the Document Must Cover

### 1. Directory Tree

Provide the complete directory structure with purpose annotations:

```
/
├── src/                    # Application source code
│   ├── [layer or feature folders with explanation]
│   └── ...
├── tests/                  # Test files (structure mirrors src/)
├── docs/                   # Project documentation
├── scripts/                # Build, deploy, and utility scripts
├── config/                 # Configuration files
└── ...
```

The structure should follow our tech stack's conventions (e.g., Next.js has specific expectations, FastAPI projects have different patterns).

### 2. Module Organization Strategy

Decide and document ONE of these approaches (based on what fits our stack and PRD best):

**Feature-based (vertical slices)**
```
src/
├── auth/
│   ├── routes.py
│   ├── services.py
│   ├── models.py
│   └── tests/
├── sessions/
│   ├── routes.py
│   ├── services.py
│   ├── models.py
│   └── tests/
```

**Layer-based (horizontal slices)**
```
src/
├── routes/
├── services/
├── models/
├── repositories/
```

**Hybrid (layers within features)**
```
src/
├── features/
│   ├── auth/
│   └── sessions/
├── shared/
│   ├── middleware/
│   └── utils/
```

Explain WHY the chosen approach fits our project. Feature-based typically causes fewer merge conflicts with parallel agents.

### 3. File Placement Rules

For each file type, specify exactly where it goes:

| File Type | Location | Naming Convention | Example |
|-----------|----------|-------------------|---------|
| API routes/controllers | | | |
| Business logic/services | | | |
| Database models | | | |
| Type definitions | | | |
| Utility functions | | | |
| Constants/config | | | |
| Middleware | | | |
| Unit tests | | | |
| Integration tests | | | |
| E2E tests | | | |
| Screenshots (Playwright) | | | |

### 4. Shared Code Strategy

This is critical for parallel agent work. Define:

**High-contention files** (multiple agents likely to touch):
- Main route index / app entry point
- Database schema / migrations
- Shared type definitions
- Environment config

**Mitigation approach for each:**
- How to structure these files to minimize conflicts
- When to split vs. keep together
- Merge resolution guidance if conflicts occur

**Shared utilities rules:**
- When to add to shared utils vs. keep in feature folder
- Required: utility must be used by 2+ features before promoting to shared
- Shared code must have tests before other features can depend on it

### 5. Import Conventions

Define import order and style (should align with coding-standards.md):
```
1. Standard library
2. Third-party packages
3. Internal shared modules
4. Feature-local modules
```

Define path alias conventions if applicable (e.g., `@/components`, `@shared/utils`).

### 6. Index/Barrel File Policy

Decide one of:
- **Use barrel files**: Every folder has an `index.ts` that re-exports public API
- **No barrel files**: Import directly from source files
- **Hybrid**: Barrel files only for shared modules

Document the reasoning and be consistent.

### 7. Test File Location

Decide one of:
- **Co-located**: `feature/component.ts` + `feature/component.test.ts`
- **Mirrored**: `src/feature/component.ts` → `tests/feature/component.test.ts`
- **Hybrid**: Unit tests co-located, integration/E2E tests separate

Must align with docs/tdd-standards.md.

### 8. Generated vs. Committed Files

Specify which files/folders:
- Must be committed (source code, config, migrations)
- Must NOT be committed (node_modules, __pycache__, .env, build output)
- Should be committed only as baselines (screenshot references)

Verify .gitignore covers all generated files.

## What to Actually Create

After documenting, scaffold the project:

1. **Create all directories** from the structure (empty directories can have `.gitkeep`)
2. **Create placeholder files** where appropriate:
   - `src/shared/utils/.gitkeep`
   - `tests/.gitkeep`
   - Empty `__init__.py` files for Python projects
3. **Create or update .gitignore** to match the structure
4. **Update CLAUDE.md** with a quick-reference section:

```markdown
## Project Structure Quick Reference

- Feature code: `src/features/{feature-name}/`
- Shared utilities: `src/shared/` (only after 2+ features use it)
- Tests: Co-located as `{filename}.test.{ext}`
- Screenshots: `tests/screenshots/{story-id}_{description}.png`
- New migrations: `src/db/migrations/` (coordinate via Beads to avoid conflicts)

Before creating a new file, check project-structure.md for the correct location.
```

## What This Document Should NOT Be

- An explanation of what directories are — assume the reader knows what `src/` means
- Flexible — the structure should be prescriptive so all agents follow it consistently
- Theoretical — every rule should be tied to our actual tech stack and project needs

## Process

- Use subagents to research project structure best practices for our specific tech stack
- Review docs/plan.md to understand the features being built — this informs whether feature-based or layer-based organization makes more sense
- Use AskUserQuestionTool for key decisions: organization strategy, test location, barrel file policy
- After documenting, actually create the directory structure and commit it
- Verify the structure works by checking that imports resolve correctly (if tooling is set up)
- Create a Beads task for this work before starting: `bd create "docs: <document being created>" -p 0` and `bd update <id> --claim`
- When the document is complete and committed, close it: `bd close <id>`
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now

## After This Step

When this step is complete, tell the user:

---
**Phase 2 complete** — `docs/project-structure.md` created and directories scaffolded.

**Next:** Run `/scaffold:dev-env-setup` — Set up local dev environment with live reload (starts Phase 3).

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
