import type {
  PlatformAdapter,
  AdapterContext,
  AdapterInitResult,
  AdapterStepInput,
  AdapterStepOutput,
  AdapterFinalizeInput,
  AdapterFinalizeResult,
} from './adapter.js'

const PHASE_ORDER = [
  'pre',
  'foundation',
  'environment',
  'integration',
  'stories',
  'modeling',
  'decisions',
  'architecture',
  'specification',
  'consolidation',
  'quality',
  'planning',
  'validation',
  'finalization',
  'general',
]

// `scaffold run <step>` writes a meta-prompt to stdout. Claude Code slash
// commands re-inject that prompt into the model's context, so embedded bash
// blocks get executed by the model. Codex runs `scaffold run` as a shell
// command and treats stdout as the final result — embedded instructions
// never run. For tools whose "execution" is a deterministic shell recipe
// (review-code, review-pr), bypass the shim and emit the recipe directly so
// Codex can execute it.
//
// 4th-channel note: the Superpowers code-reviewer reconcile path requires a
// harness that can dispatch agent skills (e.g. Claude Code). Codex has no
// such loader, so the recipes below run the 4 MMR CLI channels only and
// point users at the Claude Code path when they need 4-channel coverage.
//
// Source-of-truth meta-prompts: `content/tools/review-code.md` and
// `content/tools/review-pr.md`. Keep the resolution chain and command
// shape here in sync with those files, including native per-cycle round bounds.
const CODEX_REPO_ID_SETUP = `REPO_ID=$(
  (git config --get remote.origin.url 2>/dev/null || git rev-parse --show-toplevel) |
    git hash-object --stdin | cut -c1-12
)`

const CODEX_RESUME_SETUP = `resolve_mmr_position() {
  local session_prefix="$1" retry_same_round="\${2:-false}"
  local latest_cycle session_json recorded_rounds override=false
  RESOLVED_SESSION_JSON=""

  if [ -n "\${CYCLE+x}" ] || [ -n "\${ROUND+x}" ]; then
    if [ -z "\${CYCLE+x}" ] || [ -z "\${ROUND+x}" ]; then
      echo "Set both CYCLE and ROUND, or leave both unset for session recovery." >&2
      return 1
    fi
    if ! [[ "$CYCLE" =~ ^[1-9][0-9]*$ && "$ROUND" =~ ^[1-3]$ ]]; then
      echo "CYCLE must be positive and ROUND must be 1, 2, or 3." >&2
      return 1
    fi
    override=true
  fi

  latest_cycle=$(mmr sessions list | node -e '
const sessions = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
const prefix = process.argv[1];
const cycles = sessions.map(({ session_id }) =>
  session_id.startsWith(prefix) ? Number(session_id.slice(prefix.length)) : NaN
).filter((cycle) => Number.isInteger(cycle) && cycle > 0);
if (cycles.length) process.stdout.write(String(Math.max(...cycles)));
' "$session_prefix") || return 1

  if [ -z "$latest_cycle" ]; then
    if [ "$override" = true ] && { [ "$CYCLE" -ne 1 ] || [ "$ROUND" -ne 1 ]; }; then
      echo "CYCLE=$CYCLE ROUND=$ROUND does not match MMR session history; expected CYCLE=1 ROUND=1." >&2
      return 1
    fi
    CYCLE=1; ROUND=1
    return 0
  fi

  session_json=$(mmr sessions show "$session_prefix$latest_cycle") || return 1
  RESOLVED_SESSION_JSON="$session_json"
  recorded_rounds=$(printf '%s' "$session_json" | node -e '
const record = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
if (!Number.isInteger(record.rounds) || record.rounds < 0 || record.rounds > 3) process.exit(1);
process.stdout.write(String(record.rounds));
') || { echo "Invalid MMR session record; reconcile it before review." >&2; return 1; }

  if [ "$override" = true ]; then
    if [ "$retry_same_round" = true ] && [ "$CYCLE" -eq "$latest_cycle" ] \
      && [ "$ROUND" -eq "$recorded_rounds" ]; then
      return 0
    fi
    if [ "$CYCLE" -eq "$latest_cycle" ] && [ "$recorded_rounds" -lt 3 ] \
      && [ "$ROUND" -eq "$((recorded_rounds + 1))" ]; then
      return 0
    fi
    if [ "$CYCLE" -eq "$((latest_cycle + 1))" ] && [ "$recorded_rounds" -eq 3 ] \
      && [ "$ROUND" -eq 1 ]; then
      return 0
    fi
    echo "CYCLE=$CYCLE ROUND=$ROUND does not match MMR session history." >&2
    return 1
  fi

  if [ "$recorded_rounds" -ge 3 ]; then
    echo "Latest cycle reached round 3. After a verified repair and required gate," \
      "set CYCLE=$((latest_cycle + 1)) ROUND=1; otherwise stop." >&2
    return 1
  fi
  CYCLE="$latest_cycle"
  ROUND="$((recorded_rounds + 1))"
}`

