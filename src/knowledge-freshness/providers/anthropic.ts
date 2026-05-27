import { dispatchLlm } from '../../observability/engine/llm-dispatcher.js'
import type { Dispatcher } from '../audit-runner.js'

/**
 * SECURITY: the dispatcher command is hardcoded to `claude -p --tools ""`,
 * never loaded from project-local config. The parent knowledge-freshness
 * design's decision #7 locked this in: a repo-local CLAUDE.md must NOT be
 * able to inject `command: rm -rf /` into the subprocess invocation.
 *
 * The `--tools ""` flag disables every built-in tool. The audit prompt
 * reads pre-fetched source bodies (round-6 F-001), so the model never
 * needs WebFetch or any other tool.
 *
 * Earlier rounds experimented with `--bare`, which broke keychain auth
 * for local devs. Reverted in Phase 1 Task 9 because the audit subcommand only
 * operates on scaffold's own content/knowledge/, never on a downstream
 * repo — so the round-7 isolation rationale doesn't apply.
 */
export const ANTHROPIC_COMMAND = 'claude -p --tools ""'

/**
 * Injectable dispatch function. Production uses the real `dispatchLlm`;
 * tests inject a mock. Typed via `typeof dispatchLlm` so the signature
 * stays in lock-step with the production function — no `as` cast
 * needed at the call site, and any future change to `DispatchResult`
 * surfaces as a type error here instead of a runtime surprise.
 */
export type DispatchLlmFn = typeof dispatchLlm

export interface BuildAnthropicDispatcherOptions {
  timeoutSec: number
  /** Injectable for tests. Defaults to the real `dispatchLlm`. */
  dispatchLlmFn?: DispatchLlmFn
}

export function buildAnthropicDispatcher(opts: BuildAnthropicDispatcherOptions): Dispatcher {
  const dispatch = opts.dispatchLlmFn ?? dispatchLlm
  const timeoutMs = opts.timeoutSec * 1000
  return async (prompt) => {
    const result = await dispatch({ prompt, command: ANTHROPIC_COMMAND, timeoutMs })
    if (!result.ok) {
      // Use the `anthropic dispatcher: …` prefix for consistency with
      // `deepseek dispatcher: …` — operators can filter cron logs by a
      // single `dispatcher:` substring across both providers
      // (PR #393 MMR F-003).
      throw new Error(`anthropic dispatcher: ${result.reason}`)
    }
    // Return raw stdout. The audit runner's schema-aware extractor walks
    // the full response; the dispatcher's last-→-first parser is the
    // wrong shape for our use case (see audit-runner.ts findFirstMatchingJson).
    return result.raw
  }
}
