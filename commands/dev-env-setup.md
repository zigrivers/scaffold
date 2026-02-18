---
description: "Set up local dev environment with live reload"
long-description: "Creates docs/dev-setup.md and configures Makefile commands for linting, testing, building, and running the project with hot-reload support."
---

Set up a complete local development environment for this project based on docs/tech-stack.md and docs/project-structure.md. The goal is a one-command dev experience with live reloading so I can see changes in real-time as work progresses.

I'm not a professional developer, so the setup should be beginner-friendly with clear instructions for common tasks.

## Mode Detection

Before starting, check if `docs/dev-setup.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:dev-setup v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/tech-stack.md`, `docs/project-structure.md`, `docs/git-workflow.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:dev-setup v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/dev-setup.md`
- **Secondary output**: Makefile/scripts, `.env.example`, CLAUDE.md "Key Commands" section
- **Preserve**: Port assignments, custom scripts, `.env` variable names and values, database configuration, Makefile customizations
- **Related docs**: `docs/tech-stack.md`, `docs/project-structure.md`, `docs/git-workflow.md`
- **Special rules**: Never change port assignments without checking for references in other config files. Preserve all `.env.example` variables. Update CLAUDE.md Key Commands section in-place.

## Objectives

1. Configure a local dev server with live/hot reloading
2. Set up the local database (if applicable)
3. Configure environment variables for local development
4. Create simple commands for common tasks
5. Document everything clearly for a non-engineer
6. Verify the setup works end-to-end

## What to Configure

### 1. Dev Server with Live Reloading

Set up the appropriate dev server for our tech stack with:
- **Hot reloading / live reload**: Changes to code automatically refresh the browser or restart the server
- **Fast startup**: Dev server should start in seconds, not minutes
- **Error overlay**: Errors should display clearly in the browser (for frontend) or terminal (for backend)
- **Source maps**: For debugging in browser dev tools (if applicable)

Common setups by stack (configure what matches our tech-stack.md):
- **Frontend (React/Vue/Svelte)**: Vite, Next.js dev mode, or Create React App
- **Backend (Python)**: Uvicorn with `--reload`, Flask debug mode, or Django runserver
- **Backend (Node)**: Nodemon, ts-node-dev, or framework-specific (Next.js, Fastify)
- **Full-stack**: Concurrent processes for frontend + backend with a single command

### 2. Database Setup (if applicable)

Based on tech-stack.md, set up local database:
- **SQLite**: No setup needed, but configure the dev database path
- **PostgreSQL/MySQL**: Docker Compose setup OR instructions for local install
- **In-memory option**: For fast testing without persistence

Include:
- Database creation/initialization script
- Seed data script (sample data to work with during development)
- Database reset command (drop and recreate)
- Migration commands clearly documented

### 3. Environment Variables

Create environment configuration:
- `.env.example` — Template with all required variables (committed to git)
- `.env` — Actual local config (gitignored)
- Clear comments explaining each variable
- Sensible defaults for local development

Document which variables are required vs. optional for local dev.

### 4. Simple Commands (scripts or Makefile)

Create easy-to-remember commands for common tasks. Use whatever fits our stack:

**Option A: package.json scripts (Node projects)**
```json
{
  "scripts": {
    "dev": "starts everything needed for development",
    "test": "runs all tests",
    "test:watch": "runs tests in watch mode",
    "db:setup": "creates and seeds database",
    "db:reset": "drops and recreates database",
    "lint": "checks code style",
    "build": "creates production build"
  }
}
```

**Option B: Makefile (Python or polyglot projects)**
```makefile
dev:        # Start dev server with live reload
test:       # Run all tests
db-setup:   # Create and seed database
db-reset:   # Drop and recreate database
lint:       # Check code style
```

**Option C: Scripts directory**
```
scripts/
├── dev.sh          # Start dev server
├── test.sh         # Run tests
├── db-setup.sh     # Database setup
└── db-reset.sh     # Database reset
```

