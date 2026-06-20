/* eslint-disable max-len -- this is a one-entry-per-line data table; wrapping each spec hurts readability */
/**
 * Hand-authored, machine-readable map of MMR's agent-relevant command surface
 * (vision D2). An agent (or an MCP wrapper) loads this in one call via
 * `mmr commands --json` instead of probing N `--help` screens. A drift test
 * (tests/core/manifest-drift.test.ts) asserts every registered top-level CLI
 * command appears here, so the manifest can't silently fall behind.
 */
export interface CommandSpec {
  /** Invocation form, e.g. `config disable <channel>`. */
  command: string
  /** One-line description. */
  summary: string
  /** A runnable example. */
  example: string
  /**
   * True if the command (or any of its subcommands/flags) can mutate state —
   * config files or the job store. A compound entry like `jobs <list|prune>` is
   * marked true because `prune` writes even though `list` is read-only; treat it
   * as "this command can write," and read the specific invocation form.
   */
  writes: boolean
}

export const COMMAND_MANIFEST: ReadonlyArray<CommandSpec> = [
  { command: 'review', summary: 'Dispatch a multi-model review of a diff/PR and gate on severity', example: 'mmr review --pr 47 --sync', writes: true },
  { command: 'status <job-id>', summary: 'Per-channel status + elapsed for a review job', example: 'mmr status job_abc', writes: false },
  { command: 'results <job-id>', summary: 'Re-run parse → reconcile → format on a completed job', example: 'mmr results job_abc --format text', writes: false },
  { command: 'reconcile <job-id>', summary: 'Inject an external channel\'s findings into a job', example: 'mmr reconcile job_abc --channel superpowers --input findings.json', writes: true },
  { command: 'jobs <list|prune>', summary: 'List or prune review jobs', example: 'mmr jobs list', writes: true },
  { command: 'sessions <start|list|show|end>', summary: 'Manage multi-round review sessions', example: 'mmr sessions list', writes: true },
  { command: 'ack <add|list|rm|prune>', summary: 'Silence a finding by its stable key across rounds', example: 'mmr ack list', writes: true },
  { command: 'skill install', summary: 'Install the MMR review skill into a project per agent CLI', example: 'mmr skill install --all', writes: true },
  { command: 'doctor', summary: 'Diagnose channel health (install + auth); --fix disables not-installed channels', example: 'mmr doctor', writes: true },
  { command: 'config init', summary: 'Scaffold a .mmr.yaml (auto-detects installed CLIs)', example: 'mmr config init', writes: true },
  { command: 'config test', summary: 'Pre-flight every channel (install + auth)', example: 'mmr config test', writes: false },
  { command: 'config path', summary: 'Show where config is read from and written to', example: 'mmr config path', writes: false },
  { command: 'config channels', summary: 'List channels (JSON; --format text for a provenance table)', example: 'mmr config channels --format text', writes: false },
  { command: 'config show <channel>', summary: 'Inspect one channel with per-field provenance', example: 'mmr config show codex', writes: false },
  { command: 'config enable <channel>', summary: 'Turn a channel on', example: 'mmr config enable grok', writes: true },
  { command: 'config disable <channel>', summary: 'Turn a channel off (writes enabled: false)', example: 'mmr config disable grok', writes: true },
  { command: 'config set <dotted.path> <value>', summary: 'Set any config value (validated before write)', example: 'mmr config set defaults.fix_threshold P1', writes: true },
  { command: 'config unset <dotted.path>', summary: 'Remove an override, fall back to the inherited value', example: 'mmr config unset defaults.fix_threshold', writes: true },
  { command: 'commands', summary: 'This manifest — every command as machine-readable data', example: 'mmr commands --json', writes: false },
  { command: 'explain <topic>', summary: 'Print inline docs for a concept (channels, compensation, …)', example: 'mmr explain compensation', writes: false },
]
