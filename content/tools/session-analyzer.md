---
name: session-analyzer
description: Analyze session history to find automation opportunities
phase: null
order: null
dependencies: []
outputs: []
conditional: null
stateless: true
category: tool
knowledge-base: [session-analysis]
---

## Purpose

Analyze all Claude Code sessions on this computer and identify repeated tasks,
workflows, decisions, and patterns across every project — then recommend what
to automate as skills, plugins, agents, and claude.md rules.

## Inputs

| Flag | Description |
|------|-------------|
| `--project <name>` | Focus deep analysis on one project (match against `~/.claude/projects/` directory names) |
| `--depth shallow` | Use only `history.jsonl` and `stats-cache.json` — fast, skips session sampling |
| `--depth deep` | Sample session transcripts from all active projects (default when omitted) |
| `--output <path>` | Save the report as a markdown file at the specified path |

## Expected Outputs

A structured recommendations report containing:
- Summary statistics (sessions, projects, date range, prompt count)
- Top 10 skills to build
- Top 5 plugins/tools to build
- Top 5 agents to build
- Most important missing claude.md sections
- Build-first recommendation with scoring
- Ranked build-order backlog (top 15 items)

## Instructions

### Phase 1: Data Collection

Use **parallel subagents** to read the data sources below simultaneously. Each subagent handles one or two sources and returns a structured summary — not raw content.

#### 1.1 Prompt History Index

Read `~/.claude/history.jsonl` fully. Each line is a JSON object:
```json
{ "display": "<the prompt text>", "timestamp": 1234567890, "project": "/path/to/project" }
```

Extract:
- Total prompt count and date range
- All unique project paths and their prompt counts
- All prompt text (store as an array for clustering in Phase 2)
- The 5 most active projects by prompt count

#### 1.2 Activity Statistics

Read `~/.claude/stats-cache.json`. Extract:
- Daily message counts and session counts
- Most active days/weeks
- Overall usage volume

#### 1.3 Project Discovery

List all directories under `~/.claude/projects/`. For each project directory:
- Count the number of `.jsonl` session files
- Note the most recently modified session file date
- Identify if a CLAUDE.md-style file exists in that project's working directory

#### 1.4 Session Transcript Sampling

Skip this step if `--depth shallow` was passed.

For the **5 most active projects** identified in step 1.1:
- Find the 5 most recently modified `.jsonl` session files in `~/.claude/projects/<project-slug>/`
- Read the first 80 lines of each session file
- From each line, extract only entries where `type == "user"` (user messages only, skip assistant and tool responses)
- Summarize the user messages from each session — do not reproduce raw content

#### 1.5 Plan Title Clustering

List all files in `~/.claude/plans/`. For each `.md` file:
- Read only the first 3 lines (title + brief context)
- Note the filename slug (e.g., `calm-fixing-storm.md` — likely a bug-fix plan)
- Identify recurring themes across plan titles

#### 1.6 Cross-Project CLAUDE.md Patterns

For the 5 most active projects identified in step 1.1:
- Locate the project's working directory from the path-encoded slug in `~/.claude/projects/`
- Read its `CLAUDE.md` if it exists
- Extract: key rules, repeated commands, tool preferences, workflow constraints
- Note rules that appear in 2+ project CLAUDE.md files (these are likely global preferences)

---

### Phase 2: Pattern Recognition

Using the data collected in Phase 1, identify patterns by category. Focus on **recurrence** — one-off requests are not patterns.

#### 2.1 Prompt Clustering

Group the prompt history by semantic similarity. Look for:
- Prompts that follow the same template structure (e.g., "Create a PRD for X", "Write tests for Y")
- Prompts that reference the same type of task across different projects
- Prompts that start with the same verbs or follow the same format

Flag any prompt pattern that appears **3 or more times** as a candidate for automation.

#### 2.2 Repeated Workflow Sequences

Look for multi-step patterns — sequences of prompts in the same session or across sessions that follow the same order:

Examples to detect:
- Always: plan then implement then test then commit
- Always: read file then understand then refactor then verify
- Always: create task then write code then write tests then PR

#### 2.3 Correction and Preference Patterns

Scan for patterns that indicate stated preferences or corrections:
- Phrases like "always", "never", "don't", "remember to", "make sure to"
- Corrections where the user had to re-prompt because the previous response didn't follow a preference
- Project-agnostic preferences that appear in multiple projects

#### 2.4 Tool and Integration Requests

Look for prompts asking Claude to:
- Access external services (GitHub, Jira, Slack, Notion, Linear, etc.)
- Search for information online
- Read/write files outside the project directory
- Run scripts or CLI tools in specific ways
- Transform data between formats (JSON to CSV, screenshot to code, etc.)

#### 2.5 Autonomy and Orchestration Requests

Look for prompts that describe **multi-step workflows** needing minimal supervision:
- "Do X, then Y, then Z"
- "Every time I do X, also do Y"
- "Check Z before you do X"
- "Run until all tasks are done"
- Any request for a loop, pipeline, or sequence with conditional steps

---

### Phase 3: Categorization

Sort each identified pattern into exactly one of these 4 buckets. Use the decision criteria below.

#### Bucket A: Skills
**Definition:** A repeatable thinking or writing task that can be captured as a reusable structured prompt. The output is predictable and follows a consistent format.

**Decision criteria:** Use this bucket if:
- The same prompt structure was used 3+ times
- The task produces a document, analysis, or structured artifact
- The task requires thinking/judgment but follows a known process
- No external system access required

**Examples:** Code review checklist, PRD creation, git commit message generation, explaining a codebase to a new dev, writing test plans.

