# Multi-Model Code Review: Cost Analysis

## Current API Pricing (February 2026)

### Anthropic (Claude — the "Engineer" that writes code and fixes issues)

| Model | Input / 1M tokens | Output / 1M tokens | Notes |
|-------|-------------------|-------------------|-------|
| **Sonnet 4.5** | $3.00 | $15.00 | Recommended for fix cycles — best balance of cost and coding ability |
| Opus 4.6 | $5.00 | $25.00 | Overkill for automated fix loops |
| Haiku 4.5 | $1.00 | $5.00 | Too weak for reliable multi-file fixes |

**Optimization discounts:**
- Prompt caching: cache reads cost 10% of base input price (90% savings on repeated context like CLAUDE.md, review standards)
- Batch API: 50% off (not applicable — we need real-time fixes)

### OpenAI (Codex — the "Reviewer")

| Model | Input / 1M tokens | Output / 1M tokens | Notes |
|-------|-------------------|-------------------|-------|
| **o4-mini** | $1.10 | $4.40 | Recommended reviewer — strong reasoning, very cheap. *Note: reasoning tokens billed as output but invisible in API* |
| gpt-5.2-codex | $1.25 | $10.00 | Strongest code review, but hidden reasoning tokens can 2-4x the visible output cost |
| codex-mini-latest | $1.50 | $6.00 | Optimized for code tasks |
| gpt-4.1-mini | $0.40 | $1.60 | Budget option, weaker review quality |

**Key cost trap — reasoning tokens:** o4-mini and gpt-5.2-codex use internal reasoning tokens billed as output but not visible in the API response. A review that produces 500 visible output tokens might consume 2,000+ total output tokens. The estimates below account for this with a **3x reasoning multiplier** on output tokens.

### Google (Gemini — the "Second Reviewer")

| Model | Input / 1M tokens | Output / 1M tokens | Notes |
|-------|-------------------|-------------------|-------|
| **Gemini 2.5 Flash** | $0.15 | $0.60 | Recommended — extremely cheap, good quality for review. Thinking mode adds $3.50/1M output tokens |
| Gemini 2.5 Pro | $1.25 | $10.00 | Strong but expensive — similar cost to Codex |
| Gemini 3 Flash Preview | $0.50 | $3.00 | Newer, pricier than 2.5 Flash |
| Gemini 3 Pro Preview | $2.00 | $12.00 | Frontier model, expensive for review |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | Cheapest option, may miss subtle issues |

**Free tier note:** Gemini 2.5 Flash has a free tier (up to 500 RPD) that could cover low-volume usage during early development. However, free tier data may be used to improve Google's models.

---

## Token Usage Model: What a Typical PR Review Consumes

These estimates are based on real-world data from Claude Code cost tracking (Anthropic reports average $6/dev/day, 90% under $12/day), the O'Reilly article benchmarking review at ~52 seconds, and typical PR sizes in the 200-800 line diff range common in task-based development like your workflow.

### Per-Review Token Estimates

| Component | Input Tokens | Output Tokens | Why |
|-----------|-------------|--------------|-----|
| **PR diff** (context sent to reviewer) | ~8,000 | — | Average 400-line diff ≈ 8K tokens |
| **Project standards docs** (review-standards.md, coding-standards.md, tdd-standards.md snippets) | ~4,000 | — | Reviewer needs to know YOUR rules |
| **Review prompt** | ~1,000 | — | The instruction template |
| **Reviewer output** (findings/approval) | — | ~1,500 visible | Structured findings with file/line/suggestion |
| **Reasoning overhead** (OpenAI o-series only) | — | ~4,500 hidden | 3x multiplier for internal reasoning tokens |

**Total per review call:**
- Codex (o4-mini): ~13K input + ~6K output (including reasoning)
- Gemini (2.5 Flash): ~13K input + ~1.5K output (no hidden reasoning)
- Gemini (2.5 Flash thinking mode): ~13K input + ~4K output (thinking tokens)

### Per-Fix Token Estimates (Claude Code Action)

| Component | Input Tokens | Output Tokens | Why |
|-----------|-------------|--------------|-----|
| **Codebase context** (files read) | ~25,000 | — | Claude reads affected files, CLAUDE.md, standards docs |
| **Review findings** (from PR comments) | ~3,000 | — | Reading reviewer findings |
| **Fix prompt** | ~1,000 | — | Instructions |
| **Code changes + git operations** | — | ~8,000 | Writing fixes, running tests, committing |
| **Multi-turn tool use** (up to 10 turns) | ~15,000 | ~12,000 | Iterative fix-test-fix cycle |

**Total per fix cycle:** ~44K input + ~20K output

---

## Scenario Modeling

### Assumptions
- **PR volume:** 5 PRs per week (typical for a solo developer with Claude Code agents)
- **Convergence pattern:** 60% of PRs approve in round 1, 30% need round 2, 10% need round 3
- **Weighted average rounds per PR:** 1.5 rounds
- **Monthly PRs:** ~22 PRs

