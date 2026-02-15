# Multi-Model Code Review: Cost Analysis

## Architecture Summary

The review loop has two tiers:

| Tier | What | Cost |
|------|------|------|
| **Tier 1: Local self-review** | Claude subagent reviews changes before push | $0 (covered by Claude Code subscription/API) |
| **Tier 2: Codex Cloud review** | GitHub App auto-reviews PRs | $0 per review (ChatGPT Pro subscription) |
| **Fix cycle** | Claude Code Action fixes findings in CI | ~$0.43 per fix (ANTHROPIC_API_KEY) |

**Only one API key needed:** `ANTHROPIC_API_KEY` (for the fix cycle in GitHub Actions).

---

## Current API Pricing (February 2026)

### Anthropic (Claude — the "Engineer" that fixes issues)

| Model | Input / 1M tokens | Output / 1M tokens | Notes |
|-------|-------------------|-------------------|-------|
| **Sonnet 4.5** | $3.00 | $15.00 | Recommended for fix cycles — best balance of cost and coding ability |
| Opus 4.6 | $5.00 | $25.00 | Overkill for automated fix loops |
| Haiku 4.5 | $1.00 | $5.00 | Too weak for reliable multi-file fixes |

**Optimization discounts:**
- Prompt caching: cache reads cost 10% of base input price (90% savings on repeated context like CLAUDE.md, review standards)
- Batch API: 50% off (not applicable — we need real-time fixes)

### Codex Cloud (Subscription-Based Review)

| Subscription | Monthly Cost | Reviews Included | Notes |
|-------------|-------------|------------------|-------|
| **ChatGPT Pro** | $200/month | Unlimited | Covers Codex Cloud auto-reviews at $0/review |
| ChatGPT Plus | $20/month | Limited | May have review caps — verify current limits |
| ChatGPT Team | $25/user/month | Included | Team plan includes Codex Cloud |

**Key point:** If you already have a ChatGPT Pro subscription, Codex Cloud reviews are a sunk cost — $0 marginal cost per review.

---

## Token Usage Model: What a Fix Cycle Consumes

### Per-Fix Token Estimates (Claude Code Action)

| Component | Input Tokens | Output Tokens | Why |
|-----------|-------------|--------------|-----|
| **Codebase context** (files read) | ~25,000 | — | Claude reads affected files, CLAUDE.md, standards docs |
| **Review findings** (from PR comments) | ~3,000 | — | Reading Codex Cloud findings |
| **Fix prompt** | ~1,000 | — | Instructions |
| **Code changes + git operations** | — | ~8,000 | Writing fixes, running tests, committing |
| **Multi-turn tool use** (up to 10 turns) | ~15,000 | ~12,000 | Iterative fix-test-fix cycle |

**Total per fix cycle:** ~44K input + ~20K output

**Cost per fix (Sonnet 4.5):** $0.132 (input) + $0.300 (output) = **$0.43**

---

## Scenario: Codex Cloud + Claude Fix

### Assumptions
- **PR volume:** 5 PRs per week (typical for a solo developer with Claude Code agents)
- **Convergence pattern:** 60% of PRs approve in round 1, 30% need round 2, 10% need round 3
- **Weighted average rounds per PR:** 1.5 rounds
- **Monthly PRs:** ~22 PRs

### Monthly Cost

| | Round 1 (22 PRs) | Round 2 (8.8 PRs) | Round 3 (2.2 PRs) | Total |
|---|---|---|---|---|
| Codex Cloud reviews | $0 | $0 | $0 | **$0** |
| Claude fixes | 8.8 × $0.43 = $3.78 | 2.2 × $0.43 = $0.95 | 0 × $0.43 = $0.00 | **$4.73** |
| **Subtotal** | | | | **$4.73** |

| | Monthly | Annual |
|---|---|---|
| **Codex Cloud reviews** | $0 | $0 |
| **Claude fixes** | $4.73 | $56.76 |
| **GitHub Actions minutes** (~3 min/run × 33 runs × $0.008/min) | $0.79 | $9.50 |
| **Total** | **$5.52** | **$66.26** |

---

## Where the Money Goes

