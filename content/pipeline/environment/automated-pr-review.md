---
name: automated-pr-review
description: "Agent-driven automated code review via MMR — the generated project's mandatory entry point is direct `mmr review --pr <N> --sync --format json`, not a scaffold wrapper, for PR and non-PR targets"
summary: "Configures agent-driven automated code review: mandatory after `gh pr create` and also usable on any non-PR target. The entry point is direct `mmr review --pr <N> --sync --format json` (Codex, Antigravity, Claude) with finite root-cause dispositions and at most three rounds per bounded remediation cycle; `scaffold run review-pr` / `scaffold run review-code` add the Superpowers channel when scaffold is present. A GitHub App reviewer is a fallback when CLIs are unavailable."
phase: "environment"
order: 340
dependencies: [git-workflow]
outputs: [AGENTS.md, docs/review-standards.md, scripts/cli-pr-review.sh, scripts/await-pr-review.sh]
reads: [tdd]
conditional: "if-needed"
knowledge-base: [review-methodology, automated-review-tooling]
---

## Purpose
Configure an agent-driven automated code review system using local CLI
reviewers dispatched through MMR (Codex, Antigravity, Claude — runs all
three when available). The mandatory entry point in the generated project is
direct `mmr review --pr <N> --sync --format json` — not a scaffold wrapper,
since the generated project cannot assume `scaffold` itself is installed.
The review is mandatory after `gh pr create` and also runs on non-PR targets
(local staged/unstaged code, branch diffs, specific files) via the same
`mmr review` CLI. The original task and acceptance criteria bound PR scope.
Mandatory guardrails include at minimum security, privacy, and data integrity
(including preventing data loss or corruption), plus every repository or
product safeguard required by project instructions.
Reconcile findings by root cause into `fix-now`, `block`, `reject:<reason>`,
or `follow-up:<bead-id>`. Severity alone never creates backlog work. A
follow-up must be reproducible, actionable, non-duplicate, worth scheduling,
and outside the current PR's required scope. Review allows a maximum of three
rounds per review cycle and stops when every root cause has a disposition and no
verified fix-now or block item remains. If round three finds a reproducible
in-scope or required-safeguard defect, make a concrete repair, add focused
regression proof, rerun the required gate, and review the new exact head from
round one in a new bounded cycle. Duplicate, stale, hypothetical, speculative,
cosmetic, or already-dispositioned findings cannot restart review. No owner
approval is required for in-scope remediation. For a verified rejection that
still blocks MMR, record the evidence, use `mmr ack add <finding-key> --job
<job-id> --scope job --reason "reject: <evidence>"`, then recompute with `mmr
results <job-id>`; never acknowledge a verified blocker. Stop when the user asks
to stop. Otherwise stop only for an external dependency, missing credentials or
authority, a destructive action, an out-of-scope material product decision, or
a demonstrated technical plateau. An unresolved required safeguard is not a
plateau.
Channel auth failures are always surfaced to the user with recovery
commands — never silently skipped. When the target project has `scaffold`
itself available, `scaffold run review-pr` and `scaffold run review-code`
remain available as an optional layer that adds the Superpowers
code-reviewer agent as a complementary 4th channel on top of the same MMR
job — additive, not the documented default.
`scaffold run post-implementation-review` is a separate full-codebase review
(Codex CLI + Antigravity CLI + Superpowers code-reviewer) that runs after an AI
agent completes all implementation tasks; it does not currently use Claude
CLI as a standard channel and is not an MMR wrapper, though it can inject
findings into an existing MMR job via `mmr reconcile`.
External GitHub App reviewers remain supported as a fallback when CLIs are
unavailable. Zero GitHub Actions workflows. The agent manages the entire
review-fix loop locally.

## Inputs
- docs/coding-standards.md (required) — review criteria reference
- docs/tdd-standards.md (required) — test coverage expectations
- docs/git-workflow.md (required) — PR workflow to integrate with
- CLAUDE.md (required) — workflow sections to update

## Expected Outputs
- AGENTS.md — Reviewer instructions with project-specific rules
- docs/review-standards.md — severity definitions, acceptance-criteria scope,
  mandatory guardrails, root-cause dispositions, five-gate backlog admission,
  and the stopping rule
- scripts/cli-pr-review.sh (legacy dual-model fallback) — Codex+Antigravity review with manual reconciliation, used when MMR itself is unavailable
- scripts/await-pr-review.sh (external bot mode) — polling script with JSON output
- docs/git-workflow.md updated with review loop integration
- CLAUDE.md updated with agent-driven review workflow (direct `mmr review --pr`
  entry point) and a `gh pr create` reminder hook, deduped against any
  equivalent hook git-workflow already installed