### Scenario A: Claude + OpenAI (Codex) Only

**Per PR round:**

| Step | Input Tokens | Output Tokens | Model | Cost |
|------|-------------|--------------|-------|------|
| Codex review | 13,000 | 6,000 | o4-mini ($1.10/$4.40) | $0.014 + $0.026 = **$0.04** |
| Claude fix (when needed) | 44,000 | 20,000 | Sonnet 4.5 ($3/$15) | $0.132 + $0.300 = **$0.43** |

**Monthly cost calculation:**

| | Round 1 (22 PRs) | Round 2 (8.8 PRs) | Round 3 (2.2 PRs) | Total |
|---|---|---|---|---|
| Codex reviews | 22 × $0.04 = $0.88 | 8.8 × $0.04 = $0.35 | 2.2 × $0.04 = $0.09 | **$1.32** |
| Claude fixes | 8.8 × $0.43 = $3.78 | 2.2 × $0.43 = $0.95 | 0 × $0.43 = $0.00 | **$4.73** |
| **Subtotal** | | | | **$6.05** |

| | Monthly | Annual |
|---|---|---|
| **Codex reviews** | $1.32 | $15.84 |
| **Claude fixes** | $4.73 | $56.76 |
| **GitHub Actions minutes** (~3 min/run × 33 runs × $0.008/min) | $0.79 | $9.50 |
| **Total** | **$6.84** | **$82.10** |

### Scenario B: Claude + Gemini Only

**Per PR round:**

| Step | Input Tokens | Output Tokens | Model | Cost |
|------|-------------|--------------|-------|------|
| Gemini review | 13,000 | 1,500 | 2.5 Flash ($0.15/$0.60) | $0.002 + $0.001 = **$0.003** |
| Gemini review (thinking mode) | 13,000 | 4,000 | 2.5 Flash + thinking ($0.15/$3.50) | $0.002 + $0.014 = **$0.016** |
| Claude fix (when needed) | 44,000 | 20,000 | Sonnet 4.5 ($3/$15) | $0.132 + $0.300 = **$0.43** |

**Monthly cost (using thinking mode for better review quality):**

| | Round 1 (22 PRs) | Round 2 (8.8 PRs) | Round 3 (2.2 PRs) | Total |
|---|---|---|---|---|
| Gemini reviews | 22 × $0.016 = $0.35 | 8.8 × $0.016 = $0.14 | 2.2 × $0.016 = $0.04 | **$0.53** |
| Claude fixes | 8.8 × $0.43 = $3.78 | 2.2 × $0.43 = $0.95 | 0 | **$4.73** |
| **Subtotal** | | | | **$5.26** |

| | Monthly | Annual |
|---|---|---|
| **Gemini reviews** | $0.53 | $6.36 |
| **Claude fixes** | $4.73 | $56.76 |
| **GitHub Actions minutes** | $0.79 | $9.50 |
| **Total** | **$6.05** | **$72.62** |

**Note on Gemini free tier:** If using the free tier (500 RPD), the Gemini review cost drops to $0. Monthly total becomes **$5.52** / **$66.26 annual**. However, free tier data may be used to train Google's models — likely fine for code review findings but worth knowing.

### Scenario C: Claude + Codex + Gemini (All Three)

**Per PR round:**

| Step | Input Tokens | Output Tokens | Model | Cost |
|------|-------------|--------------|-------|------|
| Codex review | 13,000 | 6,000 | o4-mini | **$0.04** |
| Gemini review | 13,000 | 4,000 | 2.5 Flash + thinking | **$0.016** |
| Claude fix (when needed) | 44,000 | 20,000 | Sonnet 4.5 | **$0.43** |

**Monthly cost:**

| | Round 1 (22 PRs) | Round 2 (8.8 PRs) | Round 3 (2.2 PRs) | Total |
|---|---|---|---|---|
| Codex reviews | 22 × $0.04 = $0.88 | 8.8 × $0.04 = $0.35 | 2.2 × $0.04 = $0.09 | **$1.32** |
| Gemini reviews | 22 × $0.016 = $0.35 | 8.8 × $0.016 = $0.14 | 2.2 × $0.016 = $0.04 | **$0.53** |
| Claude fixes | 8.8 × $0.43 = $3.78 | 2.2 × $0.43 = $0.95 | 0 | **$4.73** |
| **Subtotal** | | | | **$6.58** |

| | Monthly | Annual |
|---|---|---|
| **Codex reviews** | $1.32 | $15.84 |
| **Gemini reviews** | $0.53 | $6.36 |
| **Claude fixes** | $4.73 | $56.76 |
| **GitHub Actions minutes** (~4 min/run × 33 runs × $0.008/min) | $1.06 | $12.67 |
| **Total** | **$7.64** | **$91.63** |

---

## Side-by-Side Comparison