#### Bucket B: Plugins / Tools
**Definition:** A task that requires access to external systems, APIs, web content, databases, or file integrations. The bottleneck is data access, not reasoning.

**Decision criteria:** Use this bucket if:
- The task requires reading from or writing to an external service
- The task requires searching the web or scraping data
- The task requires transforming data between systems
- The task would be trivially easy if Claude had the data, but currently requires the user to copy-paste

**Examples:** GitHub PR status fetcher, Jira ticket creator, Slack message summarizer, browser automation, CSV data analysis.

#### Bucket C: Agents
**Definition:** A multi-step autonomous workflow that requires decision-making, orchestration, or running until a condition is met. The value is in the automation of a sequence, not just a single step.

**Decision criteria:** Use this bucket if:
- The task involves 5+ sequential steps that are always done together
- The task requires branching logic or conditional decisions
- The task runs until a condition is met (e.g., "keep trying until tests pass")
- The task coordinates multiple tools or sessions

**Examples:** End-to-end feature implementation loop, automated code review and fix cycle, CI failure diagnosis and fix agent, multi-file refactor with test verification.

#### Bucket D: claude.md Rules
**Definition:** A rule, preference, standard, or project context that is currently being stated ad-hoc in prompts instead of being captured once in CLAUDE.md (or a per-project config).

**Decision criteria:** Use this bucket if:
- The user has stated the same rule 2+ times across sessions
- The rule could be written once and would apply to all future sessions
- The rule is about tone, format, process, or project context (not task-specific logic)

**Examples:** "Always use TypeScript strict mode", "Never commit without running tests", "Use kebab-case for file names", "This project uses Postgres not MySQL".

---

### Phase 4: Detailed Analysis

For **every item** identified in Phase 3, produce a structured entry:

```
### [Bucket] Item Name

**What I keep doing:** [1-2 sentences describing the repeated pattern]

**Why this bucket:** [1 sentence justifying the categorization]

**Frequency:** [Exact count from history, or estimate with reasoning]

**Time saved per use:** [Estimated minutes saved each time this is automated]

**Suggested implementation:**
[2-4 sentences describing what building this would look like. For skills: describe the prompt structure. For plugins: name the API or integration needed. For agents: describe the steps and decision points. For claude.md: quote the exact rule.]

**Priority:** [High / Medium / Low]
[Justify: High = frequent + high time savings + easy to build. Low = rare or hard to build.]
```

---

### Phase 5: Recommendations Report

After completing Phase 4, produce the final report with these sections in order:

#### Summary Stats

```
Sessions analyzed: [N]
Projects analyzed: [N]
Date range: [earliest] to [latest]
Total prompts reviewed: [N]
Patterns identified: [N] (Skills: N, Plugins: N, Agents: N, claude.md: N)
```

#### Top 10 Skills to Build

Ranked by: frequency x time-saved / implementation effort.

For each, include: name, one-line description, estimated weekly time saved, priority.

#### Top 5 Plugins / Tools to Build

Ranked by: how often the user is blocked or doing manual copy-paste that a tool would eliminate.

For each, include: name, what external system it connects to, the core capability needed, priority.

#### Top 5 Agents to Build

Ranked by: how many sequential steps it automates, how often the workflow runs.

For each, include: name, the workflow it automates, estimated steps saved per run, priority.

#### Most Important Missing claude.md Sections

List the top rules/preferences that appeared repeatedly in prompts but are not yet captured in a claude.md. For each:
- The rule itself (suggested wording)
- How often it was re-stated in prompts
- Which projects it applies to (all / specific project)

#### Build-First Recommendation

Recommend the single best thing to build first. Score each item using:

```
Score = (Impact x 3) + (Frequency x 2) + (Ease x 1)
```

Where each dimension is rated 1-5:
- **Impact**: How much friction or time does this eliminate per use?
- **Frequency**: How often does the pattern occur per week?
- **Ease**: How quick is it to implement? (5 = under 30 min, 1 = requires significant infrastructure)

Present the top 3 scored items and explain the winner.

#### Recommended Build Order

A ranked backlog of the top 15 items across all 4 buckets, ordered by score. Format as a table:

| Rank | Type | Name | Score | Reason |
|------|------|------|-------|--------|
| 1 | Skill | ... | 22 | High frequency, easy to build |
| 2 | claude.md | ... | 20 | Stated 8x, zero effort to capture |
| ... | | | | |

---

## Process Rules

1. **Read-only** — never write, modify, or delete any files in `~/.claude/`
2. **Privacy-aware** — summarize patterns only; do not reproduce raw conversation content, API keys, passwords, or sensitive data
3. **Subagents for data collection** — use parallel subagents in Phase 1 to read multiple data sources simultaneously; this keeps the main context from filling with raw session data
4. **Subagents return summaries** — each subagent should return structured summaries, not raw file contents
5. **Handle sparse data gracefully** — if `history.jsonl` has fewer than 50 entries, note this and proceed with what's available; don't fabricate patterns
6. **Depth flag controls scope** — `--depth shallow` skips steps 1.4 and 1.6 (no session transcript sampling, no cross-project CLAUDE.md reading)
7. **Project flag focuses analysis** — if `--project <name>` is passed, steps 1.4 and 1.6 read from that project only; steps 1.1-1.3 still cover all projects for context
8. **No output file by default** — present the report inline; if `--output <path>` is passed, also save to that path as markdown
9. **Minimum 3 examples** — don't put an item in Bucket A (Skills) unless you found at least 3 concrete examples; note the exact prompts that support the pattern
10. **Frequency beats recency** — a pattern that appeared 10 times last year beats one that appeared 3 times this week
