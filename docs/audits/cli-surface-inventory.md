# CLI Surface Inventory — `scaffold` + `mmr`

**Generated:** 2026-07-27 · **`@zigrivers/scaffold` 3.53.1** · **`@zigrivers/mmr` 4.0.0**

A complete inventory of what the two CLIs actually ship, taken from the source
and from `--help` on a freshly built `dist/`, not from the docs. Where code and
docs disagreed, the code won and the docs were changed.

The **Guide coverage** column is the audit result: either the guide section that
documents the entry, or an explicit *intentionally undocumented* verdict with a
reason. Entries fixed during this pass are marked **(added)** or **(fixed)**.

## How this was produced

```bash
npm run build && (cd packages/mmr && npm run build)
node dist/index.js <cmd> --help          # every command + subcommand, recursively
node packages/mmr/dist/index.js <cmd> --help
```

Extension points, config schemas, and exit codes were read from
`src/**`, `packages/mmr/src/**`, and `content/**`.

## Scope note — the per-project-type flag families

`scaffold init` and `scaffold adopt` expose ~80 project-type configuration flags
(`--web-rendering`, `--macos-persistence`, `--game-economy`, …). These are
generated one-to-one from the Zod schemas in `src/config/schema.ts` and
enumerated with their choices and defaults by `scaffold init --help`.

**Verdict: intentionally undocumented in prose, individually.** Restating 80
enum flags in a guide would rot on the next project type and duplicate a source
that is already self-describing. The guides instead document (a) the 14 project
types, (b) the nine flags `--auto` cannot default, and (c) the pointer to
`--help`. This is the one place the inventory deliberately stops at the family
level.

---

# 1. `scaffold` — commands

30 top-level commands on a single yargs root (`src/cli/index.ts:116`). Global
options on every command: `--format json`, `--auto`, `--verbose`, `--root <dir>`,
`--force`, `--help`, `--version` (`src/cli/index.ts:146`).

## 1.1 Setup & adoption