| | Claude + Codex | Claude + Gemini | All Three |
|---|---|---|---|
| **Monthly cost** | $6.84 | $6.05 | $7.64 |
| **Annual cost** | $82.10 | $72.62 | $91.63 |
| **Review diversity** | Single external perspective | Single external perspective | Two independent perspectives |
| **Review quality** | Strong (o4-mini has excellent reasoning) | Good (2.5 Flash + thinking is capable but less deep than o4-mini) | Best (different models catch different blind spots) |
| **Speed** | ~2-3 min per review round | ~1-2 min per review round (Flash is fast) | ~3-4 min (parallel, so wall-clock same as slowest) |
| **Reasoning tokens** | Hidden cost risk (3x multiplier) | Transparent (thinking tokens visible) | Mixed |
| **Setup complexity** | 1 API key + 1 reviewer job | 1 API key + 1 reviewer job | 2 API keys + 2 reviewer jobs |
| **Free tier available** | No | Yes (500 RPD) | Gemini portion only |

---

## Where the Money Actually Goes

The cost breakdown reveals something important: **the reviewer cost is almost irrelevant**. The overwhelming cost driver is the Claude Code fix cycle.

| Component | % of Monthly Cost (All Three scenario) |
|-----------|---------------------------------------|
| **Claude Code fixes** | **62%** ($4.73) |
| Codex reviews | 17% ($1.32) |
| GitHub Actions | 14% ($1.06) |
| Gemini reviews | 7% ($0.53) |

This means:
1. Adding Gemini on top of Codex costs only **$0.53/month more** — essentially free for a second perspective
2. The real cost lever is reducing the number of fix rounds, not choosing cheaper reviewers
3. Optimizing the fix prompt to be more surgical (fewer turns, smaller context) saves more than any reviewer choice

---

## Cost Under Different PR Volumes

| PRs/week | Monthly PRs | Claude + Codex | Claude + Gemini | All Three |
|----------|------------|----------------|-----------------|-----------|
| 2 | 9 | $2.81 | $2.48 | $3.13 |
| **5** | **22** | **$6.84** | **$6.05** | **$7.64** |
| 10 | 44 | $13.68 | $12.10 | $15.27 |
| 20 | 88 | $27.35 | $24.20 | $30.55 |
| 50 (team) | 220 | $68.38 | $60.49 | $76.37 |

Even at 50 PRs/week (a small team), the all-three configuration costs under $77/month — less than one hour of a senior engineer's code review time.

---

## Cost Optimization Strategies

### 1. Use Sonnet 4.5 (not Opus) for the fix cycle
Already assumed above. Switching to Opus 4.6 would **3.5x the fix cost** ($0.43 → $1.52 per fix), pushing monthly costs for all-three from $7.64 to $18.35.

### 2. Use prompt caching for standards documents
The review-standards.md and coding-standards.md are sent with every review call. With prompt caching enabled, repeated calls within 5 minutes (which happens in the parallel review + fix loop) reduce the ~4K standards context from $0.012 to $0.0012 per call. Savings: ~$0.30/month. Small but free.

### 3. Use gpt-4.1-mini instead of o4-mini if reviews are too expensive
Drops Codex review cost from $0.04 to $0.01 per review. But weaker reasoning means more false positives → more fix rounds → potentially higher Claude fix costs. Test before committing.

### 4. Use Gemini free tier for development, paid for production
The 500 RPD free tier covers up to ~16 PRs/day. For solo development, this is more than enough. Switch to paid tier only if you need data privacy guarantees or exceed the rate limit.

### 5. Skip round 2+ fixes for medium-severity issues
The prompt already says "only fix critical and high." Enforcing this strictly reduces the percentage of PRs needing round 2 from 30% to ~15%, cutting fix costs nearly in half.

### 6. Run Claude's built-in /code-review locally before pushing
Using Claude Code hooks to auto-review on the Stop hook catches easy issues before the PR is even created. This means external reviewers only see code that's already passed one quality gate, reducing findings and fix rounds. The O'Reilly article measured this at ~52 seconds per local review — very cheap since it's covered by your existing Claude Code subscription/API usage.

---

## Recommendation

**Start with Claude + Codex (Scenario A).**

Reasoning:
- o4-mini's reasoning capability produces higher-quality reviews than Gemini 2.5 Flash, meaning fewer false positives and fewer wasted fix rounds
- At $6.84/month, the cost is negligible compared to the value of catching bugs before they ship
- Single API key to manage (you likely already have an OpenAI key)
- If it works well after 2-4 weeks, add Gemini as the second reviewer — it only adds $0.53/month and gives you a genuinely independent second perspective
- The "all three" configuration at $7.64/month is the long-term sweet spot — two independent reviewers with different model architectures catching different classes of issues, at a cost that rounds to zero against developer productivity gains

**What NOT to do:**
- Don't use Opus 4.6 for the fix cycle — it's 3.5x the cost of Sonnet 4.5 and the fix prompt doesn't need frontier reasoning, just competent coding
- Don't use gpt-5.2-codex for reviews — hidden reasoning tokens make costs unpredictable, and o4-mini is nearly as capable for review tasks
- Don't use Gemini 2.5 Pro or 3 Pro for reviews — you're paying frontier model prices for a task that Flash handles well
