import type { MmrConfigParsed, ChannelConfigParsed } from './schema.js'

/**
 * Default configuration applied when no config files are present.
 * version is set to 1 as the baseline; loadConfig supplies it
 * before Zod validation so partial user/project configs work.
 */
export const DEFAULT_CONFIG: MmrConfigParsed = {
  version: 1,
  // defaults.compensator is intentionally omitted here. When absent,
  // resolveCompensatorDispatch (core/compensator.ts) falls back to
  // `claude -p --output-format json`, preserving the pre-v3.29 behavior.
  // Users who want a non-Anthropic fallback set defaults.compensator in
  // their own .mmr.yaml - see README "Configurable compensator".
  defaults: {
    fix_threshold: 'P2',
    timeout: 300,
    format: 'json',
    parallel: true,
    job_retention_days: 7,
  },
  channels: {} as Record<string, ChannelConfigParsed>, // Populated below after BUILTIN_CHANNELS definition
}

/**
 * Built-in channel presets. Users can override any field via config files.
 */
export const BUILTIN_CHANNELS: Record<string, ChannelConfigParsed> = {
  claude: {
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
    enabled: true,
    abstract: false,
    // No `-p` here: gemini's `-p/--prompt` flag *requires* a positional
    // value, but MMR delivers prompts via stdin. With `gemini -p
    // --output-format json` and prompt on stdin, gemini parses
    // `--output-format` as `-p`'s value and bails out with
    // "Not enough arguments following: p", failing the channel in 0s.
    // Without `-p`, gemini reads stdin natively. The auth probe at
    // `auth.check` below keeps `-p "respond with ok"` because that
    // invocation supplies an explicit prompt value.
    command: 'gemini',
    flags: ['--output-format', 'json'],
    env: { NO_BROWSER: 'true' },
    auth: {
      check: 'NO_BROWSER=true gemini -p "respond with ok" -o json 2>&1',
      // Gemini CLI's auth probe is a full LLM round-trip (not a local
      // status check) and routinely takes ~9s. 5s false-fails normal
      // environments. Codex stays at 5s below because its auth probe
      // is a local file check (`codex login status`), not a round-trip.
      timeout: 20,
      failure_exit_codes: [41],
      recovery: 'gemini -p "hello"',
    },
    prompt_wrapper: '{{prompt}}',
    output_parser: 'gemini',
    stderr: 'capture',
    timeout: 360,
  },
  codex: {
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
  'doc-conformance': {
    // Disabled by default: runs up to 3 LLM calls (~3 min) via scaffold observe audit.
    // Enable in .mmr.yaml or pass --channels=doc-conformance to use.
    enabled: false,
    abstract: false,
    command: 'scaffold observe audit --profile=full --scope=all --output-mode=mmr-findings',
    flags: [],
    env: {},
    auth: {
      // Full-profile checks invoke claude -p; verify it responds, not just that it's installed.
      check: 'scaffold --version >/dev/null 2>&1 && claude -p "respond with ok" 2>/dev/null',
      timeout: 20,
      failure_exit_codes: [1, 127], // 127 = command not found (scaffold or claude missing)
      recovery: 'Install scaffold (npm install -g @zigrivers/scaffold or brew install scaffold) and run: claude login',
    },
    prompt_wrapper: '{{prompt}}',
    output_parser: 'doc-conformance',
    stderr: 'capture',
    timeout: 240, // 3 sequential LLM calls × 60s each + margin
  },
}

// Seed DEFAULT_CONFIG with builtin channels
DEFAULT_CONFIG.channels = { ...BUILTIN_CHANNELS }
