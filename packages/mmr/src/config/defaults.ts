import type { MmrConfigParsed, ChannelConfigParsed, SubprocessChannelParsed } from './schema.js'

/**
 * Default configuration applied when no config files are present.
 * version is set to 1 as the baseline; loadConfig supplies it
 * before Zod validation so partial user/project configs work.
 */
export const DEFAULT_CONFIG: MmrConfigParsed = {
  version: 1,
  // defaults.compensator is intentionally omitted here. When absent,
  // resolveCompensatorDispatch (core/compensator.ts) falls back to
  // `claude -p --output-format json`, preserving historical behavior.
  // Users who want a non-Anthropic fallback set defaults.compensator in
  // their own .mmr.yaml.
  defaults: {
    fix_threshold: 'P2',
    timeout: 300,
    format: 'json',
    parallel: true,
    job_retention_days: 7,
    loop_control: {
      max_rounds_default: 5,
      repeat_suppression_enabled: false,
    },
  },
  channels: {} as Record<string, ChannelConfigParsed>, // Populated below after BUILTIN_CHANNELS definition
}

/**
 * Built-in channel presets. Users can override any field via config files.
 */
export const BUILTIN_CHANNELS: Record<string, SubprocessChannelParsed> = {
  claude: {
    kind: 'subprocess',
    enabled: true,
    abstract: false,
    command: 'claude -p',
    flags: ['--output-format', 'json'],
    env: {},
    auth: {
      check: 'claude -p "respond with ok" 2>/dev/null',
      // Claude CLI's auth probe is a full LLM round-trip (not a local
      // status check) and routinely takes 9-14s from a cold CLI. 5s
      // false-fails the vast majority of real environments.
      timeout: 20,
      failure_exit_codes: [1],
      recovery: 'claude login',
    },
    prompt_wrapper: '{{prompt}}',
    output_parser: 'default',
    stderr: 'capture',
  },
  gemini: {
    kind: 'subprocess',
    enabled: false,
    abstract: false,
    // RETIRED (v3.1.0). Google sunset the Gemini CLI reviewer; Antigravity
    // (`agy`) is the supported replacement. Kept as a disabled TOMBSTONE so
    // existing `.mmr.yaml` files that still name `gemini` (e.g. in
    // channels_disabled) keep loading. It is never dispatched, and an explicit
    // `--channels gemini` errors with a migration hint (→ antigravity).
    retired: true,
    command: 'gemini',
    flags: [],
    env: {},
    prompt_wrapper: '{{prompt}}',
    output_parser: 'default',
    stderr: 'capture',
  },
  codex: {
    kind: 'subprocess',
    enabled: true,
    abstract: false,
    command: 'codex exec',
    flags: ['--skip-git-repo-check', '-s', 'read-only', '--ephemeral'],
    env: {},
    auth: {
      check: 'codex login status 2>/dev/null',
      timeout: 5,
      failure_exit_codes: [1],
      recovery: 'codex login',
    },
    prompt_wrapper: '{{prompt}}',
    output_parser: 'default',
    stderr: 'suppress',
  },
  grok: {
    kind: 'subprocess',
    enabled: true,
    abstract: false,
    // Grok's `-p/--single` and `--prompt-file` REQUIRE the prompt as an arg
    // value; unlike claude/gemini/codex, grok does NOT read the prompt from
    // stdin (`grok -p` with no value errors: "a value is required for
    // '--single <PROMPT>'"). We therefore deliver the prompt via a temp file
    // (prompt_delivery: 'prompt-file') and reference its path with the
    // {{prompt_file}} placeholder in --prompt-file.
    command: 'grok',
    prompt_delivery: 'prompt-file',
    // Closed-book review: no cross-session memory, web-only tool allowlist
    // (denies filesystem reads), isolated HOME/cwd strips host config —
    // skills, MCP servers, hooks, and project instructions are all excluded.
    cwd: '{{neutral_cwd}}',
    env: { HOME: '{{neutral_home}}', XDG_CONFIG_HOME: '{{neutral_home}}' },
    flags: [
      '--prompt-file', '{{prompt_file}}',
      '--output-format', 'json',
      '--no-memory',
      '--tools', 'web_search,web_fetch',
      // grok >= 0.2.99 aborts headless session creation with
      //   "agent building failed: ... RequirementError { tool:
      //    GrokBuild:run_terminal_cmd, auto_background_on_timeout requires
      //    enabled_background to be true }"
      // because it BUILDS + validates EVERY built-in tool before applying the
      // --tools allowlist above — so restricting tools to web-only is not enough;
      // the broken run_terminal_cmd definition still fails the build and exits 1
      // before any model call. Remove the tool from the build entirely. A
      // closed-book text review never needs a terminal, so this also tightens
      // the hardened posture (no bash surface) and stays correct once grok
      // fixes the upstream default. See tasks/lessons.md.
      '--disallowed-tools', 'run_terminal_cmd',
      '--no-subagents', '--no-plan',
    ],
    auth: {
      // `grok models` lists models and prints the login state; it does not
      // make an LLM round-trip, so a short timeout is fine. Exit 1 ⇒ not
      // authenticated / CLI error.
      check: 'grok models >/dev/null 2>&1',
      timeout: 10,
      failure_exit_codes: [1],
      recovery: 'grok login',
    },
    prompt_wrapper: '{{prompt}}',
    // `grok --output-format json` wraps the reply as { "text": "<reply>",
    // "thought": "...", ... }. Unwrap $.text, then run the default findings
    // parser over the model's reply (same shape as the gemini unwrap).
    output_parser: { kind: 'unwrap-jsonpath', wrap: '$.text', then: 'default' },
    stderr: 'capture',
  },
  antigravity: {
    kind: 'subprocess',
    enabled: true,
    abstract: false,
    // Google's Antigravity CLI (terminal command `agy`) — the supported
    // replacement for the deprecated Gemini CLI reviewer.
    // Verified on agy 1.0.2: `agy --print` reads the prompt from stdin and writes
    // the model reply to stdout (exit 0). There is NO `--output-format json` flag,
    // so the reply is plain text and the review prompt's findings JSON is handled
    // by the `default` parser (same as codex).
    command: 'agy',
    prompt_delivery: 'stdin',
    // Neutral cwd strips project-local AGENTS.md/.agents/mcp_config.json and denies
    // the repo as a workspace (agy reviews only the diff in the prompt). HOME is
    // intentionally NOT overridden: agy stores credentials under $HOME, so a
    // neutral HOME breaks auth (verified) and there is no clean auth-only file to
    // symlink. env must be present ({}) — BUILTIN_CHANNELS is SubprocessChannelParsed.
    cwd: '{{neutral_cwd}}',
    env: {},
    // --sandbox: OS sandbox (sandbox-exec/nsjail). --dangerously-skip-permissions:
    // auto-approve so a headless tool call can't hang to --print-timeout; isolation
    // comes from the empty neutral cwd, not from approval prompts (mirrors gemini's
    // --approval-mode yolo). --print-timeout bounds a hung run.
    flags: [
      '--print',
      '--sandbox',
      '--dangerously-skip-permissions',
      '--print-timeout', '300s',
    ],
    auth: {
      // agy exits 0 even on auth failure (verified), so detect the sentinel strings
      // rather than trust the exit code. Two distinct auth-failure outputs exist:
      // "Authentication required …" and "Error: authentication timed out" — match
      // both. Runs under `sh -c` (auth.ts), so the pipeline + exit codes work.
      check:
        'agy -p "respond with ok" --print-timeout 12s 2>&1'
        + ' | grep -qiE "authentication required|authentication timed out"'
        + ' && exit 41 || exit 0',
      timeout: 20,
      failure_exit_codes: [41],
      recovery: 'agy -p "hello"   # then open the printed Google OAuth URL and paste the code',
    },
    prompt_wrapper: '{{prompt}}',
    output_parser: 'default',
    stderr: 'capture',
    timeout: 300,
  },
  opencode: {
    // Disabled by default (opt-in): OpenCode is an open-source AI coding CLI that
    // not every user has installed/authenticated, and a review is a full agentic
    // round-trip. Enable in .mmr.yaml (`channels: { opencode: { enabled: true } }`)
    // or pass --channels=opencode (alias: opc). Mirrors the doc-conformance opt-in.
    kind: 'subprocess',
    enabled: false,
    abstract: false,
    // `opencode run` runs non-interactively and reads the prompt from stdin
    // (verified on opencode 1.17.8: a piped prompt starts a headless session and
    // prints the model reply to stdout). The reply is plain text, so the review
    // prompt's findings JSON is handled by the `default` parser (same as agy/codex).
    command: 'opencode run',
    prompt_delivery: 'stdin',
    // Neutral cwd ⇒ closed-book review: opencode runs in an empty temp dir with no
    // access to the working tree, so it reviews only the diff in the prompt. HOME is
    // intentionally NOT overridden: opencode stores credentials under
    // ~/.local/share/opencode/auth.json (real $HOME / $XDG_DATA_HOME), so a neutral
    // HOME would break auth. This is the antigravity posture; the existing cwd-only
    // host-isolation test covers it (no credential symlink needed).
    cwd: '{{neutral_cwd}}',
    // SECURITY: opencode is an agentic CLI with no OS sandbox flag (unlike agy's
    // --sandbox). Auto-approving tools would let a prompt-injected diff make opencode
    // read files, dump the environment, or run shell commands — and a neutral cwd is
    // NOT a sandbox (tools can use absolute paths). So instead of auto-approving, we
    // DENY every tool via OPENCODE_PERMISSION ('{"*":"deny"}', a catch-all that
    // opencode merges into its permission config — see config.ts). The review becomes
    // pure text-in/text-out: there is no execution surface to inject into. "deny"
    // auto-rejects (it does not prompt), so a headless run cannot hang on approval.
    // auth.ts merges this env into the auth probe too, so the probe is equally locked.
    env: { OPENCODE_PERMISSION: '{"*":"deny"}' },
    // --pure: skip external plugins for a deterministic, side-effect-free review.
    flags: ['--pure'],
    auth: {
      // A real run is the only reliable opencode auth check (`opencode auth list`
      // reports a stored credential even when the token is expired). opencode exits
      // non-zero on auth failure (verified: exit 1 with "token expired or incorrect"),
      // so the exit code — not a sentinel grep — drives the verdict. The prompt goes
      // over stdin (matching prompt_delivery) so the probe exercises the real path.
      check: 'printf "respond with ok" | opencode run --pure >/dev/null 2>&1',
      timeout: 30,
      failure_exit_codes: [1],
      recovery: 'opencode auth login',
    },
    prompt_wrapper: '{{prompt}}',
    output_parser: 'default',
    stderr: 'capture',
    timeout: 300,
  },
  'doc-conformance': {
    // Disabled by default: runs up to 3 LLM calls (~3 min) via scaffold observe audit.
    // Enable in .mmr.yaml or pass --channels=doc-conformance to use.
    kind: 'subprocess',
    enabled: false,
    abstract: false,
    command: 'scaffold observe audit --profile=full --scope=all --output-mode=mmr-findings',
    flags: [],
    env: {},
    auth: {
      // Full-profile checks invoke claude -p; verify it responds, not just that it's installed.
      // Use the `version` subcommand (not `scaffold --version`): the subcommand works on
      // every scaffold release, including older installs that predate the `--version` flag.
      // (A bare `scaffold --version` exits 1 on those, which is in failure_exit_codes and
      // would make this `&&` chain always report auth failure.)
      check: 'scaffold version >/dev/null 2>&1 && claude -p "respond with ok" 2>/dev/null',
      timeout: 20,
      failure_exit_codes: [1, 127], // 127 = command not found (scaffold or claude missing)
      recovery: 'Install scaffold (npm install -g @zigrivers/scaffold or brew install scaffold) and run: claude login',
    },
    prompt_wrapper: '{{prompt}}',
    output_parser: 'doc-conformance',
    stderr: 'capture',
    timeout: 180, // 3 sequential LLM calls × 60s each + margin
  },
}

// Seed DEFAULT_CONFIG with builtin channels
DEFAULT_CONFIG.channels = { ...BUILTIN_CHANNELS }
