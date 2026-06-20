/**
 * Inline, just-in-time concept docs (vision D3). `mmr explain <topic>` carries
 * MMR's own teaching surface so an agent that hits a wall can ask the tool
 * rather than needing to know a docs URL. Static prose only — no config values.
 */
export const EXPLAIN_TOPICS: Record<string, string> = {
  channels: `Channels are the AI model CLIs (or HTTP endpoints) a review dispatches to.
Built-ins: claude, codex, antigravity, grok, gemini (deprecated). Each is enabled
or disabled, has a command (subprocess) or endpoint (http), an auth check, and an
output parser. List them with \`mmr config channels --format text\`; inspect one
with \`mmr config show <name>\`; toggle with \`mmr config enable|disable <name>\`.`,

  config: `Config is layered, later wins: built-in defaults → ~/.mmr/config.yaml (global)
→ ./.mmr.yaml (project) → CLI flags. Objects deep-merge; arrays replace.
\`mmr config path\` shows the search order and where writes land. Mutate without
hand-editing YAML: \`config enable|disable <channel>\`, \`config set <path> <value>\`,
\`config unset <path>\`. Every mutator is scope-aware (--global/--project), validated
before write, and never leaves an invalid config on disk.`,

  scopes: `Two write scopes: the project ./.mmr.yaml (travels with the repo; the default)
and the global ~/.mmr/config.yaml (machine-level preferences). Disabling a channel
whose CLI isn't installed records to the global file (it's a property of the laptop,
not the repo). A write to the global scope only touches channels resolvable from
global config; a project-only channel stays in the project file. Pass --global or
--project to force a scope.`,

  compensation: `When a channel is unavailable the review classifies it. TRANSIENT failures
(auth expired, timeout, runtime error) get a compensating pass — a substitute model
re-runs that channel's focus, labeled [compensating: X-equivalent]. STRUCTURAL
absence (the CLI isn't installed and won't return) is NOT compensated by default
(as of mmr 2.0.0) — you get a one-line notice instead. Opt back in with
--compensate-missing, or mark the channel \`required: true\`. Run \`mmr doctor\` to
classify channels, or \`mmr config disable <name>\` to stop dispatching one.`,

  redaction: `MMR redacts secrets before any output. Secret-keyed values (api_key, token,
authorization, password, …) and inline command/recovery tokens (--api-key sk-…,
Authorization: Bearer …) are replaced with <redacted> in every view — text, JSON,
config show/channels, doctor, config test, and review output. The env-var NAME
(api_key_env) is kept; only its value is secret. --no-redact bypasses for a single
view and warns loudly to stderr.`,

  provenance: `Every effective config value traces to its source layer: default, user
(~/.mmr/config.yaml), project (./.mmr.yaml), or cli. \`mmr config channels\` shows a
SOURCE column; \`mmr config show <channel>\` annotates each field. A channel disabled
via the legacy channels_disabled list is attributed to that list's layer. This is how
you tell "off because of a default" from "off because my project file says so".`,
}
