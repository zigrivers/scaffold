# MMR Antigravity (`agy`) Review-Channel Support — Design

**Date:** 2026-05-30
**Status:** Approved design — ready for implementation plan
**Component:** `@zigrivers/mmr` (multi-model review CLI, `packages/mmr/`)

## Problem

Google has officially announced the deprecation of the Gemini CLI in favor of the
**Antigravity CLI** (terminal command `agy`). The
[announcement](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)
(2026-05-19) states that on **June 18, 2026** the Gemini CLI (and Gemini Code
Assist IDE extensions) **stop serving requests** for Google AI Pro/Ultra and free
Gemini Code Assist for individuals. MMR ships a built-in `gemini` review channel
that occupies the "Google-family, broad-context/architectural" lane. We need a
forward replacement so MMR keeps a working Google-family channel past the sunset.

This spec adds an `agy` review channel that runs **alongside** the existing
`gemini` channel (both enabled by default) until the sunset, after which `gemini`
will be retired in a separate change.

## Empirical findings (verified on `agy 1.0.2`, macOS, 2026-05-30)

All integration-critical behavior was tested directly on the installed binary,
not taken from community write-ups (several of which proved wrong — see below).

| # | Question | Result |
|---|----------|--------|
| 1 | Headless single-prompt mode | `agy --print` / `-p` runs one prompt and exits. **Verified.** |
| 2 | Stdout capture | `agy -p "…"` writes the model response to **stdout**, exit 0. The community-reported "empty stdout bug" in 1.0.x is **not present in 1.0.2**. **Verified.** |
| 3 | Stdin delivery | `printf '…' \| agy --print` reads the prompt from **stdin** (no argv length limit — safe for large diffs). **Verified.** |
| 4 | `--output-format json` | **Rejected** — `flags provided but not defined: -output-format`. agy has **no JSON envelope flag**; it prints the raw model output. **Verified.** |
| 5 | Hardening flags | Only `--sandbox` (OS sandbox: `sandbox-exec`/nsjail) and `--dangerously-skip-permissions`. **No** `--no-memory` / `--no-subagents` / web-allowlist toggles exist. **Verified via `agy --help`.** |
| 6 | Credential location | Creds live under **`$HOME/.gemini/antigravity-cli/`** (NOT macOS Keychain — community claim was wrong). `HOME=/tmp/neutral agy -p` fell back to the OAuth login URL. **Verified.** |
| 7 | Auth-failure exit code | agy **exits 0 even on auth failure** (prints `Authentication required …` / `Error: authentication timed out` but returns 0). Exit codes are **not** a reliable auth signal — must detect the sentinel string. **Verified.** |
| 8 | Hardened end-to-end | neutral cwd + `--sandbox` + `--dangerously-skip-permissions` + real HOME + stdin → exit 0, stdout = exactly the findings JSON the prompt requested. **Verified.** |
| 9 | Config-dir override mechanisms | `agy --help` exposes **no** `--config`/`--home`/`--data-dir` flag. `strings $(which agy)` surfaces no `AGY_HOME`/`ANTIGRAVITY_CONFIG_HOME`-style config-root var — only onboarding/telemetry/desktop vars; the one candidate is `ANTIGRAVITY_EXECUTABLE_DATA_DIR` (name suggests desktop-executable scope, **unverified** as a CLI config-root override). HOME override breaks auth (finding #6). **Conclusion:** no *verified* way to relocate the config root while keeping auth, so a "symlink only creds into a minimal dir" posture is not available today. `ANTIGRAVITY_EXECUTABLE_DATA_DIR` is the one lead worth probing in F2. |

There is **no clean auth-only credential file** to symlink (no `credentials.enc`;
the token is co-mingled in `~/.gemini/antigravity-cli/` alongside `settings.json`,
`mcp_config.json`, `plugins/`, `knowledge/`), and **no verified config-root override**
exists to relocate that dir while keeping auth (finding #9). This is why agy cannot
reach grok's closed-book posture today (see Decision D3); the one unverified lead
(`ANTIGRAVITY_EXECUTABLE_DATA_DIR`) is deferred to Follow-up F2.

### Source-verified integration facts (MMR side, checked 2026-05-30)

These were confirmed by reading the current MMR source on this branch, to close
the assumptions the first draft left open:

- **Auth checks run under a shell.** `runAuthCheck` spawns `sh -c <auth.check>`
  (`packages/mmr/src/core/auth.ts:46`), so a pipeline (`agy … 2>&1 | grep … && exit
  41 || exit 0`) is valid — the existing `gemini` auth check already relies on
  `2>&1`. Exit code 0 ⇒ ok; a code in `failure_exit_codes` ⇒ failed; SIGKILL on
  timeout ⇒ timeout (`auth.ts:57-81`).
- **`withNeutralPosture` triggers on cwd alone.** `needsIsolation`
  (`host-isolation.ts:21-24`) returns true when `cwd === '{{neutral_cwd}}'` even
  with no HOME placeholder, and the resulting posture pins `PWD`/`OLDPWD`/`INIT_CWD`
  to the temp dir (`host-isolation.ts:66-70`). So cwd-only neutralization works.
- **BUT the grok credential symlink is currently unconditional.**
  `host-isolation.ts:45-54` symlinks `~/.grok/auth.json` into the temp dir whenever
  *any* isolation triggers — including agy's cwd-only case. Left unchanged, agy's
  "neutral" cwd would contain a `.grok/auth.json` symlink (not empty, and a grok
  credential exposed to an auto-approved agy run). **This requires a targeted
  host-isolation change** — see Decision D3. The first draft's claim that no
  host-isolation change was needed was wrong.
- **`env` is required on built-in channel entries.** `BUILTIN_CHANNELS` is typed
  `Record<string, SubprocessChannelParsed>` and every entry sets `env`
  (`defaults.ts:32-139`). The channel definition must include `env: {}`.

## Goals

1. Add a built-in `antigravity` channel to MMR, **enabled by default**, that runs
   `agy` as a headless code-review channel.
2. Harden it as far as agy's flags allow (Decision D3).
3. Accept both `antigravity` and `agy` as the channel name at selection surfaces
   (Decision D5).
4. Keep the `gemini` channel enabled and unchanged through its June 18, 2026 sunset.
5. Document the residual hardening gap and track the follow-ups as issues.

## Non-goals (YAGNI)

- Removing or disabling the `gemini` channel (tracked as a dated follow-up issue).
- An `agy`-specific output parser (the `default` parser already handles its output).
- New dispatcher prompt-delivery modes or schema fields (none are needed).
- Full closed-book hardening of `agy` (blocked on upstream agy features — Decision D3).
- Rate-limit / quota backoff logic for agy.
- Migrating any existing `gemini` config or aliasing `gemini`→`agy`.

## Decisions

### D1 — Channel relationship: parallel, agy enabled by default

Add `antigravity` as a **new** built-in channel with `enabled: true`. The existing
`gemini` channel stays `enabled: true` and unchanged. Both run on every default
review until the gemini sunset. Rationale: continuity and immediate coverage; the
extra rate-limit pressure of two Google-family channels is accepted for the ~19-day
overlap window. Retiring `gemini` is a separate, dated change (Follow-up F1).

### D2 — Output parsing: reuse the `default` parser

agy has no JSON-envelope flag (finding #4), so it prints the raw model response —
which, under MMR's review prompt, **is** the findings JSON (optionally fenced).
MMR's `default` parser already strips markdown fences, extracts JSON, fixes
trailing commas, and validates. This is exactly how the `codex` channel works.
No new parser, no unwrap step.

> Contrast: the `gemini` channel uses `output_parser: 'gemini'` because
> `gemini --output-format json` wraps the response in `{"response": "…"}`. agy has
> no such envelope, so `default` is correct.

### D3 — Hardening: neutral cwd + sandbox + auto-approve (real HOME)

The channel runs:

- **Neutral spawn cwd** (`cwd: '{{neutral_cwd}}'`) — strips project-local config
  (`AGENTS.md`, `.agents/`, `mcp_config.json`) and denies the repo as a workspace,
  so agy reviews **only** the diff in the prompt.
- **`--sandbox`** — OS-level sandbox (`sandbox-exec` on macOS, nsjail on Linux).
- **`--dangerously-skip-permissions`** — auto-approve tool requests. In headless
  `-p` mode an un-approved tool call hangs until `--print-timeout`; auto-approve
  avoids that. Isolation comes from the **empty neutral cwd**, not from approval
  prompts — the same trade-off the existing `gemini` manual fallback makes with
  `--approval-mode yolo`.
- **Real `HOME`** — agy stores credentials under `$HOME/.gemini/antigravity-cli/`
  (finding #6). Overriding `HOME` the way the `grok` channel does would break auth,
  and there is no clean auth-only file to symlink. So this channel neutralizes
  **cwd only** and leaves `HOME` intact.

**Residual risk (documented, not hidden):** the **global** `~/.gemini/antigravity-cli/`
config (`mcp_config.json`, `plugins/`, `knowledge/`, `settings.json`) is **not**
stripped, because stripping it breaks auth. This is weaker than the `grok` channel's
closed-book posture. The spawn cwd is isolated, but global host config can still
influence the run. Tracked as Follow-up F2 — revisit when agy ships either discrete
`--no-memory`/`--no-subagents`/web-allowlist flags or an auth-only credential file.

> **Implementation note (host-isolation change required):** `withNeutralPosture`
> already supports cwd-only neutralization (`grok` triggers it via both
> `{{neutral_home}}` and `{{neutral_cwd}}`; `antigravity` triggers it via
> `{{neutral_cwd}}` alone). **However**, the grok credential-preservation step
> (`host-isolation.ts:45-54`) currently symlinks `~/.grok/auth.json` into the temp
> dir on *every* isolation, including cwd-only. For agy that would put a grok
> credential symlink inside the supposedly-empty neutral cwd. We must **gate the
> symlink on HOME neutralization**, since preserving file-backed creds only matters
> when HOME is replaced:
>
> ```ts
> // host-isolation.ts — only preserve grok creds when the HOME key is neutralized.
> // Check the HOME key specifically, NOT "any env value === {{neutral_home}}": a
> // future channel that neutralizes only XDG_CONFIG_HOME must NOT get grok's creds.
> const homeNeutralized = env.HOME === NEUTRAL_HOME_PLACEHOLDER
> if (homeNeutralized) {
>   // ...existing ~/.grok/auth.json symlink block...
> }
> ```
>
> This leaves `grok` unaffected (it neutralizes HOME, so `homeNeutralized` is true)
> and makes agy's cwd-only posture genuinely empty (`homeNeutralized` is false → no
> symlink). The shared `mmr-grok-` temp-dir prefix and its comment should be updated
> to note the machinery is now used by both `grok` and `antigravity` (the
> `sweepStaleNeutralDirs` prefix match still covers both). A regression test must
> assert: with a fake `~/.grok/auth.json` present, cwd-only neutralization creates
> **no** `.grok/auth.json` symlink and the temp dir is empty, while HOME-neutral
> (grok-style) still creates it.

### D4 — Auth check: sentinel-string detection, short timeout

agy exits 0 even when unauthenticated (finding #7), so the auth probe must detect
the auth-failure **sentinel strings** rather than trust the exit code. Critically,
finding #7 documents **two** distinct auth-failure outputs — `Authentication
required …` *and* `Error: authentication timed out` — so the probe must match both
(matching only the first would treat a timed-out login as authenticated):

```
agy -p "respond with ok" --print-timeout 12s 2>&1 | grep -qiE "authentication required|authentication timed out" && exit 41 || exit 0
```

with `failure_exit_codes: [41]`, `auth.timeout: 20`, and
`recovery: 'agy -p "hello"   # then open the printed Google OAuth URL and paste the code'`.

The probe runs under `sh -c` (verified — `auth.ts:46`), so the pipeline and
`&& exit 41 || exit 0` resolve to deterministic exit codes (41 = auth failure, 0 =
otherwise). It is a lightweight model round-trip (tiny prompt) — consistent with the
existing `gemini` channel, whose auth probe is also a round-trip. The check runs with
**real HOME** (the channel does not neutralize HOME), so the credential store is
visible and the probe is accurate.

> **Fail-closed limitation (accepted):** because agy returns exit 0 on *all*
> outcomes, the probe can only fail on the known auth sentinels above. A novel
> auth-error string would be read as "ok" at auth time and then reach dispatch. The
> outcome depends on what agy writes: if it prints the auth-error text to stdout and
> exits 0, MMR records `completed` and `parseChannelOutput` emits a visible P1
> `output-parser` finding (so the failure is surfaced, not silent); if it exits 0
> with empty stdout, the dispatcher marks it `failed` and the compensator fires (see
> Error handling). Either way it is not silently dropped. The mitigation is to keep
> the sentinel list complete: widen it whenever agy introduces a new auth message. A
> future agy `auth status` subcommand would let this become a precise, zero-quota
> local check that removes the exit-0 ambiguity entirely (Follow-up F2).

> agy has no `login`/`whoami`/`auth status` subcommand (verified via `agy help`),
> so a purely local file-existence check is not reliably available. If agy later
> adds a local status command, the auth check can switch to it (cheaper, no quota
> cost) — noted for F2.

### D5 — Channel naming: canonical `antigravity`, alias `agy`

The canonical channel key is **`antigravity`** (descriptive; appears in docs).
**`agy`** is accepted as an alias at the two **selection surfaces**:

- `--channels=agy` (and `--channels=antigravity`)
- `channels_disabled: ["agy"]` (and `["antigravity"]`)

Implemented with a small alias map and a normalizer:

```ts
// src/config/channel-aliases.ts (new, tiny)
export const CHANNEL_ALIASES: Record<string, string> = { agy: 'antigravity' }
export function normalizeChannelName(name: string): string {
  return CHANNEL_ALIASES[name] ?? name
}
```

**Normalization is centralized inside `resolveDispatchChannels`** rather than
sprinkled at call sites. The function already receives both channel-name inputs —
the explicit `--channels` list (`explicit`) and the `disabled` set built from
`channels_disabled` — and is the single chokepoint where names become dispatch
decisions (`review.ts:489-490`). It will `normalizeChannelName` each explicit entry
and test disabled-set membership against the normalized name, so `agy` and
`antigravity` behave identically on both surfaces and **no future caller can bypass
the alias** by going through the resolver.

A source audit confirmed these are the **only** channel-name selection inputs:
there is no env-var channel selector and no other `resolveDispatchChannels` caller
(`grep` for `args.channels` / `channels_disabled` / `resolveDispatchChannels` in
`src/` returns only `review.ts:489-490` plus the schema declaration). The
`config.channels` map keeps the single canonical key `antigravity` — the channel is
**not** duplicated.

**Config-key normalization (no asymmetry).** To avoid the trap where a user who
learns `agy` from the CLI then writes `agy:` in `.mmr.yaml` and silently creates a
phantom channel that never dispatches, the alias is also applied to **config
channel-map keys** at load time. In `loadConfig`, before each overlay's `channels`
map is deep-merged, a single pass remaps alias keys through `normalizeChannelName`
(so `agy:` overrides merge onto `antigravity`). Collision rule: if a single config
declares **both** `agy:` and `antigravity:`, the canonical `antigravity` wins and a
warning is emitted (`mmr: config channel "agy" is an alias for "antigravity"; using
"antigravity"`). This remap runs before the merge/provenance logic, so provenance
stays keyed by the canonical name. Result: `agy` and `antigravity` are
interchangeable on **all** surfaces — `--channels`, `channels_disabled`, and config
keys — and `mmr config` displays the canonical name.

### D6 — Compensator focus

Add `antigravity` to `COMPENSATING_FOCUS` in `src/core/compensator.ts` with the
Google-family strength area (architectural patterns, design consistency,
broad-context reasoning — the same lane `gemini` occupies). If `agy` is unavailable
(not installed / auth failed / timeout / error), a `claude -p` compensating pass
fires with that focus, labeled `compensating-antigravity`.

## Architecture

The change set is small and targeted: a new `defaults.ts` channel entry, a tiny
alias module, alias normalization centralized in `resolveDispatchChannels`, a
`COMPENSATING_FOCUS` entry, **one host-isolation fix** (gate the grok credential
symlink on HOME neutralization — D3), and docs. **No schema or parser changes are
required** — stdin delivery, the `default` parser, the `sh -c` auth-check mechanism,
and cwd-only `{{neutral_cwd}}` neutralization already exist; the only code MMR lacks
is the symlink gating, which the first draft missed (now D3).

### Channel definition (`src/config/defaults.ts`, `BUILTIN_CHANNELS.antigravity`)

```ts
antigravity: {
  kind: 'subprocess',
  enabled: true,
  abstract: false,
  command: 'agy',
  prompt_delivery: 'stdin',            // verified: agy --print reads stdin
  cwd: '{{neutral_cwd}}',              // neutral cwd; HOME intentionally NOT overridden
  env: {},                             // required by SubprocessChannelParsed; NO HOME/XDG override
  flags: [
    '--print',
    '--sandbox',
    '--dangerously-skip-permissions',
    '--print-timeout', '300s',
  ],
  auth: {
    check: 'agy -p "respond with ok" --print-timeout 12s 2>&1 | grep -qiE "authentication required|authentication timed out" && exit 41 || exit 0',
    timeout: 20,
    failure_exit_codes: [41],
    recovery: 'agy -p "hello"   # then open the printed Google OAuth URL and paste the code',
  },
  prompt_wrapper: '{{prompt}}',
  output_parser: 'default',
  stderr: 'capture',
  timeout: 360,
}
```

### Data flow

1. `review.ts` resolves channel names, normalizing `agy`→`antigravity` (D5).
2. Auth check runs the D4 sentinel probe with real HOME.
3. On success, the dispatcher writes the assembled review prompt to agy's stdin,
   spawning `agy --print --sandbox --dangerously-skip-permissions --print-timeout 300s`
   in a neutral cwd (`withNeutralPosture` expands `{{neutral_cwd}}`).
4. agy prints findings JSON to stdout; the `default` parser validates it into the
   MMR `Finding` shape.
5. If agy is unavailable, the compensator fires a `claude -p` pass with the D6 focus.

## Files

**Created:**
- `packages/mmr/src/config/channel-aliases.ts` — `CHANNEL_ALIASES` map + `normalizeChannelName()`.
- `packages/mmr/tests/config/channel-aliases.test.ts` — alias normalization unit tests.

**Modified:**
- `packages/mmr/src/config/defaults.ts` — add `BUILTIN_CHANNELS.antigravity`.
- `packages/mmr/src/core/host-isolation.ts` — gate the `~/.grok/auth.json` symlink
  block (`:45-54`) behind `homeNeutralized` (D3); update the `mmr-grok-` prefix
  comment to note shared grok + antigravity use.
- `packages/mmr/src/commands/review.ts` — `resolveDispatchChannels` imports and
  applies `normalizeChannelName` **internally** (centralized — D5): it normalizes
  each explicit `--channels` entry and builds its own `normalizedDisabled` set from
  the raw `disabled` set before membership checks. The call site at `review.ts:489`
  passes the **raw** `channels_disabled` set unchanged — normalization is the
  resolver's responsibility, so direct/future callers can't bypass it.
- `packages/mmr/src/config/loader.ts` — remap alias channel-map keys through
  `normalizeChannelName` before the channels deep-merge (canonical wins on
  collision + warn), so `agy:` config overrides merge onto `antigravity` (D5).
- `packages/mmr/src/core/compensator.ts` — add `antigravity` to `COMPENSATING_FOCUS`.
- `packages/mmr/tests/config/defaults.test.ts` — assert the `antigravity` channel shape.
- `packages/mmr/tests/config/loader.test.ts` (nearest existing loader test) —
  assert `agy:` config key merges onto `antigravity`, and the both-keys collision
  resolves to canonical with a warning.
- `packages/mmr/tests/core/host-isolation.test.ts` — add the cwd-only-no-symlink
  regression test (D3) alongside the existing grok HOME-neutral symlink test.
- `packages/mmr/tests/core/compensator.test.ts` — assert the `antigravity` focus entry.
- `packages/mmr/tests/commands/cli-parsing.test.ts` — assert `agy`→`antigravity`
  alias resolution in `--channels` and `channels_disabled` (this is the existing
  file that exercises CLI channel-flag parsing; `tests/commands/review-abstract-filter.test.ts`
  covers `resolveDispatchChannels` filtering and may gain a companion assertion).
- `packages/mmr/CHANGELOG.md` — new minor-version entry.
- `packages/mmr/package.json` — version bump (minor — new feature).
- `packages/mmr/README.md` — channel list + config example mention agy.
- Root `CLAUDE.md` — review-channel list, auth-recovery (`! agy -p "hello"`),
  manual hardened-fallback block, `channels_disabled` example, gemini-sunset note.

## Error handling

MMR fires the compensator only for **unavailable** channels (not_installed /
auth_failed / timeout / failed) — see `review.ts:711-723` and `getCompensatingChannels`.
The dispatcher decides status at `dispatcher.ts:228`: `code === 0 && stdout` →
`completed` (raw stdout saved); **anything else → `failed`** (so exit 0 with *empty*
stdout is `failed`, not completed). The cases map as follows:

- **agy not installed** → `not_installed`; compensator fires (D6).
- **Auth failure** → caught **pre-dispatch** by the D4 auth probe (sentinel match →
  exit 41 → `auth_failed`), recovery surfaced; compensator fires. This is why the
  auth check must catch auth failure — agy itself exits 0 on auth failure, so it
  would otherwise reach dispatch.
- **Timeout / spawn error / exit 0 with empty stdout** → `timeout` / `failed`;
  compensator fires. The 300s channel timeout bounds a hung run; the dispatcher's
  existing posture cleanup removes the neutral cwd temp dir on
  close/error/timeout/SIGINT.
- **Completed (exit 0 + stdout) but non-conforming body** (authed agy emits prose,
  a refusal, or otherwise non-findings-JSON) → status stays `completed` and **no
  compensation fires**, but the output is **not** silently dropped:
  `parseChannelOutput` (`parser.ts:343-361`) catches the parse failure and emits a
  synthetic **P1 finding at `location: 'output-parser'`** ("Failed to parse channel
  output: …"). So a malformed agy run surfaces as a *visible* P1 finding in the
  reconciled results, not a silent zero-findings gap. This is shared behavior across
  all model-output channels (claude/codex parse the same way), not agy-specific.
  Accepted; see D4.

## Testing (TDD)

Live `agy` round-trips are **not** run in CI (no creds; costs scarce quota) — they
were covered by the manual smoke tests recorded in this spec. Automated tests are
config/logic-level:

1. `tests/config/defaults.test.ts` — `antigravity` channel: `command === 'agy'`,
   `prompt_delivery === 'stdin'`, `cwd === '{{neutral_cwd}}'`, `env` is `{}` (asserts
   **no** `HOME`/`XDG_CONFIG_HOME` key), flags include `--print`/`--sandbox`/
   `--dangerously-skip-permissions`/`--print-timeout`, `output_parser === 'default'`,
   `enabled === true`, auth `failure_exit_codes` includes 41, and the auth `check`
   string matches both auth sentinels (`authentication required`/`authentication
   timed out`).
2. `tests/config/channel-aliases.test.ts` — `normalizeChannelName('agy') ===
   'antigravity'`, identity for unknown and canonical names.
3. `tests/commands/cli-parsing.test.ts` — `--channels=agy` dispatches the
   `antigravity` channel; `channels_disabled: ['agy']` disables it; the canonical
   name still works on both surfaces (exercises the centralized normalization in
   `resolveDispatchChannels`).
4. `tests/core/compensator.test.ts` — `COMPENSATING_FOCUS.antigravity` exists and
   resolves to a `claude -p` compensating pass labeled `compensating-antigravity`.
5. `tests/core/host-isolation.test.ts` — **D3 regression (write the failing test
   first):** with a fake `~/.grok/auth.json` staged under a temp HOME, cwd-only
   neutral posture (`withNeutralPosture({}, '{{neutral_cwd}}')`) creates the temp
   dir, pins `PWD`/`OLDPWD`/`INIT_CWD`, and creates **no** `.grok/auth.json`
   symlink (temp dir is empty); the existing grok HOME-neutral case still creates
   the symlink. This test fails against current `host-isolation.ts` and passes after
   the gating fix.
6. `tests/config/loader.test.ts` — `agy:` in a config `channels:` map merges onto
   `antigravity` (D5 config-key normalization); declaring both `agy:` and
   `antigravity:` resolves to canonical with a warning.
7. Full gate: `make check-all` (run `npm install` at the worktree root first — a
   known worktree dependency gap).

## Follow-ups (file as issues)

- **F1 (dated):** Retire/disable the `gemini` built-in channel at/after its
  **June 18, 2026** sunset, making `antigravity` the sole default Google-family
  channel. Quote the sunset date in the issue.
- **F2:** Revisit agy hardening to close the global-config residual gap (D3) once
  agy ships discrete `--no-memory`/`--no-subagents`/web-allowlist flags, an
  auth-only credential file (enabling grok-style HOME isolation), or a local
  `auth status` subcommand (enabling a zero-quota auth check, D4). Concrete first
  step: probe whether `ANTIGRAVITY_EXECUTABLE_DATA_DIR` (finding #9) can relocate
  the CLI config root — if it does, a minimal dir holding only credentials would
  enable a closed-book posture without breaking auth.

## References

- Deprecation announcement: <https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/>
- Grok hardening design (reference posture): `docs/superpowers/specs/2026-05-30-mmr-grok-channel-hardening-design.md`
- Host isolation: `packages/mmr/src/core/host-isolation.ts`
- Channel selection: `packages/mmr/src/commands/review.ts` (`resolveDispatchChannels`)
