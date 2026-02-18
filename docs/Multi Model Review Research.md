# Multi-Model Code Review: Research Summary

## What People Are Doing Today

The emerging pattern in AI-assisted development is "model-vs-model" review — using a different model to critique code than the one that wrote it. This avoids the "marking your own homework" problem where a single model approves its own patterns, misses its own blind spots, and silently hides medium-confidence issues behind threshold filters.

**Current approaches fall into three tiers:**

**Tier 1: Same-model self-review (most common, weakest)**
Claude Code's built-in `/code-review` plugin launches 4 parallel Claude subagents to review a PR. This catches surface issues but shares the same model biases. The O'Reilly article "Auto-Reviewing Claude's Code" documents how even Opus 4.5 repeatedly makes the same mistakes (silent default fallbacks, swallowed exceptions) regardless of system prompt instructions — because the reviewing model has the same tendencies as the authoring model.

**Tier 2: Cross-model review via CI (emerging, what we want)**
A few teams are wiring multiple models into GitHub Actions. The `levnikolaevich/claude-code-skills` plugin delegates code and story reviews to Codex and Gemini agents running in parallel, with automatic fallback to Claude if external agents are unavailable. Kim Major at Flow Specialty documented automating plan reviews where Claude Code produces a planning document, then Codex CLI is invoked to critique it — with Claude ingesting the critique, updating the plan, and repeating with a hard cap. The key lesson: "independent review is only meaningful if you define what context is allowed" and "exit conditions must be crisp."

**Tier 3: Full iterative convergence loop (what we're building)**
Nobody has published a complete, automated, multi-round convergence loop with multiple external reviewers that runs entirely in CI. The pieces all exist — they just haven't been composed into a single orchestrated workflow. That's what the Multi-Model Code Review prompt sets up.

---

## Available Tools

| Tool | What It Does | How to Invoke in CI |
|------|-------------|-------------------|
| **Claude Code Action** | Full Claude Code session in GitHub Actions. Can read code, write files, push commits, post PR comments. | `anthropics/claude-code-action@v1` |
| **Codex Action** | Runs OpenAI Codex CLI in GitHub Actions. Can read code, generate structured JSON output, run in read-only sandbox. | `openai/codex-action@v1` |
| **Gemini CLI Action** | Runs Google Gemini CLI in GitHub Actions. Can read code, post structured review comments. | `google-github-actions/run-gemini-cli@v1` |
| **Codex Cloud** | Auto-reviews PRs when connected via GitHub App. Posts P0/P1 findings. Reads `AGENTS.md` for custom review instructions. | GitHub App — no API key needed (uses ChatGPT subscription credits) |
| **Gemini Code Assist** | Auto-reviews PRs when installed as GitHub App. Posts severity-graded findings. | GitHub App + `/gemini review` |

---

## Codex Cloud (GitHub App)

### How It Works

Codex Cloud is a GitHub App that auto-reviews PRs using credits from your ChatGPT subscription — no OpenAI API key required. After installing the "ChatGPT Codex Connector" GitHub App on your repository and enabling "Code review" in Codex settings:

1. Every PR triggers an automatic review by Codex Cloud
2. Codex reads `AGENTS.md` at the repo root for custom review instructions
3. Reviews are posted as PR comments (prose, not structured JSON)
4. No API key needed — uses credits from your ChatGPT subscription (~25 credits per review, weekly limits vary by plan)

### Key Characteristics

- **Cost**: Credit-based (~25 credits per review); weekly limits vary by plan (not truly unlimited)
- **Severity**: Flags P0/P1 issues only. P2/P3 are handled by local self-review (Tier 1).
- **Output format**: Prose comments, not structured JSON — convergence checks look for an explicit approval signal (`APPROVED: No P0/P1 issues found.`) rather than parsing findings
- **Custom instructions**: Reads `AGENTS.md` at repo root (not a prompt file in `.github/`). Recommended heading: `## Review guidelines`
- **Bot username**: `chatgpt-codex-connector[bot]` (standard Codex Cloud GitHub App — verify with a test PR if different)
- **Trigger**: Automatic on PR creation/update — no `@codex review` comment needed. Posts a `pull_request_review` event that can be handled event-driven (no polling required).
- **Limitations**: Less control over review prompt than Codex Action; credit limits may block reviews on high-volume repos; posts a usage-limit comment when credits are exhausted

### Subscription vs API Key

| Approach | Cost | Control | Setup |
|----------|------|---------|-------|
| **Codex Cloud (subscription)** | Credit-based (~25 credits/review, weekly limits) | Medium — custom instructions via AGENTS.md only | Install GitHub App, enable code review |
| **Codex Action (API key)** | ~$0.04/review (o4-mini) | High — full prompt control, structured JSON output | `OPENAI_API_KEY` repo secret, custom workflow |

**Our recommendation**: Use Codex Cloud for reviews (low marginal cost via credits) and reserve API keys for the fix cycle (Claude Code Action needs `ANTHROPIC_API_KEY`).

### Event-Driven Architecture

Codex Cloud posts a `pull_request_review` event when its review is complete. This means the review loop can be fully event-driven — a handler workflow triggered by `pull_request_review: [submitted]` fires only when Codex actually posts, eliminating the need to poll. The trigger workflow (on `pull_request: [opened, synchronize]`) just sets up the gate and labels; the handler workflow does convergence checking and fix dispatch. An optional timeout cron workflow handles the case where Codex never responds.

---

## Key Design Decisions from Research

**1. Structured output is essential for API-driven loops.**
Codex Action supports `--output-schema` to produce typed JSON (findings array with severity, file, line, explanation, suggestion). Gemini's CLI action outputs structured markdown with severity ratings. However, Codex Cloud posts prose — so when using the GitHub App approach, convergence detection uses explicit approval signals ("APPROVED: No P0/P1 issues found") rather than JSON parsing.

**2. Fresh sessions prevent "agreeing because we already agreed."**
Kim Major's key finding: iterative sessions converge into a shared narrative where the reviewer stops pushing back. Fresh sessions (no prior conversation history) preserve the independence of each review round. Each review round should be a clean invocation, not a continuation.

**3. Hard cap on rounds prevents infinite loops.**
Every practitioner who implemented review loops hit the same issue: fuzzy agreement detection causes pointless cycling. The consensus is 3 rounds maximum. After 3 rounds, auto-merge rather than blocking indefinitely — the self-review and external review have already caught the major issues.

**4. Separate "what to check" from "how to check."**
The review prompt should reference the project's standards (CLAUDE.md, coding-standards.md, tdd-standards.md) so reviewers check against YOUR rules, not generic best practices. Generic reviews produce noise; project-anchored reviews produce signal.

**5. The reviewing model should NOT have write access.**
Reviewers run in read-only mode. Only Claude Code (the engineer) has write access. This prevents reviewers from making changes that conflict with each other and maintains a single source of truth for the codebase.

---

## Citations & Sources

- **O'Reilly article**: "Auto-Reviewing Claude's Code" — documents Opus 4.5's repeated mistakes and the limitations of same-model self-review
- **Kim Major (Flow Specialty)**: Iterative plan review using Codex CLI critique → Claude Code update cycle, with hard caps on rounds. Key insight: define allowed context and crisp exit conditions
- **levnikolaevich/claude-code-skills**: Plugin delegating code/story reviews to Codex + Gemini agents in parallel with Claude fallback
- **Codex Cloud documentation**: GitHub App auto-review using ChatGPT subscription, `AGENTS.md` for custom instructions
- **Anthropic Claude Code Action**: `anthropics/claude-code-action@v1` — full Claude Code session in GitHub Actions
