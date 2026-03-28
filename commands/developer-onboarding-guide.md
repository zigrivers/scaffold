---
description: "Generate developer onboarding guide"
long-description: "Reads all frozen project documentation and synthesizes a comprehensive 'start here' guide for new developers (human or AI agent) joining the project."
---

Read ALL frozen project documentation and generate a comprehensive onboarding guide — the single "start here" document for any developer (human or AI agent) joining the project.

## Mode Detection

Before starting, check if `docs/onboarding-guide.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists -> UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:developer-onboarding-guide v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure
   - **PRESERVE** — Project-specific customizations (setup quirks, troubleshooting entries, team-specific workflows)
3. **Cross-doc consistency**: Read related docs and verify the guide still reflects the current project state (architecture changes, new dependencies, revised patterns).
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Guide has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve project-specific content. Add missing sections.
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:developer-onboarding-guide v<ver> <date> -->`
7. **Post-update summary**: Report sections added, restructured, preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/onboarding-guide.md`
- **Preserve**: Project-specific troubleshooting entries, custom setup steps, team workflow details
- **Related docs**: All `docs/*.md` artifacts, `CLAUDE.md`
- **Special rules**: Never remove troubleshooting entries — they capture real developer pain points. If a setup step changed, update it rather than deleting it.

---

## Inputs

Read ALL of these before writing any content:

| Document | What to Extract |
|----------|----------------|
| `docs/plan.md` | Project purpose, users, value proposition |
| `docs/system-architecture.md` or equivalent | Component inventory, data flow, key decisions |
| `docs/project-structure.md` | Directory layout, module organization, key files |
| `docs/tech-stack.md` | Languages, frameworks, libraries, tools |
| `docs/coding-standards.md` | Naming conventions, error handling, key patterns |
| `docs/tdd-standards.md` | Test categories, file locations, mocking strategy |
| `docs/dev-setup.md` | Prerequisites, setup commands, environment config |
| `docs/git-workflow.md` | Branching, commit format, PR process |
| `docs/implementation-plan.md` | Architecture overview, component boundaries |
| `CLAUDE.md` | Key commands, workflow, project conventions |
| `.claude/rules/` *(if exists)* | Path-scoped convention rules for AI agents |
| `docs/ai-memory-setup.md` *(if exists)* | Memory stack tiers, MCP server config, decision logging |
| `docs/decisions/` *(if exists)* | Implementation decisions and their rationale |

Skip any document that does not exist — adapt the guide to what is available.

---

## Guide Structure

The onboarding guide follows a deliberate progression from purpose to productivity. Include ALL of the following sections:

### 1. Purpose
Concise explanation (3-5 sentences): what the project does, who the users are, what problem it solves. This is the elevator pitch, not the full PRD.

### 2. Architecture Overview
High-level description of 3-7 major components and how they interact. Include communication patterns, data flow, external dependencies. Summarize the 3-5 most important architectural decisions with one sentence each — link to full ADRs for detail. Use a narrative walkthrough style: trace a single user request end-to-end.

### 3. Key Patterns
Document the 5-10 recurring patterns a developer must understand to read any part of the codebase. Cover: error handling, request lifecycle, database access, testing approach, authentication (where applicable). Each pattern gets a brief explanation and a code pointer (file path, not a code block).

### 4. Getting Started
Copy-paste executable setup instructions. Include: prerequisites (with specific versions), clone/install commands, environment configuration, database setup, how to start the dev server, and a verification step ("how to know it worked"). This section must pass the "literal execution" test.

### 5. Common Tasks
Step-by-step guides for frequent developer activities: adding a feature, fixing a bug, running tests, creating a PR, deploying. Use the project's actual commands and file paths — not generic examples.

### 6. Where to Find Things
Directory map showing what lives where, annotated key files (entry points, configuration, error handlers, schemas), and a "Key Files" list with one-line descriptions. If `.claude/rules/` exists, document it: explain that path-scoped rules activate automatically per file type, and point to `docs/ai-memory-setup.md` for details. If `docs/decisions/` exists, explain the decision log format.

### 7. Troubleshooting
Known issues, common mistakes, and their solutions. Start with 5-10 entries based on setup complexity and common pitfalls from the tech stack. Add entries as issues are reported.

---

## What to Avoid

- **Do not write a tutorial** about the tech stack — assume developers know the tools, teach them the project
- **Do not duplicate specifications** — summarize and link to the authoritative doc
- **Do not include aspirational content** — document what the project IS, not what it will be
- **Do not make it a policy document** — link to coding standards and git workflow, do not reproduce them

---

## Process

1. **Read all input documents** listed above — skip any that do not exist
2. **Use subagents** to research and draft sections in parallel where possible
3. **Synthesize** — do not copy-paste from source docs. Rewrite in onboarding-guide voice: concise, practical, action-oriented
4. **Use AskUserQuestionTool** for:
   - Any missing prerequisites or environment details not found in docs
   - Whether to include project-specific troubleshooting entries the user knows about
5. **Write `docs/onboarding-guide.md`** following the guide structure above
6. **Self-verify** the "cold start test": Could a developer who has never seen the project understand the purpose (2 min), have a mental model (5 min), set up the environment (15 min), find any file (1 min), and complete a simple task (30 min)?
7. **Add tracking comment** on line 1: `<!-- scaffold:developer-onboarding-guide v<ver> <date> -->`

## After This Step

When this step is complete, tell the user:

---
**Finalization in progress** — `docs/onboarding-guide.md` created. New developers can now go from clone to contributing.

**Next:** Run `/scaffold:implementation-playbook` — Generate the step-by-step playbook agents follow during the build phase.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