## Quality Criteria
- (mvp) External reviewer configured and verified (AGENTS.md created)
- (mvp) Review standards document matches project coding conventions
- (deep) Await script handles all exit conditions (approved, findings, cap, skip, timeout)
- (mvp) CLAUDE.md workflow documents the agent-driven loop
- (mvp) CLAUDE.md review block covers both PR and non-PR targets (staged, branch diff, single file)
- (mvp) No GitHub Actions workflows created (zero Actions minutes)
- (mvp) No ANTHROPIC_API_KEY secret required
- (mvp) Post-PR-creation hook configured in settings to remind agents to run
  `mmr review --pr`, installed only if `.claude/settings.json` doesn't
  already carry an equivalent `gh pr create` reminder
- (mvp) CLAUDE.md documents `mmr review --pr <N> --sync --format json` as the
  mandatory PR-review entry point, not a scaffold wrapper
- (mvp) CLAUDE.md documents finite root-cause dispositions, the five follow-up
  gates, a maximum of three rounds per review cycle, autonomous bounded
  remediation, and acceptance-criteria or mandatory-guardrail defects as
  merge-blocking regardless of a model's severity label
- (mvp) Channel auth failures are surfaced to the user with recovery
  commands, never silently skipped
- (deep) Legacy GitHub Actions workflows detected and cleanup offered
- (deep) Three-CLI review (Codex, Antigravity, Claude) enabled when all three CLIs available, with per-channel auth checks and compensating passes
- (deep) The MMR scaffold wrappers (review-pr, review-code) remain available
  as an optional complementary 4th channel (Superpowers code-reviewer) when
  `scaffold` itself is present in the target project; the documented default
  entry point stays direct `mmr review --pr`. `post-implementation-review`
  follows a separate channel layout (Codex + Antigravity + Superpowers, with
  optional `mmr reconcile` injection) and is not one of the MMR wrappers.

## Methodology Scaling
- **deep**: Full setup with local three-CLI review dispatched through direct
  `mmr review --pr` (Codex, Antigravity, Claude), scaffold wrappers
  optionally layering the Superpowers code-reviewer as a complementary 4th
  channel when `scaffold` itself is present, review-standards.md, AGENTS.md,
  and comprehensive CLAUDE.md workflow covering PR and non-PR targets. Falls
  back to external bot review if no CLIs available.
- **mvp**: Step is disabled. Local self-review from git-workflow suffices.
- **custom:depth(1-5)**:
  - Depth 1: disabled — local self-review from git-workflow suffices.
  - Depth 2: disabled — same as depth 1.
  - Depth 3: basic review-standards.md + MMR dispatch using whichever CLIs are available (graceful compensating Claude passes for missing Codex or Antigravity channels; if Claude CLI itself is unavailable, the review proceeds with the remaining channels — no compensating pass for missing Claude).
  - Depth 4: three-CLI review via direct `mmr review --pr` when all CLIs available, plus AGENTS.md with project-specific rules and the optional Superpowers 4th channel on wrapper invocations.
  - Depth 5: full suite — three-CLI + optional Superpowers review, legacy GitHub Actions cleanup, comprehensive CLAUDE.md workflow integration covering PR and non-PR targets.

## Conditional Evaluation
Enable when: project uses GitHub for version control, team size > 1 or CI/CD is
configured, or git-workflow.md establishes a PR-based workflow. Skip when: solo
developer with no CI, depth < 3, or project uses a non-GitHub VCS host.

## Mode Detection
Check if AGENTS.md exists first. If it exists, check for scaffold tracking comment
(`<!-- scaffold:automated-pr-review -->`).
- If AGENTS.md exists with tracking comment: UPDATE MODE — preserve custom review rules,
  reviewer bot name, and round cap settings. Detect legacy GitHub Actions
  workflows (code-review-trigger.yml, code-review-handler.yml) and offer removal.
- If AGENTS.md does not exist: FRESH MODE — configure from scratch.

## Update Mode Specifics
- **Detect prior artifact**: AGENTS.md exists
- **Preserve**: custom review rules, reviewer bot configuration, round cap
  settings, severity definitions in docs/review-standards.md, CLI review
  script customizations
- **Triggers for update**: coding-standards.md changed (new review criteria),
  tdd-standards.md changed (coverage expectations), new external reviewer
  CLI became available, git-workflow.md changed PR workflow steps, review
  scope expanded beyond PRs (e.g., MMR now supports staged / diff / branch
  / file targets), the CLAUDE.md block or hook still references
  `/scaffold:review-pr` as the mandatory entry point (pre-D8 wording)
  instead of direct `mmr review --pr <N> --sync --format json`