Whichever approach, the commands should be:
- Memorable (not cryptic flags)
- Documented (help text or comments)
- Idempotent where possible (safe to run twice)

### 5. Dependency Installation

Create a clear setup process for first-time installation:
```
1. Clone the repo
2. Copy .env.example to .env
3. Run [single install command]
4. Run [single setup command]
5. Run [dev command]
6. Open http://localhost:[port]
```

This should work on Mac, Linux, and Windows (WSL) if possible.

### 6. Documentation

Create `docs/dev-setup.md` covering:

**Getting Started**
- Prerequisites (Node version, Python version, Docker, etc.)
- Step-by-step first-time setup
- How to verify setup worked

**Daily Development**
- How to start the dev server
- How to run tests
- How to view the app in browser
- How to stop everything

**Common Tasks**
- Adding a new dependency
- Creating a database migration
- Resetting to a clean state
- Viewing logs

**Troubleshooting**
- Port already in use
- Database connection failed
- Dependencies out of sync
- "It works on my machine" issues

**For AI Agents**
- Commands to start dev server before Playwright testing
- How to verify the server is running
- How to check logs for errors

### 7. Update CLAUDE.md

Add a Dev Environment section AND populate the Key Commands table. The Key Commands table is the single source of truth for project-specific commands — the entire workflow references it instead of hardcoding commands.

**Add Key Commands table** to the Quick Reference section of CLAUDE.md. This is the single source of truth for project-specific commands — the entire workflow and worktree cleanup reference this table instead of hardcoding commands.

If a "Beads Commands" table exists (from Beads Setup), merge those commands into this table and remove the old table.
```markdown
### Key Commands

| Task | Command |
|------|---------|
| Start dev server | `<actual command>` |
| Run lint | `<actual command>` |
| Run tests | `<actual command>` |
| Run tests (watch) | `<actual command>` |
| Install dependencies | `<actual command>` |
| Reset database | `<actual command>` |
| View logs | `<actual command>` |
| Pick next task | `bd ready` |
| Claim task | `bd update <id> --status in_progress --claim` |
| Create task | `bd create "title" -p N` |
| Close task | `bd close <id>` |
| Sync tasks | `bd sync` |
```

Replace `<actual command>` with the real commands configured in this setup (e.g., `make lint`, `npm run lint`, `ruff check .`).


**Add Dev Environment section:**

## Verification

After setup, verify everything works:

1. [ ] Run the install command — completes without errors
2. [ ] Run the dev command — server starts successfully
3. [ ] Open the app in browser — something renders (even if just "Hello World")
4. [ ] Make a small code change — browser updates automatically (live reload works)
5. [ ] Run the test command — tests execute (even if there are no tests yet)
6. [ ] Run database commands — database creates/resets successfully (if applicable)

If any step fails, fix it before considering this complete.

## What NOT to Do

- Don't require Docker unless the tech stack specifically needs it — adds complexity for beginners
- Don't set up production deployment — this is dev only
- Don't configure GitHub Actions — quality gates run locally via `make check` and git hooks
- Don't add optional tooling "nice-to-haves" — keep it minimal and working

## Process
- Create a Beads task for this work before starting: `bd create "docs: <document being created>" -p 0` and `bd update <id> --claim`
- When the document is complete and committed, close it: `bd close <id>`
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now
- Review docs/tech-stack.md to understand exactly what needs to be configured
- Review docs/project-structure.md to understand where config files should live
- Use AskUserQuestionTool to ask about:
  - Preferred ports (or use sensible defaults)
  - Docker vs. local database preference
  - Any services I already have installed
- After setup, walk me through the verification steps so I can confirm it works
- Commit all configuration files (except .env) to the repo

## After This Step

When this step is complete, tell the user:

---
**Phase 3 in progress** — Dev environment configured, `docs/dev-setup.md` created.

**Next:**
- If your project has a **frontend**: Run `/scaffold:design-system` — Create a cohesive design system.
- If your project is **backend-only**: Skip to `/scaffold:git-workflow` — Configure git workflow for parallel agents.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
