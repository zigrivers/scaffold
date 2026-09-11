### Multi-Model Review Routing

When the user asks for a "multi-model review", "review this with all three models",
"run MMR on X", or similar — **do not assume the target is a PR**. Route based on
what the user is pointing at:

| Target | Command |
|---|---|
| GitHub PR (explicit number or current branch's PR) | `scaffold run review-pr [<PR#>]` |
| Local uncommitted / staged code, before commit or push | `scaffold run review-code` |
| Pending edits to a tracked file (changes since HEAD) | `git diff HEAD -- <path> \| mmr review --diff - --sync --format json` |
| Current contents of any file (tracked-with-no-changes, untracked, or brand-new) | `(diff -u /dev/null <path> \|\| true) \| mmr review --diff - --sync --format json` |
| A branch diff against main (or another ref) | `mmr review --base <ref> --head <ref> --sync --format json` |
| An existing patch or diff file | `mmr review --diff <path.patch> --sync --format json` |
| A diff piped from another command | `<cmd> \| mmr review --diff - --sync --format json` (stdin) |
| A user-story review specifically at depth 5 | `scaffold run review-user-stories` |

If the user's target is ambiguous ("review this with MMR"), ask once which of
the above applies — don't default to `review-pr` just because it's the most
common entry point. Doc reviews and uncommitted-work reviews are equally
first-class.

Pass `--focus "..."` to MMR when the user describes what to evaluate (clarity,
completeness, security, performance, etc.). See the `mmr` skill for all input
modes and flags.

**Note on `--diff`:** the flag requires diff-format content (path to a
`.patch`/`.diff` file, or `-` for stdin). To review a regular document or
source file, wrap it in a diff first using `git diff HEAD -- <path>`
(tracked) or `(diff -u /dev/null <path> || true)` (untracked — the
`|| true` guard is required because `diff` exits 1 whenever files
differ, which breaks pipelines under `set -o pipefail`) and pipe the
result into `mmr review --diff -`.

### Multi-Model Review at Depth 4-5

All review and validation steps support independent multi-model validation at depth 4-5. Two distinct paths exist — **never mix them** — pick based on what step is running:

#### Path A: MMR-backed review (PREFERRED — always use for these steps)

Applies to: `scaffold run review-pr`, `scaffold run review-code`, and any pipeline review step that invokes `mmr review` directly.

- **Channel model:** three CLIs (Codex + Antigravity + Claude) dispatched and reconciled by the MMR CLI; scaffold wrappers add the Superpowers code-reviewer agent as a complementary 4th channel reconciled into the same MMR job via `mmr reconcile`.
- **Note:** `scaffold run post-implementation-review` follows a different channel layout (raw-CLI dispatch of Codex + Antigravity + Superpowers, with optional `mmr reconcile` injection if a prior `mmr review` job exists). Treat it as its own path — consult `content/tools/post-implementation-review.md` for specifics.
- **Invocation:** go through the wrapper (`scaffold run …`) or call `mmr review …` directly. Do NOT shell out to `codex`/`agy`/`claude` yourself for these steps — MMR handles dispatch, parsing, compensating passes, and verdict.
- **Auth pre-flight:** run `mmr config test` once per session — it probes all three CLIs and reports status in one call.
- **If auth fails** for any channel, surface recovery commands to the user: `! codex login`, `! agy -p "hello"`, or `! claude login`. MMR will emit a compensating pass (via `claude -p`) for each missing external channel, labelled `[compensating: Codex-equivalent]` / `[compensating: Antigravity-equivalent]`. Maximum achievable verdict in that case is `degraded-pass`.
- **Never silently skip a CLI due to auth failure** — surface it to the user.

#### Path B: Legacy / non-MMR direct dispatch

Applies to: some older depth-5 validation steps and any ad-hoc manual dispatch not routed through MMR. The `multi-model-dispatch` skill documents the raw invocation patterns:

- **Codex:** `codex exec --skip-git-repo-check -s read-only --ephemeral "prompt" 2>/dev/null` (NOT bare `codex`)
- **Antigravity:** `printf '%s' "prompt" | agy --print --sandbox --dangerously-skip-permissions --print-timeout 300s 2>/dev/null`
- **Claude CLI:** `claude -p "prompt" --output-format json 2>/dev/null`

**Antigravity (`agy`) reads the prompt from stdin via `--print`** — no `NO_BROWSER` env var is needed. The `--sandbox` and `--dangerously-skip-permissions` flags handle non-TTY headless execution.

Auth pre-flight for Path B dispatch:
1. Codex: `codex login status`
2. Antigravity: `agy -p "respond with ok" --print-timeout 12s`. Treat output containing `authentication required` or `authentication timed out` as auth failure even when the exit code is zero.
3. Claude CLI: `claude -p "respond with ok"` (typically uses the active Claude Code session)
4. If any fail: `! codex login`, `! agy -p "hello"`, or `! claude login` (the `!` prefix runs it interactively with TTY access).
5. **Never silently skip a CLI due to auth failure** — surface it to the user.

Apply the existing review depth and session preferences. Ask about depth only when it is unresolved under the [execution decision rules](execution.md#step-3-resolve-decisions-from-context); explain that depth 4-5 enables the configured multi-model validation when the CLIs are available.
