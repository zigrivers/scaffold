# Scaffold

A 25-prompt pipeline for scaffolding new software projects with Claude Code. Takes you from idea to implementation across 7 phases: product definition, project foundation, dev environment, testing, stories & planning, consolidation, and implementation.

## Installation

### Option 1: Claude Code Plugin (recommended)

```
/install scaffold@zigrivers/scaffold
```

Commands available as `/scaffold:command-name`.

### Option 2: User Commands (shorter prefix)

```bash
git clone https://github.com/zigrivers/scaffold
cd scaffold && ./scripts/install.sh
```

Commands available as `/user:command-name`.

To uninstall: `./scripts/uninstall.sh`

## Getting Started

Run `/scaffold:prompt-pipeline` to see the full pipeline, then start with:

```
/scaffold:create-prd <your idea>
```

Each command tells you what to run next when it finishes.

## Pipeline Overview

| Phase | Commands | What It Produces |
|-------|----------|-----------------|
| 1. Product Definition | `create-prd`, `prd-gap-analysis` | `docs/plan.md` |
| 2. Project Foundation | `beads`, `tech-stack`, `claude-code-permissions`, `coding-standards`, `tdd`, `project-structure` | Standards docs, CLAUDE.md, configs |
| 3. Dev Environment | `dev-env-setup`, `design-system`*, `git-workflow`, `multi-model-review`* | Dev server, CI, worktrees |
| 4. Testing | `add-playwright`*, `add-maestro`* | E2E test configs |
| 5. Stories & Planning | `user-stories`, `user-stories-gaps`, `platform-parity-review`* | `docs/user-stories.md` |
| 6. Consolidation | `claude-md-optimization`, `workflow-audit` | Optimized CLAUDE.md |
| 7. Implementation | `implementation-plan`, `implementation-plan-review`, `single-agent-start` | Working software |

\* = optional, depends on project type

### Ongoing Commands

| Command | When to Use |
|---------|-------------|
| `new-enhancement` | Add a feature to an existing project |
| `single-agent-resume` | Resume work after a break |
| `prompt-pipeline` | Show the full pipeline reference |

## How It Works

- **Source of truth**: `prompts.md` contains all 25 prompts in a single file
- **Commands**: `commands/` contains individual `.md` files with YAML frontmatter and "Next Steps" guidance
- **Pipeline-aware**: Each command tells you what to run next, including conditional steps based on project type
- **Beads integration**: Uses [Beads](https://github.com/steveyegge/beads) for task tracking throughout

## Key Dependencies

```
PRD --> Tech Stack --> Coding Standards --> TDD --> Project Structure
                                                        |
PRD --> User Stories --> Implementation Plan --> Execution
                                   |
Dev Setup --> Git Workflow --> CLAUDE.md Optimization --> Workflow Audit
                                                              |
                                                Implementation Plan Review
```

## Contributing

1. Edit `prompts.md` (the source of truth)
2. Update the corresponding file in `commands/` with any content changes
3. If adding a new command, update the frontmatter mapping in `scripts/extract-commands.sh`
