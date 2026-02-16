---
description: "Research and document tech stack decisions"
---
Thoroughly review and analyze docs/plan.md to understand every feature, integration, and technical requirement of this project. Then deeply research tech stack options and create docs/tech-stack.md as the definitive technology reference for this project.

## Mode Detection

Before starting, check if `docs/tech-stack.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:tech-stack v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/plan.md`, `docs/coding-standards.md`, `docs/tdd-standards.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:tech-stack v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/tech-stack.md`
- **Preserve**: All technology choices and their rationale, version pins, AI compatibility notes, user-confirmed preferences
- **Related docs**: `docs/plan.md`, `docs/coding-standards.md`, `docs/tdd-standards.md`, `docs/project-structure.md`
- **Special rules**: Never change a technology choice without user approval. Preserve version pins exactly. Update the Quick Reference section to match any structural changes.

## Step 1: Gather User Preferences

Before researching options, use AskUserQuestion to ask the user about their preferences. Ask up to 4 questions based on what the PRD implies (e.g., skip frontend questions if the PRD describes a CLI tool). Tailor the options to what's realistic for this project.

Example questions (adapt based on PRD):
- **Backend language** — "Which backend language do you prefer?" with options like "TypeScript", "Python", "Go", "No preference — recommend the best fit"
- **Frontend framework** (if PRD has a UI) — "Which frontend framework do you prefer?" with options like "React", "Vue", "Svelte", "No preference"
- **Deployment target** — "Where do you plan to deploy?" with options like "Vercel/Netlify", "AWS", "Self-hosted", "No preference"
- **Constraints** — "Any hard constraints on the stack?" with options like "Must be TypeScript full-stack", "Must use specific database", "Must stay free-tier", "No constraints"

Use the answers to guide your research. "No preference" means recommend the best fit based on PRD requirements and the guiding principles below.

## Guiding Principles for Stack Selection

This project will be built and maintained entirely by AI agents. Every technology choice must optimize for:

1. **AI familiarity** — Choose libraries and frameworks with massive training data representation. Obscure or bleeding-edge tools mean more hallucination and more bugs.
2. **Convention over configuration** — Prefer opinionated frameworks with clear "one right way" patterns. AI thrives on convention, struggles with ambiguous choices.
3. **Minimal dependency surface** — Fewer dependencies = fewer version conflicts, fewer breaking changes, fewer security vulnerabilities. Only add a dependency if building it ourselves would be unreasonable.
4. **Strong typing and validation** — Static types catch AI mistakes at build time instead of runtime. Prioritize type safety across every layer.
5. **Mature ecosystem** — Stable, well-documented libraries with active maintenance. Check that critical dependencies haven't been abandoned.

## What the Document Must Cover

### 1. Architecture Overview
- High-level architecture diagram (described in text/mermaid)
- Monolith vs. microservices decision with rationale
- Key architectural patterns chosen (MVC, clean architecture, etc.) and why

### 2. Backend
- Framework selection with rationale (compare top 2-3 options, explain the winner)
- ORM / database access layer
- API approach (REST, GraphQL, etc.) with rationale
- Authentication/authorization library
- Background jobs / task queue (if needed per PRD)
- File storage (if needed per PRD)

### 3. Database
- Database engine selection with rationale (compare options given our data model needs)
- Migration tooling
- Caching layer (if needed per PRD — don't add one speculatively)

### 4. Frontend (if applicable per PRD)
- Framework selection with rationale
- State management approach
- UI component library (if applicable)
- Styling approach
- Build tooling

### 5. Infrastructure & DevOps
- Hosting / deployment target recommendation
- CI/CD approach
- Environment management (local, staging, production)
- Environment variable / secrets management

### 6. Developer Tooling
- Linter and formatter for each language
- Type checking configuration
- Pre-commit hooks
- Test runner and assertion library (this feeds into TDD standards later)

### 7. Third-Party Services & APIs
- Identify every external integration implied by the PRD
- Recommended service/provider for each with rationale
- Fallback options if a primary choice has issues

### For Every Technology Choice, Document:
- **What**: The specific library/framework and version
- **Why**: Rationale tied to our project requirements (not generic praise)
- **Why not alternatives**: Brief note on what was considered and rejected
- **AI compatibility note**: How well-represented this is in AI training data, any known AI pitfalls with this tool

## What This Document Should NOT Include
- Technologies we don't need yet — no speculative "we might need Kafka someday"
- Multiple options without a decision — make a recommendation, don't present a menu
- Boilerplate descriptions of what a framework is — assume the reader knows, just explain why we chose it

## Process
- **First**, gather user preferences using AskUserQuestion as described in Step 1 above — do this before creating the Beads task or starting any research
- Create a Beads task for this work: `bd create "docs: <document being created>" -p 0` and `bd update <id> --claim`
- When the document is complete and committed, close it: `bd close <id>`
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now
- Use subagents to research and compare tech stack options in parallel
- Cross-reference every PRD feature against the proposed stack — verify nothing requires a capability the stack doesn't support
- Use AskUserQuestion to present key decisions (especially framework choices and hosting) with your recommendation and rationale before finalizing
- After creating tech-stack.md, review plan.md and update it with any technical clarifications or additions that emerged from the analysis
- At the end of the document, include a **Quick Reference** section listing every dependency with its version — this becomes the source of truth for package.json / requirements.txt / pyproject.toml

## After This Step

When this step is complete, tell the user:

---
**Phase 2 in progress** — `docs/tech-stack.md` created.

**Next:** Run `/scaffold:claude-code-permissions` — Configure Claude Code permissions for agents.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
