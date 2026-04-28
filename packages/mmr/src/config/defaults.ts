import type { MmrConfigParsed, ChannelConfigParsed } from './schema.js'

/**
 * Default configuration applied when no config files are present.
 * version is set to 1 as the baseline; loadConfig supplies it
 * before Zod validation so partial user/project configs work.
 */
export const DEFAULT_CONFIG: MmrConfigParsed = {
  version: 1,
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
}

// Seed DEFAULT_CONFIG with builtin channels
DEFAULT_CONFIG.channels = { ...BUILTIN_CHANNELS }
