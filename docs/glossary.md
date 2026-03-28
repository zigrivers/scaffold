# Glossary

Key terms used throughout the scaffold pipeline.

## Pipeline Concepts

**Greenfield**
Starting a new project from scratch with no existing code. The pipeline creates all artifacts (PRD, domain model, ADRs, etc.) from the initial project description. Most pipeline steps operate in "create mode" when no prior artifact exists.

**Brownfield**
Adopting scaffold on an existing project with existing code and documentation. Pipeline steps detect existing artifacts and operate in "update mode," preserving prior work and incrementally filling gaps rather than generating from scratch.

**Depth Levels (1-5)**
Methodology scaling parameter controlling how thorough each pipeline step is. Configured per-run to match project needs:
- **Depth 1-2**: Minimal/MVP. Abbreviated passes, fewer review cycles, suitable for prototypes or spikes.
- **Depth 3**: Standard. Full pass coverage with single-model review. The default for most projects.
- **Depth 4-5**: Comprehensive. Multi-model review with external AI dispatch (Codex, Gemini), extended analysis passes, and cross-artifact consistency checks.

**Wave Plan**
Parallelization strategy in implementation plans where independent tasks are grouped into waves that can execute concurrently. Each wave contains tasks with no dependencies on other tasks in the same wave. Tasks in wave N+1 depend on one or more tasks in wave N or earlier. Enables multi-agent parallel execution via git worktrees.

**Conditional Step**
A pipeline step marked `conditional: "if-needed"` in its frontmatter that may be skipped based on project type or configuration. For example, UX specification is conditional for CLI-only projects, and database schema is conditional for projects with no persistent storage.

**Update Mode**
When a pipeline step detects that its output artifact already exists, it operates incrementally rather than from scratch. Update mode preserves prior findings, adds new analysis, and marks what changed since the last run. Every document-creating step includes a Mode Detection block that checks for existing artifacts.

**Multi-Model Review**
At depth 4+, the review process dispatches analysis work to external AI models (Codex, Gemini) for independent review of the same artifact. Each model's findings are collected as JSON artifacts, then synthesized into a unified review document. This reduces single-model blind spots and provides broader coverage of failure modes.

## Review Concepts

**Finding Severity (P0-P3)**
Priority classification for review findings:
- **P0**: Blocking. The artifact cannot be used downstream without fixing this. Examples: missing entity in domain model, security vulnerability in API contract.
- **P1**: Significant. The artifact is usable but will cause problems during implementation. Examples: missing error states, inconsistent naming.
- **P2**: Improvement. The artifact works but could be better. Examples: missing documentation, suboptimal index strategy.
- **P3**: Nitpick. Style or preference issues that don't affect correctness. Examples: naming conventions, comment formatting.

## Architecture Concepts

**Phase**
A named stage of the pipeline. There are 14 phases (numbered 0-13), each containing one or more pipeline steps. Phases are sequential -- steps in phase N may depend on outputs from phases 0 through N-1.

**Knowledge Entry**
A markdown file in `knowledge/` containing domain expertise on a specific topic. Knowledge entries are injected into pipeline steps during command assembly based on the `knowledge-base` field in each step's frontmatter.

**Meta-Prompt**
A pipeline step definition in `pipeline/` that contains the structured prompt template, frontmatter metadata (phase, order, dependencies, outputs), and instructions for producing a specific artifact.
