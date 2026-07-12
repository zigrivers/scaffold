# Beads surface audit — 2026-07-12 (bd 1.1.0)

Re-validation of every `bd` command surface in `content/` against the
installed bd 1.1.0 (Homebrew), following the durability-hardening plan.
Previous audit: docs/audits/beads-integration-audit-2026-05-24.md (v1.0.4).

## Verified surface
| Subcommand | Flags / subcommands checked | Status |
| --- | --- | --- |
| `bd init` | `--init-if-missing`, `--reinit-local`, `--discard-remote`, `--destroy-token`, `--force` (deprecated alias of `--reinit-local`) | ok |
| `bd backup` | `init <path>`, `sync`, `restore`, `status`, `remove` | ok |
| `bd dolt` | `commit`, `push`, `pull` | ok |
| `bd migrate` | env `BD_ALLOW_REMOTE_MIGRATE=1`; subcmds `schema`, `hooks`; `--inspect` | ok |
| `bd graph check` | exit 0 clean / 1 on issues (cycles, orphans, integrity) | ok |
| `bd batch` | stdin or `-f/--file`; single Dolt transaction | ok |
| `bd doctor` | `--agent`, `--fix`, `--dry-run` | ok |
| `bd prune` | `-f/--force`, `--older-than`, `--pattern`, `--dry-run` | ok (content wording corrected — see below) |
| `bd import` | `-i/--input`, `--allow-stale` | ok |
| `bd ready` | `--claim`, `--has-metadata-key` | ok |
| `bd merge-slot` | `create`, `acquire` (`--wait`), `check`, `release` | ok |
| `bd gate` | `create`, `resolve`, `check`, `list`, `add-waiter` | ok |
| `bd prime` | `--hook-json` | ok |
| `bd setup` | `claude`, `codex`, `cursor`; `--check`, `--global`, `--list` | ok |
| `bd stats` | (core) | ok |
| `bd metrics` | usage-metrics consent/toggle | ok |
| `bd config` | `set`, `get` (`export.auto`, `export.git-add`, `types.custom`) | ok |
| `bd create` / `update` / `close` / `list` / `show` | core lifecycle; `-t`, `-p`, `-l`, `--parent`, `--deps`, `--set-metadata`, `--all --limit 0` | ok |
| `bd dep` | `cycles`, `add`, `tree`, `remove`, `list` | ok |
| `bd export` | `--all -o <path>` | ok |
| `bd version` | numeric parse `X.Y.Z` | ok |

## Discrepancies found and fixed
1. **`bd prune --force` behavior overstated.** The durability-hardening plan's
   draft described `bd prune --force` as "reference-aware (skips closed beads
   still cited by open work)." bd 1.1.0 does **not** claim that. The verified
   behavior — written into `content/knowledge/core/task-tracking.md` (Durability
   toolkit subsection): permanently deletes closed **non-ephemeral** beads,
   **requires** `--older-than` or `--pattern` as a safety gate, and skips
   pinned, open/in-progress, and ephemeral beads. Shipped correct from the
   start; no wrong wording was ever committed.

## Discrepancies found (not blocking this plan — deferred follow-ups)
2. **`bd setup cursor` is already available in bd 1.1.0** (setup targets:
   cursor, claude, copilot, gemini, aider, factory, codex, mux, opencode,
   junie, windsurf, cody, kilocode). The prior plan draft listed it as an
   *unreleased* watch item. Resolved. **Follow-up (optional):** add
   `bd setup cursor` alongside `bd setup claude` / `bd setup codex` in
   `content/pipeline/foundation/beads.md` for Cursor-targeting projects. Left
   out of the durability plan deliberately (out of scope; needs the step's
   methodology-gating + mode blocks handled carefully).

## Upstream watch items (as of 2026-07-12)
- **Work leases** (upstream schema work): claims gaining a TTL with a
  heartbeat/reclaim path to recover issues stranded by dead workers. When
  released: adopt in the work-beads skill's claim step (2.1) and the
  multi-agent-coordination knowledge. (Not yet on the installed 1.1.0 surface.)
- **`bd bootstrap` on a populated DB remains unguarded upstream** — destructive
  `bd init` gained refusal exit codes 10/11/12 and destroy-token gating, but
  `bd bootstrap` itself still replaces a populated local DB from the remote with
  no native guard. `scripts/bd-guard.sh` + the docs runbook are the only
  protection; consider filing/tracking an upstream feature request.
- **JSONL auto-import races** (several upstream issues open): keep auto-IMPORT
  off in generated projects; auto-export + git-add (what we enable) is the safe
  direction.
- **server→embedded fallback redirect** (v1.1.0): a bad `.beads` redirect can
  hide all issues — if a generated project reports "all beads vanished", check
  for a stale redirect before assuming a wipe.

## Next re-audit trigger
Re-run this audit when `bd version` on the dev machine advances past 1.1.x, or
when any generated-project loop hits an unknown-flag error.
