---
name: multi-model-research-dispatch
description: Patterns for dispatching research and adversarial challenge to external AI models (Codex, Gemini) with reconciliation rules and single-model fallback
topics: [multi-model, research, competitive-analysis, red-team, codex, gemini, dispatch, reconciliation]
---

# Multi-Model Research Dispatch

At higher methodology depths (4+), idea exploration and adversarial challenge benefit from independent research by external AI models. This entry provides dispatch patterns, reconciliation rules, and fallback strategies for research and red-team workflows.

## Summary

### When to Dispatch
| Depth | Research Dispatch | Challenge Dispatch |
|-------|-------------------|-------------------|
| 1-3 | Skip | Skip |
| 4 | 1 external model | 1 external model |
| 5 | Multi-model with reconciliation | Multi-model with reconciliation |

### Graceful Fallback Chain
1. Check if external CLI is available (`which codex`, `which gemini`)
2. If available, check auth (`codex login status`, `NO_BROWSER=true gemini -p "respond with ok" -o json`)
3. If auth succeeds, dispatch with timeout
4. If CLI unavailable or auth fails, skip that model — note in Session Metadata
5. If no external models available, fall back to primary model with distinct framing prompts
6. Never block the session waiting for unavailable tools

### Reconciliation Rules
- **2+ models agree** on the same finding = **consensus** — high confidence, present as validated
- **Models disagree** = **divergent** — present ALL perspectives including minority views. Do NOT suppress the minority. A 2-1 split where the lone dissent flags a real risk is more valuable than a comfortable consensus.
- **Single model** (fallback) = skip reconciliation labels. Present findings directly without consensus/divergent framing.

## Deep Guidance

### CLI Availability Check

Before dispatching, verify CLI tools are installed and authenticated:

```bash
# Codex CLI
which codex >/dev/null 2>&1 && codex login status 2>/dev/null
# Exit 0 = ready. Non-zero = skip Codex.

# Gemini CLI
which gemini >/dev/null 2>&1 && NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1
# Check for "ok" in response. Exit 41 = auth failure.
```

If auth fails, tell the user which tool failed and how to fix it:
- Codex: "Codex auth expired — run `codex login` to re-authenticate"
- Gemini: "Gemini auth expired — run `gemini -p 'hello'` to re-authenticate"

Auth failures are NOT silent fallbacks — surface them explicitly.

### Timeout Handling

| Dispatch type | Timeout |
|---------------|---------|
| Research dispatch (idea summary + questions) | 120 seconds |
| Challenge dispatch (full brief review) | 180 seconds |

If a dispatch times out:
- Use whatever partial response was received (if parseable)
- Note the timeout in Session Metadata
- Do NOT retry — proceed with available data

### Research Dispatch Mode

**When**: Phase 2 at depth 4-5.

**Prompt template for external model:**

```
You are conducting independent competitive research for a product idea.

IDEA: [1-2 sentence summary of the idea from Phase 1]

RESEARCH QUESTIONS:
1. What are the direct competitors in this space? For each, note what they do well and where they fall short.
2. What indirect alternatives exist — different approaches to the same problem?
3. How do users currently cope without a dedicated solution?
4. What recent market signals exist — funding rounds, product launches, shutdowns, regulatory changes?
5. What adjacent markets or analogous systems could inform this idea?

Be thorough and honest. Acknowledge competitor strengths — do not dismiss them.
Respond in structured markdown with one section per question.
```

**Execution:**

```bash
# Codex
codex exec --skip-git-repo-check -s read-only --ephemeral "RESEARCH_PROMPT" 2>&1

# Gemini
NO_BROWSER=true gemini -p "RESEARCH_PROMPT" --output-format json --approval-mode yolo 2>/dev/null
```

**Processing results:**
- Parse the response as structured markdown
- Extract key findings per research question
- If multi-model (depth 5), run reconciliation (see below)
- Present findings to the user conversationally, not as raw output

### Challenge Dispatch Mode (Red-Team)

**When**: Phase 6 at depth 4-5.

**Prompt template for external model:**

```
You are an adversarial reviewer stress-testing a product idea brief.
Your job is to find weaknesses, challenge assumptions, and surface missed opportunities.

SPARK BRIEF:
[Full content of the draft spark-brief.md]

CHALLENGE INSTRUCTIONS:
1. For each section, identify the weakest assumption and explain why it might be wrong.
2. What competitors or market dynamics does the brief underestimate?
3. What technical feasibility risks are glossed over?
4. What user segments or use cases are missing?
5. If you could only flag ONE critical risk, what would it be?

Be constructive but ruthless. The goal is to strengthen the idea, not validate it.
Respond in structured markdown with one section per challenge area.
```

**Processing results:**
- Parse challenges from response
- Present each challenge to the user one at a time
- For each challenge, ask: "Accept (update the brief), dismiss (explain why it's not applicable), or defer (note as open question)?"
- Track dispositions and update the brief accordingly

### Single-Model Fallback

When no external models are available, the primary model simulates multiple perspectives:

**Perspective 1 — Venture Capitalist**: "Analyze this idea as a VC evaluating a pitch. What's the market size? What's the defensibility? What are the unit economics? Would you invest?"

**Perspective 2 — Competitor's Product Lead**: "You're the product lead at [biggest competitor]. You just learned about this idea. What's your reaction? What would you do to defend your position? What aspects worry you?"

**Perspective 3 — Skeptical End User**: "You're a potential user who has tried and abandoned 3 similar products. What would make you try this one? What would make you abandon it after a week? What's the one thing that would keep you?"

Run each perspective as a separate reasoning pass. Synthesize the three viewpoints into findings the user can act on.

### Model Selection

| Task | Recommended model | Rationale |
|------|-------------------|-----------|
| Research dispatch | Either Codex or Gemini | Both capable of web-informed reasoning |
| Challenge dispatch | Either Codex or Gemini | Adversarial analysis is model-agnostic |
| Depth 4 (1 model) | Prefer Gemini (Google search built-in) | Strongest for competitive research |
| Depth 5 (multi) | Both Codex AND Gemini | Diverse perspectives from different architectures |