- **Conflict resolution**: if review criteria changed in coding-standards.md,
  update AGENTS.md review rules to match; if additional CLI reviewers have
  become available, offer to enable the full three-CLI MMR flow (Codex,
  Antigravity, Claude); on wrapper invocations, when `scaffold` is available
  in the target project, surface Superpowers code-reviewer as an optional
  complementary 4th channel — never make it the documented default entry
  point; if `.claude/settings.json` already carries an equivalent
  `gh pr create` reminder hook (installed by git-workflow), do not install a
  second one — update the existing hook's message in place instead

## Adoption Mode Specifics
- **Codify from repo evidence**: review automation already in place —
  CODEOWNERS, existing review bots or GitHub Actions review workflows, and
  branch-protection review requirements. Document the incumbent review path
  before adding MMR.
- **Interview only for**: whether incumbent review automation stays (and how
  MMR divides responsibility with it), and the team's severity threshold for
  blocking findings on a codebase with long-standing patterns.
- **Do not**: disable or bypass incumbent review requirements; double-report
  the same findings through two channels without documenting which one
  gates; treat pre-existing incumbent code patterns as review findings on
  unrelated PRs.

## Instructions

### MMR Configuration

If `.mmr.yaml` does not exist in the project root and `mmr` is on `PATH`,
run `mmr config init` once to create one. The generated file pins
`fix_threshold: P2` (the recommended default for typical software work)
with an explanatory comment block describing each severity tier — edit
the value if your project warrants a different gate (`P1` for low-friction
prototypes; `P3` for security-sensitive work).

If `mmr` is not installed, install it before running multi-model review;
otherwise channels will degrade.

### Configure Review Enforcement Hook

**Dedupe first.** Check whether `.claude/settings.json` already carries an
equivalent `gh pr create` reminder — the git-workflow step runs before this
one (order 330 vs 340) and installs its own PostToolUse hook whenever the
**deep** preset or **custom depth 5** is used (see
`content/pipeline/environment/git-workflow.md` § "Configure the
PostToolUse review-reminder hook"). Detect an equivalent hook by finding a
`hooks.PostToolUse` entry whose `command` field matches on the `gh pr
create` trigger string, regardless of exact wording. If one is already
present, **skip this section** — do not install a second `gh pr create`
reminder; leave git-workflow's hook as-is.

If no equivalent hook exists yet (this is the normal case at custom depth
3-4, where git-workflow does not install one), add a Claude Code hook to
the project's `.claude/settings.json` that fires after every `gh pr create`
command. This injects a mandatory reminder into the agent's context at
exactly the moment it needs to run review — preventing context decay from
causing missed review channels.

Add this to `.claude/settings.json` (merge into any existing file —
deep-merge into `hooks.PostToolUse`, create the file if missing, never
overwrite or drop unrelated hooks):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.command // empty' | grep -q 'gh pr create' && echo 'MANDATORY: run mmr review --pr <PR#> --sync --format json before moving on.\\nGroup duplicate findings by root cause and record one disposition: fix-now, block, reject:<reason>, or follow-up:<bead-id>. Severity alone never creates a bead. Follow-up work requires all five gates: reproducible, actionable, non-duplicate, worth scheduling, and outside scope.\\nMandatory guardrails include at minimum security, privacy, and data integrity, plus every repository or product safeguard required by project instructions.\\nMaximum of three rounds per review cycle. A round-three reproducible in-scope or required-safeguard blocker may start a new bounded cycle only after a concrete repair, focused regression proof, and the required gate pass; review the new exact head from round one. Duplicate, stale, hypothetical, speculative, cosmetic, or already-dispositioned findings cannot restart review. Continue until every root cause has a disposition and no verified fix-now or block item remains. For a verified rejection that still blocks MMR, record the evidence and use mmr ack add, then mmr results; never acknowledge a verified blocker. Stop when the user asks to stop.\\nSurface channel auth failures with recovery commands (! codex login / ! agy -p \"hello\" / ! claude login) — never silently skip a channel.\\nSee docs/review-standards.md.' || true"
          }
        ]
      }
    ]
  }
}
```

**Why a hook instead of just instructions?** Agents in long implementation sessions
suffer from context decay — instructions from hundreds of messages ago are
effectively invisible by the time the agent creates its third PR. The hook injects
the reminder at exactly the right moment, every time, regardless of context length.

**Why direct `mmr review --pr` instead of a scaffold slash command?** The
generated project cannot assume `scaffold` is installed (D8) — the hook must
work with only `mmr` and the review CLIs on `PATH`. When `scaffold` happens
to be available in the target project, `scaffold run review-pr` remains a
valid optional enhancement (it layers the Superpowers code-reviewer agent
on top of the same MMR job), but it is not what the hook or the CLAUDE.md
workflow mandates.

### Add Review Workflow to CLAUDE.md

Add the following to the project's CLAUDE.md in the Code Review section. Wrap
the managed section in the `<!-- scaffold:automated-pr-review:claude-md -->`
markers shown below so Update Mode can idempotently rewrite this block without
duplicating it on re-run. If a prior version of the block exists **without**
markers, replace it in place and add the markers.

```markdown
## Code Review