| Command | Notable flags | Guide coverage |
|---|---|---|
| `init` | `--methodology deep\|mvp\|custom`, `--depth 1-5`, `--adapters`, `--traits`, `--project-type`, `--from <yaml\|->`, `--idea`, plus the flag families | [install#scaffold-init](../../content/guides/install/index.md), [cli#setup-adoption](../../content/guides/cli/index.md) |
| `adopt` | `--write [path]`, `--include`, `--apply`, `--plan`, `--plan-key`, `--dry-run` *(deprecated no-op)* | [install#scaffold-adopt](../../content/guides/install/index.md), [cli#setup-adoption](../../content/guides/cli/index.md) |
| `build` | `--validate-only` | [cli#platform-skills](../../content/guides/cli/index.md) |

## 1.2 Pipeline navigation

| Command | Notable flags | Guide coverage |
|---|---|---|
| `run <step> [args..]` | `--depth`, `--instructions`, `--service` | [pipeline#navigating-the-pipeline](../../content/guides/pipeline/index.md) |
| `next` | `--count`, `--service` | [pipeline#navigating-the-pipeline](../../content/guides/pipeline/index.md) |
| `complete <step>` | `--service` | [pipeline](../../content/guides/pipeline/index.md), [observability#phase-boundary-triggers](../../content/guides/observability/index.md) |
| `skip <step..>` | `--reason`, `--service` | [pipeline#navigating-the-pipeline](../../content/guides/pipeline/index.md) |
| `reset [step]` | `--confirm-reset`, `--service` | [pipeline#navigating-the-pipeline](../../content/guides/pipeline/index.md) |
| `rework` | `--phases`, `--through`, `--exclude`, `--depth`, `--fix` *(default true)*, `--fresh`, `--resume`, `--clear`, `--advance`, `--service` | [pipeline#navigating-the-pipeline](../../content/guides/pipeline/index.md) |
| `check <step>` | — | [cli#pipeline-navigation](../../content/guides/cli/index.md) |

## 1.3 Status & inspection

| Command | Notable flags | Guide coverage |
|---|---|---|
| `status` | `--phase`, `--compact`, `--service` | [cli#status-dashboard](../../content/guides/cli/index.md) |
| `info [step]` | `--service` | [cli#status-dashboard](../../content/guides/cli/index.md) |
| `list` | `--section methodologies\|platforms\|tools` | [cli#status-dashboard](../../content/guides/cli/index.md) |
| `decisions` | `--step`, `--last`, `--service` | [cli#status-dashboard](../../content/guides/cli/index.md) |
| `dashboard` | `--output`, `--open/--no-open`, `--json-only`, `--service` | [dashboard](../../content/guides/dashboard/index.md) |
| `version` | — | [install#keeping-current](../../content/guides/install/index.md) |
| `update` | `--check-only`, `--skip-build` | [install#keeping-current](../../content/guides/install/index.md) |
| `validate` | `--scope config,frontmatter,state,dependencies` | [cli#validation](../../content/guides/cli/index.md) |
| `validate-knowledge` | — | [knowledge#authoring-a-new-entry](../../content/guides/knowledge/index.md) |
| `guides [topic]` | `--list`, `--markdown`, `--print-path`, `--open/--no-open`, `--build` | [cli#platform-skills](../../content/guides/cli/index.md) |
| `skill <install\|list\|remove>` | `--platform codex\|antigravity\|cursor\|opencode` | [cli#platform-skills](../../content/guides/cli/index.md) |

## 1.4 Observability — `scaffold observe`

| Subcommand | Notable flags | Guide coverage |
|---|---|---|
| `event <type>` | `--branch` *(required)*, `--task-id`, payload flags per type | [observability#the-nine-event-types](../../content/guides/observability/index.md) |
| `progress` | `--replay`, `--stall-check/--no-stall-check`, `--json`, `--mask-paths`, `--since-hours`, `--output`, `--render=dashboard-fragment` | [observability#progress-replay-stall](../../content/guides/observability/index.md) |
| `audit` | `--scope`, `--lens`, `--profile`, `--fix`, `--fix-threshold`, `--output`, `--render`, `--output-mode`, `--knowledge-root`, `--json`, `--mask-paths`, `--show-acknowledged`, `--since-hours` | [observability#the-observe-audit-cli](../../content/guides/observability/index.md) |
| `ack <prefix-or-id>` | `--status acknowledged\|open`, `--note` | [observability#companion-verb-scaffold-observe-ack](../../content/guides/observability/index.md) |
| `harvest` | `--worktree`, `--recover` | [observability#harvest-recover-teardown](../../content/guides/observability/index.md), [multi-agent#teardown-harvest](../../content/guides/multi-agent/index.md) |

## 1.5 Knowledge

| Subcommand | Notable flags | Guide coverage |
|---|---|---|
| `knowledge list` | — | [knowledge#browsing-and-overriding-entries](../../content/guides/knowledge/index.md) |
| `knowledge show <name>` | — | [knowledge#browsing-and-overriding-entries](../../content/guides/knowledge/index.md) |
| `knowledge reset <name>` | — | [knowledge#browsing-and-overriding-entries](../../content/guides/knowledge/index.md) |
| `knowledge update <target> [instructions..]` | `--step`, `--entry` | [knowledge#browsing-and-overriding-entries](../../content/guides/knowledge/index.md) |
| `knowledge-freshness audit-prefilter` | `--max` *(10)* | [knowledge-freshness#refresh-arm-commands](../../content/guides/knowledge-freshness/index.md) |
| `knowledge-freshness audit-run-entry <path>` | `--timeout` *(600)*, `--provider anthropic\|deepseek\|zai` | [knowledge-freshness#refresh-arm-commands](../../content/guides/knowledge-freshness/index.md) **(fixed: `zai` + `--timeout` were missing)** |
| `knowledge-freshness audit-apply <entry> <verdict>` | `--open-pr`, `--mmr-job-id` | [knowledge-freshness#refresh-arm-commands](../../content/guides/knowledge-freshness/index.md) |
| `knowledge-freshness link-check [files..]` | `--files-from` | [knowledge-freshness#gate-side-subcommands-also-runnable-locally-for-triage](../../content/guides/knowledge-freshness/index.md) |
| `knowledge-freshness lint-unsourced [files..]` | `--diff`, `--files-from` | [knowledge-freshness#gate-side-subcommands-also-runnable-locally-for-triage](../../content/guides/knowledge-freshness/index.md) |
| `knowledge-freshness anti-over-rewrite [files..]` | `--diff`, `--pr-labels`, `--files-from` | [knowledge-freshness#gate-side-subcommands-also-runnable-locally-for-triage](../../content/guides/knowledge-freshness/index.md) |
| `knowledge-freshness deep-guidance-check [files..]` | `--files-from` | [knowledge-freshness#gate-side-subcommands-also-runnable-locally-for-triage](../../content/guides/knowledge-freshness/index.md) |
| `knowledge-freshness bump-version` | `--title` *(required)*, `--body`, `--count`, `--replay-stdin` | [knowledge-freshness#gate-side-subcommands-also-runnable-locally-for-triage](../../content/guides/knowledge-freshness/index.md) **(fixed: `--count`/`--replay-stdin` were missing)** |

## 1.6 Operations — the parallel-agent kit

Every command in this group had **zero guide coverage** before this pass.

| Command | Actions / flags | Guide coverage |
|---|---|---|
| `doctor` | `--fix`, `--json` | [cli#scaffold-doctor](../../content/guides/cli/index.md) **(added)** |
| `agent-ops <install\|check>` | `--component git\|staging\|merge-queue\|ci\|gate\|all`, `--force` | [cli#scaffold-agent-ops](../../content/guides/cli/index.md) **(added)** |
| `hooks install` | — | [cli#operations-the-parallel-agent-kit](../../content/guides/cli/index.md) **(added)** |
| `mq <enqueue\|daemon\|status\|eject\|release\|stats\|bootstrap\|gate-cache>` | `--pr`, `--finish`, `--foreground` | [cli#scaffold-mq-the-merge-queue](../../content/guides/cli/index.md) + [multi-agent#serializing-the-merges-scaffold-mq](../../content/guides/multi-agent/index.md) **(added)** |
| `tia <affected\|record-due\|ingest>` | `--base` | [cli#scaffold-tia-test-impact-analysis](../../content/guides/cli/index.md) **(added)** |
| `sched <install\|uninstall\|status\|list> [job]` | `--interval` *(600)* | [cli#scaffold-sched](../../content/guides/cli/index.md) **(added)** |

---

# 2. `mmr` — commands

13 top-level commands (`packages/mmr/src/cli.ts:20`).

| Command | Notable flags | Guide coverage |
|---|---|---|
| `review` | input: `--diff`, `--pr`, `--staged`, `--base`, `--head` · control: `--focus`, `--fix-threshold`, `--channels`, `--timeout`, `--template`, `--format` · mode: `--sync`, `--dry-run`, `--compensate-missing` · rounds: `--session`, `--round`, `--max-rounds` · trust: `--accept-new-acks`, `--trust-project-acks`, `--trust-project-config`, `--config-base-ref` | [mmr#the-mmr-review-command](../../content/guides/mmr/index.md) **(fixed: `--compensate-missing` added, `--max-rounds` default corrected)** |
| `critique [input]` | `--focus`, `--channels`, `--timeout`, `--format text\|json`, `--dry-run`, `--synthesis/--no-synthesis`, `--context none\|repo`, `--context-paths`, `--session`, `--lenses`, `--config-base-ref`, `--trust-project-config` | [mmr#other-subcommands](../../content/guides/mmr/index.md) |
| `status <job-id>` | — | [mmr#other-subcommands](../../content/guides/mmr/index.md) |
| `results <job-id>` | `--format`, `--raw` | [mmr#other-subcommands](../../content/guides/mmr/index.md) |
| `reconcile <job-id>` | `--channel` *(req)*, `--input` *(req)*, `--format` | [mmr#other-subcommands](../../content/guides/mmr/index.md) |
| `config <action> [name] [target]` | actions `init\|test\|channels\|path\|enable\|disable\|show\|set\|unset`; `--with-examples`, `--redact`, `--global`, `--project`, `--format` | [mmr#other-subcommands](../../content/guides/mmr/index.md) — `--with-examples` / `--redact` *intentionally undocumented*: single-use output modifiers of `config init` / `config channels show`, fully described by `--help` |
| `doctor` | `--fix`, `--format` | [mmr#other-subcommands](../../content/guides/mmr/index.md), [install#installing-mmr-the-review-cli](../../content/guides/install/index.md) |
| `jobs <list\|prune>` | — | [mmr#other-subcommands](../../content/guides/mmr/index.md) |
| `sessions <start\|list\|show\|end>` | — | [mmr#other-subcommands](../../content/guides/mmr/index.md) |
| `ack <add\|list\|rm\|prune>` | `--job`, `--reason`, `--scope project\|user` *(project)* | [mmr#other-subcommands](../../content/guides/mmr/index.md) — note `prune` is a **no-op stub** today (`commands/ack.ts:95`) |
| `skill install` | `--platform` *(repeatable)*, `--all`, `--dir`, `--force`, `--dry-run` | [mmr#other-subcommands](../../content/guides/mmr/index.md) |
| `commands` | `--format text\|json`, `--json` | [mmr#other-subcommands](../../content/guides/mmr/index.md) |
| `explain [topic]` | 6 topics: `channels`, `config`, `scopes`, `compensation`, `redaction`, `provenance` | [mmr#other-subcommands](../../content/guides/mmr/index.md) |

---

# 3. Configuration files

| File | Owner | Guide coverage |
|---|---|---|
| `.scaffold/config.yml` | `loadConfig` (`src/config/loader.ts:49`) | *Intentionally undocumented key-by-key* — it is wizard-written, never hand-authored, and every key is a mechanical projection of a CLI flag already covered by `init --help`. The guides document the concepts it encodes (methodology, depth, project type, services, overlays) in [pipeline#methodology-depth](../../content/guides/pipeline/index.md). |
| `.scaffold/state.json` | `StateManager` | [pipeline#where-it-all-lives](../../content/guides/pipeline/index.md), [observability#config-timestamps](../../content/guides/observability/index.md) (the `completed_at` / `in_progress_started_at` fields) |
| `.scaffold/observability.yaml` | `loadObservabilityConfig` | [observability#config-reference](../../content/guides/observability/index.md) — complete, every key with type/default/reader |
| `.scaffold/agent-ops.yaml` | `loadAgentOpsConfig` | [cli#scaffold-mq-the-merge-queue](../../content/guides/cli/index.md) documents the `merge_queue:` keys that change behaviour **(added)**. `docker.*`, `project_name`, `critical_labels`, `worktree_setup_commands` are *intentionally undocumented* — they are installer-managed and only meaningful with the staging component. |
| `.scaffold/agent-ops-manifest.json` / `-version` | `agent-ops install/check` | [cli#scaffold-agent-ops](../../content/guides/cli/index.md) **(added)** |
| `.scaffold/identity.json` | observability | [observability#worktree-identity](../../content/guides/observability/index.md), [multi-agent#setup-setup-agent-worktreesh](../../content/guides/multi-agent/index.md) |
| `.scaffold/activity.jsonl` + `activity-archive/` | ledger writer / harvester | [observability#the-ledger](../../content/guides/observability/index.md) |
| `.scaffold/decisions.jsonl`, `lock.json`, `rework.json`, `last-test-run.json` | various | *Intentionally undocumented as file formats* — internal runtime state with no supported hand-editing path; the commands that read them (`decisions`, `rework`, the `tests` adapter) are documented. |
| `.mq/` (journal, gate-cache, quarantine, locks, logs, `tia/map.json`) | merge queue / TIA | [cli#scaffold-mq-the-merge-queue](../../content/guides/cli/index.md) documents the directory's role **(added)**; per-file formats are *intentionally undocumented* (daemon-internal, journal is append-only and reduced in code). |
| `~/.mmr/config.yaml` + `./.mmr.yaml` | mmr loader | [mmr#configuration-mmryaml](../../content/guides/mmr/index.md) — **(fixed: `min_completed_channels`, `format`, `job_retention_days`, `loop_control`, `compensator`, `review_criteria`, `templates` were missing)** |
| `~/.mmr/{jobs,sessions,acks,critique-sessions}/` | mmr stores | [mmr#other-subcommands](../../content/guides/mmr/index.md) |

---

# 4. Exit codes

## 4.1 The `ExitCode` enum (`src/types/enums.ts:17`)

`0` Success · `1` ValidationError · `2` MissingDependency · `3` StateCorruption ·
`4` UserCancellation · `5` BuildError · `6` Ambiguous.

**Coverage:** [cli#exit-codes](../../content/guides/cli/index.md), with a bats
gate asserting the table and the enum agree in both directions.

## 4.2 Commands whose exit code is an answer, not a failure

| Command | Contract | Guide coverage |
|---|---|---|
| `tia record-due` | `1` = not due | [cli#exit-codes](../../content/guides/cli/index.md) |
| `tia affected` | `3` = run the full suite (fails closed) | [cli#exit-codes](../../content/guides/cli/index.md) **(added)** |
| `doctor` | `1` = warn · `2` = error | [cli#exit-codes](../../content/guides/cli/index.md) **(added)** |
| `agent-ops check` | `1` = stale / modified / missing | [cli#exit-codes](../../content/guides/cli/index.md) **(added)** |
| `sched status` | `1` = job not loaded | [cli#exit-codes](../../content/guides/cli/index.md) **(added)** |
| `mq gate-cache --check-tree` | `1` = cache miss | [cli#exit-codes](../../content/guides/cli/index.md) **(added)** |
| `observe audit` | `1` = verdict `blocked`; `3` = audit error; `130` = SIGINT mid-`--fix` | [observability#exit-codes-across-observe-verbs](../../content/guides/observability/index.md) |
| `observe event` / `ack` | `2` = validation · `3` = other | [observability#exit-codes-across-observe-verbs](../../content/guides/observability/index.md) |

## 4.3 `mmr` exit codes

`0` pass / degraded-pass · `2` blocked, **and** the base-ref trust ratification
gate · `3` needs-user-decision, **and** `max_rounds_exceeded` · `1`
usage/dispatch errors · `5` job not found · `130`/`143` signals.
`mmr critique` exits `0` once its input resolves, whatever the critique says;
a usage error still exits `1`.

**Coverage:** [mmr#the-gate-the-four-verdicts](../../content/guides/mmr/index.md)
and [mmr#trust-modes-and-the-ratification-gate](../../content/guides/mmr/index.md)
**(added)**; per-command codes for `status` in
[mmr#other-subcommands](../../content/guides/mmr/index.md).

---

# 5. Extension points

| Extension point | Count / values | Guide coverage |
|---|---|---|
| **Project types** | 14: web-app, mobile-app, backend, cli, library, game, data-pipeline, ml, browser-extension, research, data-science, web3, mcp-server, macos-native | [cli#flags---auto-cannot-default](../../content/guides/cli/index.md), [pipeline#project-type-playbooks](../../content/guides/pipeline/index.md) |
| **Methodology presets** | 4 full presets (`mvp`, `custom-defaults`, `deep`, `brownfield`) + 15 project-type overlays + 4 domain sub-overlays | [pipeline#methodology-depth](../../content/guides/pipeline/index.md) — the `brownfield` preset is covered in [install#scaffold-adopt](../../content/guides/install/index.md) |
| **Phases** | 16 (`PHASES`, `src/types/frontmatter.ts:6`) | [pipeline#the-16-phases-at-a-glance](../../content/guides/pipeline/index.md) |
| **Pipeline steps** | **99** files across 16 phase dirs | [pipeline](../../content/guides/pipeline/index.md) **(fixed: said 90)** |
| **Tool meta-prompts** | 12 | [README §Utility Tools](../../README.md) **(fixed: `knowledge-audit-entry` was missing)** |
| **Platform adapters** | 3: `claude-code`, `codex`, `universal` | *Intentionally undocumented per-adapter* — users select them via `--adapters` and never author one; `scaffold list --section platforms` enumerates them. Referenced in [cli#platform-skills](../../content/guides/cli/index.md). |
| **Skills** | 5 canonical (`scaffold-runner`, `scaffold-pipeline`, `work-beads`, `mmr`, `multi-model-dispatch`); 4 `--platform` targets | [README §Step 2](../../README.md) **(fixed: listed 3 of 5)** |
| **Audit lenses** | 9 (A–I) | [observability#the-nine-lens-audit](../../content/guides/observability/index.md) |
| **Observability adapters** | 8 (5 emit, 3 probe) | [observability#adapters](../../content/guides/observability/index.md) **(fixed: `bd` floor was v1.0.0, is v1.1.0)** |
| **Renderers** | 5 | [observability#renderers](../../content/guides/observability/index.md) |
| **Ledger event types** | 9 | [observability#the-nine-event-types](../../content/guides/observability/index.md) |
| **Knowledge base** | **301** entries in 21 categories | [knowledge-freshness#kb-inventory](../../content/guides/knowledge-freshness/index.md) (generated block, verified current) **(fixed: README said 278/twenty)** |
| **Doctor checks** | 10 checks in 6 sections, 3 with `--fix` | [cli#scaffold-doctor](../../content/guides/cli/index.md) **(added)** |
| **agent-ops components** | 6: git, staging, merge-queue, ci, gate, all | [cli#scaffold-agent-ops](../../content/guides/cli/index.md) **(added)** |
| **Scheduler jobs** | 1: `post-merge-poller` | [cli#scaffold-sched](../../content/guides/cli/index.md) **(added)** |
| **Guides** | 11 topics | [cli#platform-skills](../../content/guides/cli/index.md) |
| **MMR channels** | 7 registered: `codex`, `claude`, `grok`, `antigravity` (default-on); `opencode`, `doc-conformance` (opt-in); `gemini` (retired tombstone) | [mmr#built-in-channels](../../content/guides/mmr/index.md) **(fixed: `opencode` missing, `gemini` listed as live)** |
| **MMR parsers** | 6: `default`, `default-last`, `gemini`, `doc-conformance`, `unwrap-jsonpath`, `regex-findings` | [mmr#channel-architecture](../../content/guides/mmr/index.md) **(fixed: `default-last` was missing)** |
| **MMR verdicts** | 4, gated by a completion floor of 2 | [mmr#the-gate-the-four-verdicts](../../content/guides/mmr/index.md) **(fixed: floor was undocumented)** |
| **MMR critique lenses** | 6: `skeptic`, `simplifier`, `user-advocate`, `pragmatist`, `security`, `scale` | [mmr#other-subcommands](../../content/guides/mmr/index.md) |
| **Knowledge-freshness providers** | 3: `anthropic`, `deepseek`, `zai` (+ fallback chain) | [knowledge-freshness#providers-cron-uses-zai-deepseek](../../content/guides/knowledge-freshness/index.md) **(fixed: `zai` and the fallback env var were undocumented)** |

---

# 6. Intentionally undocumented — the complete list

Every item below is shipped, inventoried, and deliberately **not** given prose
coverage in a guide. Each has a reason; none is an oversight.

1. **The ~80 per-project-type `init`/`adopt` flags** — mechanically generated
   from the config schema and self-describing via `--help`; prose would rot on
   every new project type. Families and the nine `--auto`-required flags *are*
   documented.
2. **`.scaffold/config.yml` key-by-key** — wizard-written, never hand-authored;
   the concepts it encodes are documented instead.
3. **`.scaffold/decisions.jsonl`, `lock.json`, `rework.json`,
   `last-test-run.json` file formats** — internal runtime state with no
   supported hand-editing path.
4. **`.mq/` per-file formats** — daemon-internal; the journal is append-only and
   reduced in code, not read by users.
5. **`.scaffold/agent-ops.yaml` `docker.*`, `project_name`, `critical_labels`,
   `worktree_setup_commands`** — installer-managed, only meaningful with the
   staging component.
6. **The 3 platform adapters individually** — selected by flag, never authored;
   `scaffold list --section platforms` enumerates them.
7. **`mmr config --with-examples` / `--redact`** — single-use output modifiers
   fully described by `--help`.
8. **Environment variables** (`SCAFFOLD_GAP_SIGNAL_QUIET`, `PHASE_AUDIT_DEBUG`,
   `MQ_NO_AUTOSTART`, `MQ_GH_CMD`, `MMR_INCOMPLETE_RETRY_DELAY_MS`,
   `SCAFFOLD_SHUTDOWN_TIMEOUT_MS`) — test and CI escape hatches, not a user
   surface. The provider-selection vars (`KNOWLEDGE_FRESHNESS_*`, the API keys)
   *are* documented, because operators must set them.

---

# 7. Known-divergence register

Facts confirmed in code that contradict older prose. All are now reconciled in
the guides; listed here so the next audit can tell "already handled" from "new".

| Claim in older docs | Reality | Resolved in |
|---|---|---|
| 90 / 91 meta-prompts | 99 | pipeline guide, README, CLAUDE.md |
| 278 knowledge entries in twenty categories | 301 in 21 (macos-native was missing) | README |
| Built-in channels include `gemini` | `gemini` is a retired tombstone; `antigravity` replaced it; `opencode` added | concepts, mmr guides |
| Depth 4–5 dispatches to "Codex/Gemini" | Codex/Antigravity | pipeline guide |
| Fallback invokes "Codex / Gemini / Claude / Grok" | Codex / Claude / Grok / Antigravity | review-workflow guide |
| `needs-user-decision` ⟺ no channel completed | also fires below `min_completed_channels` (default 2) | mmr, review-workflow, concepts guides |
| `--max-rounds` defaults to 5 only with `--session` | defaults to 5 always | mmr guide |
| doc-conformance `timeout: 240` | `180` | mmr guide |
| grok parser `then: default` | `then: default-last`, plus an `incomplete` guard | mmr guide |
| `bd` floor v1.0.0 | v1.1.0 | observability guide |
| audit `--scope=docs` runs only H | runs H and I | CLAUDE.md |
| Eight audit lenses | nine (A–I) | CLAUDE.md |
| `F-scope.wave_budget` config key | does not exist | CLAUDE.md |
| Event type `pr_open` | `pr_opened` | CLAUDE.md |
| `brew upgrade scaffold` (README) | needs the `brew update &&` prefix | README |
| Plugin ships 3 skills | 5 | README |
| Three methodology presets | four — `brownfield` is adopt-selected, not an `init` choice | pipeline, concepts guides, README |
| Enable a channel with `channels_enabled:` | **not a config key** — use `channels.<name>.enabled: true` | README |
| "all 60 steps" / mvp "7 steps" / deep "all steps" | 99 total; mvp 23, custom 60, deep 64, brownfield 39 | README |
| `--replay` fuses six adapter streams | five emit events; three are probes | README |
| Audit `--scope=docs` runs lens H only | H and I | README |
| Eight lenses (A–H) | nine (A–I) | README |
| 11 utility tools | 12 | README |