const CODEX_EXECUTOR_RECIPES: Record<string, string> = {
  'review-code': `Run multi-model review on local code before commit or push
(4 MMR CLI channels: Codex, Claude, Grok, Antigravity). Pick **one** of the three modes
below.

**Mode 1 — full local delivery candidate** (committed branch diff + staged
+ unstaged; the most common case):

\`\`\`bash
# Resolve trunk ref — same ladder as content/tools/review-code.md.
BASE_REF=""
if   ORIGIN_HEAD=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null); then
  BASE_REF="\${ORIGIN_HEAD#refs/remotes/}"
elif git rev-parse --verify origin/main   >/dev/null 2>&1; then BASE_REF=origin/main
elif git rev-parse --verify main          >/dev/null 2>&1; then BASE_REF=main
elif git rev-parse --verify origin/master >/dev/null 2>&1; then BASE_REF=origin/master
elif git rev-parse --verify master        >/dev/null 2>&1; then BASE_REF=master
elif git rev-parse --verify HEAD~1        >/dev/null 2>&1; then BASE_REF=HEAD~1
else                                                            BASE_REF=HEAD
fi
MERGE_BASE=$(git merge-base "$BASE_REF" HEAD 2>/dev/null || echo "$BASE_REF")
# --quiet exits 0 when there's no diff. Check before session recovery so a
# no-change review does not require mmr to be installed or authenticated.
if git diff --quiet "$MERGE_BASE"; then
  echo "No changes to review"; exit 0
fi
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
[ "$BRANCH" = "HEAD" ] && BRANCH="detached-$(git rev-parse --short HEAD 2>/dev/null)"
${CODEX_REPO_ID_SETUP}
SESSION_ID="local-full-$REPO_ID-$(printf '%s' "$BRANCH" | tr -c 'a-zA-Z0-9_-' '-')"
${CODEX_RESUME_SETUP}
resolve_mmr_position "$SESSION_ID-cycle-" || exit 1
MMR_FLAGS=(--session "$SESSION_ID-cycle-$CYCLE" --round "$ROUND" --max-rounds 3 --sync --format json)

# Stream the diff directly into mmr rather than buffering through a shell
# variable (large diffs can OOM).
git diff "$MERGE_BASE" | mmr review --diff - "\${MMR_FLAGS[@]}"
\`\`\`

**Mode 2 — staged changes only** (e.g. pre-commit gate):

\`\`\`bash
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
[ "$BRANCH" = "HEAD" ] && BRANCH="detached-$(git rev-parse --short HEAD 2>/dev/null)"
${CODEX_REPO_ID_SETUP}
SESSION_ID="local-staged-$REPO_ID-$(printf '%s' "$BRANCH" | tr -c 'a-zA-Z0-9_-' '-')"
${CODEX_RESUME_SETUP}
resolve_mmr_position "$SESSION_ID-cycle-" || exit 1
mmr review --staged --session "$SESSION_ID-cycle-$CYCLE" --round "$ROUND" --max-rounds 3 --sync --format json
\`\`\`

**Mode 3 — explicit branch diff** (substitute the actual branch name for
\`BRANCH_NAME\`):

\`\`\`bash
BRANCH_NAME="<branch-name>"
BASE_REF=main
BASE_ID=$(printf '%s' "$BASE_REF" | git hash-object --stdin | cut -c1-12)
${CODEX_REPO_ID_SETUP}
SESSION_ID="local-range-$BASE_ID-$REPO_ID-$(printf '%s' "$BRANCH_NAME" | tr -c 'a-zA-Z0-9_-' '-')"
${CODEX_RESUME_SETUP}
resolve_mmr_position "$SESSION_ID-cycle-" || exit 1
mmr review --base "$BASE_REF" --head "$BRANCH_NAME" --session "$SESSION_ID-cycle-$CYCLE" \
  --round "$ROUND" --max-rounds 3 --sync --format json
\`\`\`

Append \`--fix-threshold P0|P1|P2|P3\` to any of the above to override the
project's configured threshold for this invocation.

Use at most three rounds per cycle. After each verified repair, increment
\`ROUND\` and review the new exact head. If round three leaves a reproducible
in-scope or required-safeguard defect, make a concrete repair, add focused
regression proof, pass the required gate, increment \`CYCLE\`, reset \`ROUND\`
to 1, and review again. Duplicate, stale, hypothetical, speculative, cosmetic,
or already-dispositioned findings cannot start a new cycle. Never advance on a
\`blocked\` or \`needs-user-decision\` result.

**4th channel:** the Superpowers \`code-reviewer\` reconcile pass requires a
harness that can dispatch agent skills. Codex cannot do this directly — for
4-channel coverage, run \`scaffold run review-code\` from a Claude Code session
instead.`,

  'review-pr': `Run multi-model review on a pull request
(4 MMR CLI channels: Codex, Claude, Grok, Antigravity).

\`\`\`bash
# Detect PR number from current branch, or set explicitly:
PR_NUMBER="\${PR_NUMBER:-$(gh pr view --json number -q .number 2>/dev/null)}"
if [ -z "$PR_NUMBER" ]; then
  echo "PR_NUMBER not set and no PR for current branch"; exit 1
fi
${CODEX_REPO_ID_SETUP}
SESSION_ID="pr-$REPO_ID-$PR_NUMBER"
CURRENT_HEAD=$(gh pr view "$PR_NUMBER" --json headRefOid -q .headRefOid) || exit 1
REVIEW_ACTOR=$(gh api user --jq .login) || exit 1
case "$REVIEW_ACTOR" in ''|*[!a-zA-Z0-9-]*) echo "Invalid GitHub actor" >&2; exit 1;; esac
LEDGER_COMMENTS=$(gh pr view "$PR_NUMBER" --json comments \
  --jq '.comments[] | select(.author.login == "'"$REVIEW_ACTOR"'") | .body') || exit 1
LAST_LEDGER=$(printf '%s\\n' "$LEDGER_COMMENTS" | sed -n '/<!-- mmr-cycle-ledger /p' | tail -1)
LAST_REVIEWED_HEAD=""; LAST_REVIEWED_VERDICT=""
if [ -n "$LAST_LEDGER" ]; then
  LEDGER_PATTERN='cycle=([1-9][0-9]*)[[:space:]]+round=([1-3])'
  LEDGER_PATTERN+='[[:space:]]+head=([0-9a-f]{40})[[:space:]]+job=(mmr-[a-z0-9]+)'
  LEDGER_PATTERN+='[[:space:]]+verdict=([^[:space:]]+)[[:space:]]+next_cycle=([1-9][0-9]*)'
  LEDGER_PATTERN+='[[:space:]]+next_round=([1-3])'
  if ! [[ "$LAST_LEDGER" =~ $LEDGER_PATTERN ]]; then
    echo "Invalid MMR ledger marker; reconcile it before review." >&2; exit 1
  fi
  LAST_CYCLE="\${BASH_REMATCH[1]}"; LAST_ROUND="\${BASH_REMATCH[2]}"
  LAST_REVIEWED_HEAD="\${BASH_REMATCH[3]}"; LAST_JOB="\${BASH_REMATCH[4]}"
  LAST_REVIEWED_VERDICT="\${BASH_REMATCH[5]}"
  if { [ -n "\${CYCLE+x}" ] || [ -n "\${ROUND+x}" ]; } \
    && { [ "\${CYCLE:-}" != "\${BASH_REMATCH[6]}" ] || [ "\${ROUND:-}" != "\${BASH_REMATCH[7]}" ]; }; then
    echo "CYCLE and ROUND disagree with the PR ledger marker." >&2; exit 1
  fi
  CYCLE="\${BASH_REMATCH[6]}"; ROUND="\${BASH_REMATCH[7]}"
fi
if [ -n "$LAST_REVIEWED_HEAD" ] && [ "$CURRENT_HEAD" = "$LAST_REVIEWED_HEAD" ] \
  && [ "$LAST_REVIEWED_VERDICT" != "needs-user-decision" ]; then
  echo "Current PR head already has an MMR ledger entry;" \
    "disposition that job instead of dispatching a duplicate round." >&2
  exit 1
fi
${CODEX_RESUME_SETUP}
RETRY_SAME_ROUND=false
[ "$LAST_REVIEWED_VERDICT" = "needs-user-decision" ] && RETRY_SAME_ROUND=true
resolve_mmr_position "$SESSION_ID-cycle-" "$RETRY_SAME_ROUND" || exit 1
if [ -z "$LAST_LEDGER" ] && [ -n "$RESOLVED_SESSION_JSON" ]; then
  echo "MMR session history exists without a PR ledger marker; reconcile it before review." >&2; exit 1
fi
if [ -n "$LAST_LEDGER" ]; then
  printf '%s' "$RESOLVED_SESSION_JSON" | node -e '
const record = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
if (record.rounds !== Number(process.argv[1]) || record.jobs?.at(-1) !== process.argv[2]) process.exit(1);
' "$LAST_ROUND" "$LAST_JOB" || {
    echo "PR ledger and MMR session history disagree; reconcile them before review." >&2; exit 1
  }
fi
mmr review --pr "$PR_NUMBER" --session "$SESSION_ID-cycle-$CYCLE" --round "$ROUND" --max-rounds 3 --sync --format json
\`\`\`

After every completed call, classify and disposition every semantic finding,
then use \`gh pr comment\` to post one evidence summary whose final line is:
\`<!-- mmr-cycle-ledger cycle=<C> round=<R> head=<SHA> job=<ID> verdict=<V> next_cycle=<C> next_round=<R> -->\`.
Only that authenticated review actor's markers are trusted on resume.

Append \`--fix-threshold P0|P1|P2|P3\` to override the project's configured
threshold for this invocation.

Use at most three rounds per cycle. After each verified repair, increment
\`ROUND\` and review the new exact head. If round three leaves a reproducible
in-scope or required-safeguard defect, make a concrete repair, add focused
regression proof, pass the required gate, increment \`CYCLE\`, reset \`ROUND\`
to 1, and review the same PR again. Duplicate, stale, hypothetical, speculative,
cosmetic, or already-dispositioned findings cannot start a new cycle. Never
advance on a \`blocked\` or \`needs-user-decision\` result.

**4th channel:** the Superpowers \`code-reviewer\` reconcile pass requires a
harness that can dispatch agent skills. Codex cannot do this directly — for
4-channel coverage, run \`scaffold run review-pr\` from a Claude Code session
instead.`,
}