<!-- scaffold:automated-pr-review:claude-md start -->
**Mandatory after `gh pr create`** — run `mmr review --pr <N> --sync --format
json` to execute all three review channels (Codex CLI, Antigravity CLI,
Claude CLI). Group duplicate findings by root cause and record one disposition:
`fix-now`, `block`, `reject:<reason>`, or `follow-up:<bead-id>`. Severity alone
never creates a bead. Follow-up work requires all five gates: reproducible,
actionable, non-duplicate, worth scheduling, and outside scope. Mandatory
guardrails include at minimum security, privacy, and data integrity (including
preventing data loss or corruption), plus every repository or product safeguard
required by project instructions. Use a maximum of three rounds per review
cycle. If round three finds a reproducible in-scope or required-safeguard
defect, make a concrete repair, add focused regression proof, rerun the required
gate, and review the new exact head from round one in a new bounded cycle.
Duplicate, stale, hypothetical, speculative, cosmetic, or already-dispositioned
findings cannot restart review. Continue until every root cause has a
disposition and no verified fix-now or block item remains. No owner approval is
required for in-scope remediation. For a verified rejection that still blocks
MMR, record the evidence, use `mmr ack add`, then recompute with `mmr results`;
never acknowledge a verified blocker. Stop when the user asks to stop. Otherwise
stop only for a true external dependency, missing credentials or authority, a
destructive action, a material product decision outside the acceptance criteria,
or a demonstrated technical plateau after safe approaches are exhausted. An
unresolved required safeguard is not a plateau. Surface channel auth failures to
the user with recovery commands; never silently skip a channel. A post-hook on
`gh pr create` will remind you.

Merge only when the final exact head has completed the configured MMR channel
floor, required gates are green, every finding is dispositioned, and no
verified blocker remains.

**Optional but supported** for non-PR targets — the review is not PR-gated.
`mmr review` runs the three CLI channels (Codex, Antigravity, Claude) on any
diff or file.

If `scaffold` is available in this project, `scaffold run review-pr` /
`scaffold run review-code` remain valid alternatives that add the
Superpowers code-reviewer agent as a complementary 4th channel on top of
the same MMR job — use them for the extra pass; they are not required.

| When | Command |
|------|---------|
| After creating a PR | `mmr review --pr <N> --sync --format json` |
| Staged changes only | `mmr review --staged --sync --format json` |
| All tracked uncommitted changes (staged + unstaged, no untracked) | `git diff HEAD \| mmr review --diff - --sync --format json` |
| Branch diff | `mmr review --base <ref> --head <ref> --sync --format json` |
| Pending edits to a tracked file (changes since HEAD) | `git diff HEAD -- <path> \| mmr review --diff - --sync --format json` |
| Current contents of any file (tracked-with-no-changes, untracked, or brand-new) | `(diff -u /dev/null <path> \|\| true) \| mmr review --diff - --sync --format json` |
| Existing patch or diff file | `mmr review --diff <path.patch> --sync --format json` |
| Dual-model CLI only (no reconciliation) | `scripts/cli-pr-review.sh <PR#>` |
| (optional, if `scaffold` installed) branch diff + staged + unstaged in one job | `scaffold run review-code` |
| (optional, if `scaffold` installed) PR review plus the Superpowers 4th channel | `scaffold run review-pr <PR#>` |

Note: `mmr review --diff` expects diff-format content; use the `git diff …`
or `(diff -u /dev/null … || true)` wrappers shown above to review plain
files. The `|| true` guard on `diff` is required because `diff` exits with
status 1 whenever files differ, which breaks pipelines under `pipefail`.
<!-- scaffold:automated-pr-review:claude-md end -->
```

**Idempotency note:** In Update Mode, find the `<!-- scaffold:automated-pr-review:claude-md start -->`
and `<!-- scaffold:automated-pr-review:claude-md end -->` markers and replace
everything between them with the current version of the block above. If the
markers are missing (pre-marker versions), locate the prior block by its
"After creating a PR, run" lead-in — either the pre-D8 `/scaffold:review-pr`
phrasing or the current `mmr review --pr` phrasing — and replace it in
place, adding the markers around the new content. Never append a second copy.

### Configure AGENTS.md, Review Standards, and CLI Scripts

Follow the existing instructions for creating AGENTS.md, docs/review-standards.md,
and review scripts based on the project's coding standards and test requirements.
These provide the review context that `mmr review --pr` uses when dispatching
to each channel (and that `scaffold run review-pr` also reads, when
`scaffold` is available).