| Component | % of Monthly Cost |
|-----------|------------------|
| **Claude Code fixes** | **86%** ($4.73) |
| GitHub Actions minutes | **14%** ($0.79) |
| Codex Cloud reviews | **0%** ($0) |

The real cost lever is reducing the number of fix rounds, not the reviewer. Self-review (Tier 1) catches easy issues before the PR is created, reducing external review findings and fix rounds.

---

## Cost Under Different PR Volumes

| PRs/week | Monthly PRs | Monthly Cost | Annual Cost |
|----------|------------|--------------|-------------|
| 2 | 9 | $2.26 | $27.17 |
| **5** | **22** | **$5.52** | **$66.26** |
| 10 | 44 | $11.04 | $132.52 |
| 20 | 88 | $22.08 | $265.04 |
| 50 (team) | 220 | $55.21 | $662.60 |

Even at 50 PRs/week (a small team), the total cost is under $56/month — less than one hour of a senior engineer's code review time.

---

## Cost Optimization Strategies

### 1. Use Sonnet 4.5 (not Opus) for the fix cycle
Already assumed above. Switching to Opus 4.6 would **3.5x the fix cost** ($0.43 → $1.52 per fix), pushing monthly costs from $5.52 to $18.35.

### 2. Use prompt caching for standards documents
The review-standards.md and coding-standards.md are sent with every fix call. With prompt caching enabled, repeated calls within 5 minutes reduce the ~4K standards context from $0.012 to $0.0012 per call. Savings: ~$0.30/month. Small but free.

### 3. Self-review catches easy issues locally
The self-review step (Tier 1) runs before the PR is created, using a Claude subagent to check changes against project standards. This means Codex Cloud only sees code that's already passed one quality gate, reducing findings and fix rounds. Estimated reduction: 20-30% fewer fix rounds.

### 4. Tune AGENTS.md to reduce false positives
Codex Cloud reads `AGENTS.md` for review instructions. Adding "What NOT to flag" examples from real reviews reduces noise, which means fewer fix rounds triggered by false positives.

---

## Comparison: Codex Cloud vs Codex Action (API)

| | Codex Cloud (Subscription) | Codex Action (API) |
|---|---|---|
| **Review cost** | $0/review | ~$0.04/review (o4-mini) |
| **Monthly review cost (22 PRs, 1.5 rounds)** | $0 | $1.32 |
| **Total monthly cost** | $5.52 | $6.84 |
| **API key needed** | No (GitHub App) | Yes (`OPENAI_API_KEY`) |
| **Output format** | Prose (approval signal detection) | Structured JSON (parseable findings) |
| **Prompt control** | AGENTS.md only | Full prompt file |
| **Setup** | Install GitHub App + enable | Repo secret + custom workflow |

**Recommendation:** Use Codex Cloud. The $1.32/month savings from not needing an OpenAI API key is minor, but the simpler setup and zero API management make it the better choice for most projects.

---

## Optional: Adding Gemini Code Assist as Second Reviewer

If you want a second perspective, install the Gemini Code Assist GitHub App. This adds a second independent reviewer at no API cost (subscription-based or free tier). The convergence check would require both reviewers to approve before auto-merging.

Additional monthly cost: $0 (Gemini Code Assist free tier covers low-volume usage).

---

## Recommendation

**Use Codex Cloud (subscription) for reviews + ANTHROPIC_API_KEY for fixes.**

Reasoning:
- $0 marginal cost for reviews if you already have a ChatGPT Pro subscription
- Single API key to manage (`ANTHROPIC_API_KEY`)
- At $5.52/month total, the cost is negligible compared to the value of catching bugs before they ship
- Self-review (Tier 1) further reduces costs by catching easy issues locally
- If you want a second reviewer later, add Gemini Code Assist — it's free and independent

**What NOT to do:**
- Don't use Opus 4.6 for the fix cycle — it's 3.5x the cost of Sonnet 4.5 and the fix prompt doesn't need frontier reasoning, just competent coding
- Don't use Codex Action (API) unless you need structured JSON output for a custom convergence pipeline
- Don't skip self-review — it's the cheapest way to reduce fix round costs
