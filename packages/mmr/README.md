# @zigrivers/mmr — Multi-Model Review CLI

Automated multi-model code review with dispatch, reconciliation, and severity gating.

Dispatches reviews to Claude CLI, Codex CLI, and Gemini CLI. Reconciles findings with consensus scoring. Gates on configurable severity thresholds.

## Install

```bash
npm install -g @zigrivers/mmr
```

## Quick Start

```bash
# One-command review (recommended for agents and CI)
mmr review --pr 47 --sync

# Or step-by-step
mmr review --pr 47          # Dispatch to all channels
mmr status mmr-a1b2c3       # Check progress
mmr results mmr-a1b2c3      # Reconcile and output findings

# Inject external review findings
mmr reconcile <job-id> --channel superpowers --input findings.json
```

## Commands

| Command | Purpose |
|---------|---------|
| `mmr review` | Dispatch review to configured channels |
| `mmr review --sync` | Full pipeline: dispatch, parse, reconcile, output verdict |
| `mmr review --dry-run` | Resolve diff, validate install/auth, and print prompts without dispatching |
| `mmr status <job-id>` | Check job progress |
| `mmr results <job-id>` | Collect and reconcile findings |
| `mmr config init` | Auto-detect CLIs and generate `.mmr.yaml` |
| `mmr config test` | Verify channel installation and auth |
| `mmr jobs list` | List recent review jobs |
| `mmr jobs prune` | Remove old jobs |
| `mmr reconcile <job-id>` | Inject external findings and re-reconcile |

## Verdict System

| Verdict | Meaning | Exit Code |
|---------|---------|-----------|
| `pass` | All channels completed, no findings above threshold | 0 |
| `degraded-pass` | Some channels unavailable, compensating passes ran, gate passed | 0 |
| `blocked` | Findings at or above severity threshold | 2 |
| `needs-user-decision` | No channels completed | 3 |

## Configuration

Run `mmr config init` to generate `.mmr.yaml`, or create manually:

```yaml
version: 1
defaults:
  fix_threshold: P2
  timeout: 300
channels:
  claude:
    enabled: true
  codex:
    enabled: true
  gemini:
    enabled: true
```

## Features

- **--sync mode** — single-command entry point for agents and CI
- **--dry-run mode** — preview resolved channels and assembled prompts without spawning review subprocesses; install and auth checks still run so the preview shows which channels would dispatch
- **Compensating passes** — Claude-based review for unavailable channels
- **Consensus scoring** — multi-source findings get high confidence
- **Atomic job store** — per-channel status files, no write races
- **POSIX-portable** — `command -v` for install checks, works everywhere

## v3.28 — Config foundations

### Channel inheritance with `extends:` and abstract parents

Define an abstract template once, then inherit it per model. The parent's
fields are deep-merged into the child; the child may override any field.

```yaml
channels:
  ollama-base:
    abstract: true                          # template only, never dispatched
    command: ollama run
    output_parser: default
    auth:
      check: "ollama list"
      timeout: 5
      failure_exit_codes: [1]
      recovery: "ollama serve"

  qwen:
    extends: ollama-base
    flags: ["qwen2.5-coder:32b", "--format", "json"]

  deepseek:
    extends: ollama-base
    flags: ["deepseek-r1:14b", "--format", "json"]
```

- Cycle detection rejects configs where `A extends B extends A` (or longer loops).
- Maximum extends depth is 4 levels.
- Concrete channels (`abstract: false` — the default) must end up with a `command`
  after merge; an abstract parent supplies it implicitly.

### `mmr config init` — local-runtime probing

`mmr config init` probes for `ollama`, `lms` (LM Studio), `llama-server`
(llama.cpp), and `local-ai-delegate` with a 1-second per-probe timeout.
Detected runtimes emit a commented `# example: ...` channel block in the
generated `.mmr.yaml` (not enabled by default). Pass `--with-examples` to
emit the full OSS catalog whether or not the runtimes are detected.

```bash
mmr config init --with-examples
```

### `mmr config channels show <name>`

Print the fully merged configuration for one channel with per-field
provenance (`# from default | user | project`). Secrets in `env` and
`headers` are replaced with `<redacted>` by default. Pass `--no-redact`
to print them verbatim (a warning banner is printed to stderr).

```bash
mmr config channels show claude
```

The loader also warns when a channel `headers:` block contains a literal
`Authorization` (or similarly secret-shaped) value — these should be moved
into an env var and referenced via `api_key_env` (the env-var name itself
is non-secret, the value never appears in any introspection output).

### `mmr review --dry-run`

Resolve the diff, assemble the prompt, run auth checks, and print which
channels *would* dispatch and the prompt each would receive — without
spawning any review subprocesses. A clear banner makes it obvious the
output is not real findings.

```bash
mmr review --pr 42 --dry-run
```

Full documentation: [scaffold README](https://github.com/zigrivers/scaffold#mmr--multi-model-review-cli)
