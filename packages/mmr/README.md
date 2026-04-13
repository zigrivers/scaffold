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
- **Compensating passes** — Claude-based review for unavailable channels
- **Consensus scoring** — multi-source findings get high confidence
- **Atomic job store** — per-channel status files, no write races
- **POSIX-portable** — `command -v` for install checks, works everywhere

Full documentation: [scaffold README](https://github.com/zigrivers/scaffold#mmr--multi-model-review-cli)