export class CodexAdapter implements PlatformAdapter {
  readonly platformId = 'codex'

  private context: AdapterContext | null = null
  private collectedSteps: AdapterStepInput[] = []

  initialize(context: AdapterContext): AdapterInitResult {
    this.context = context
    this.collectedSteps = []
    return { success: true, errors: [] }
  }

  generateStepWrapper(input: AdapterStepInput): AdapterStepOutput {
    this.collectedSteps.push(input)
    return {
      slug: input.slug,
      platformId: this.platformId,
      files: [],
      success: true,
    }
  }

  finalize(_input: AdapterFinalizeInput): AdapterFinalizeResult {
    const phases = new Map<string, AdapterStepInput[]>()

    for (const step of this.collectedSteps) {
      const phase = step.phase ?? 'general'
      if (!phases.has(phase)) phases.set(phase, [])
      phases.get(phase)!.push(step)
    }

    const sections = PHASE_ORDER.filter((p) => phases.has(p)).map((phase) => {
      const steps = phases.get(phase)!
      const stepLines = steps
        .map((s) => {
          const recipe = CODEX_EXECUTOR_RECIPES[s.slug]
          return recipe
            ? `### ${s.description}\n\n${recipe}`
            : `### ${s.description}\n\nRun \`scaffold run ${s.slug}\``
        })
        .join('\n\n')
      return `## Phase: ${phase}\n\n${stepLines}`
    })

    const content = `# Scaffold Pipeline — Codex Guide

This document describes the Scaffold pipeline steps for use with Codex.

Run each step using \`scaffold run <step-slug>\` **unless the step below
provides an inline shell recipe** — in that case, run the recipe directly.
\`scaffold run\` writes a meta-prompt to stdout that Codex cannot interpret
as instructions, so steps with executable shell behavior emit the commands
inline here.

${sections.join('\n\n')}
`

    return {
      files: [{ relativePath: '.scaffold/generated/codex/AGENTS.md', content, writeMode: 'create' }],
      errors: [],
    }
  }
}
