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

There is **no clean auth-only credential file** to symlink (no `credentials.enc`;
the token is co-mingled in `~/.gemini/antigravity-cli/` alongside `settings.json`,
`mcp_config.json`, `plugins/`, `knowledge/`). This is why agy cannot reach grok's
closed-book posture (see Decision D3).

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

> **Implementation note:** the existing `withNeutralPosture(env, cwd)` in
> `src/core/host-isolation.ts` already supports cwd-only neutralization. The `grok`
> channel triggers it via both `{{neutral_home}}` and `{{neutral_cwd}}`; the
> `antigravity` channel triggers it via `{{neutral_cwd}}` alone. **No host-isolation
> code change is required.** (Confirm with a unit test that cwd-only posture creates
> the temp dir, pins `PWD`/`OLDPWD`/`INIT_CWD`, and performs **no** credential
> symlink.)

### D4 — Auth check: sentinel-string detection, short timeout

agy exits 0 even when unauthenticated (finding #7), so the auth probe must detect
the `Authentication required` sentinel rather than trust the exit code:

```
agy -p "respond with ok" --print-timeout 12s 2>&1 | grep -qi "authentication required" && exit 41 || exit 0
```

with `failure_exit_codes: [41]`, `auth.timeout: 20`, and
`recovery: 'agy -p "hello"   # then open the printed Google OAuth URL and paste the code'`.

This is a lightweight model round-trip (tiny prompt) — consistent with the existing
`gemini` channel, whose auth probe is also a round-trip. The auth check runs with
**real HOME** (the channel does not neutralize HOME), so the credential store is
visible and the probe is accurate.

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

Applied in `src/commands/review.ts` to each `--channels` entry and to each
`channels_disabled` entry **before** `resolveDispatchChannels` runs. The
`config.channels` map keeps the single canonical key `antigravity` — the channel is
**not** duplicated.

**Boundary (documented):** config *overrides* in `.mmr.yaml` (`channels:` map keys)
must use the canonical key `antigravity`. The alias applies only to selection
(`--channels`, `channels_disabled`), not to override-map keys. This avoids
merge-key collisions and keeps the loader simple.

### D6 — Compensator focus

Add `antigravity` to `COMPENSATING_FOCUS` in `src/core/compensator.ts` with the
Google-family strength area (architectural patterns, design consistency,
broad-context reasoning — the same lane `gemini` occupies). If `agy` is unavailable
(not installed / auth failed / timeout / error), a `claude -p` compensating pass
fires with that focus, labeled `compensating-antigravity`.

## Architecture

This is almost entirely a **`defaults.ts` + docs** change plus a tiny alias module.
No schema, dispatcher, host-isolation, or parser code changes are required — every
capability the channel needs (stdin delivery, `{{neutral_cwd}}` neutralization,
`default` parser, sentinel-string auth check) already exists.

### Channel definition (`src/config/defaults.ts`, `BUILTIN_CHANNELS.antigravity`)

```ts
antigravity: {
  kind: 'subprocess',
  enabled: true,
  abstract: false,
  command: 'agy',
  prompt_delivery: 'stdin',            // verified: agy --print reads stdin
  cwd: '{{neutral_cwd}}',              // neutral cwd; HOME intentionally NOT overridden
  flags: [
    '--print',
    '--sandbox',
    '--dangerously-skip-permissions',
    '--print-timeout', '300s',
  ],
  auth: {
    check: 'agy -p "respond with ok" --print-timeout 12s 2>&1 | grep -qi "authentication required" && exit 41 || exit 0',
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
- `packages/mmr/src/commands/review.ts` — apply `normalizeChannelName` to `--channels`
  entries and `channels_disabled` entries before `resolveDispatchChannels`.
- `packages/mmr/src/core/compensator.ts` — add `antigravity` to `COMPENSATING_FOCUS`.
- `packages/mmr/tests/config/defaults.test.ts` — assert the `antigravity` channel shape.
- `packages/mmr/tests/core/compensator.test.ts` — assert the `antigravity` focus entry.
- `packages/mmr/tests/commands/review*.test.ts` (or nearest existing) — assert
  `agy`→`antigravity` alias resolution in `--channels` and `channels_disabled`.
- `packages/mmr/CHANGELOG.md` — new minor-version entry.
- `packages/mmr/package.json` — version bump (minor — new feature).
- `packages/mmr/README.md` — channel list + config example mention agy.
- Root `CLAUDE.md` — review-channel list, auth-recovery (`! agy -p "hello"`),
  manual hardened-fallback block, `channels_disabled` example, gemini-sunset note.

## Error handling

- **agy not installed** → `not_installed`; compensator fires (D6).
- **Auth failure** → D4 probe returns exit 41 → `auth_failed`, recovery surfaced;
  compensator fires.
- **Timeout / non-zero / malformed output** → `failed`; compensator fires. The
  300s channel timeout bounds a hung run; the dispatcher's existing posture cleanup
  removes the neutral cwd temp dir on close/error/timeout/SIGINT.
- **Unparseable output** → `default` parser throws → channel reported failed.

## Testing (TDD)

Live `agy` round-trips are **not** run in CI (no creds; costs scarce quota) — they
were covered by the manual smoke tests recorded in this spec. Automated tests are
config/logic-level:

1. `defaults.test.ts` — `antigravity` channel: `command === 'agy'`,
   `prompt_delivery === 'stdin'`, `cwd === '{{neutral_cwd}}'`, **no** `HOME`/
   `XDG_CONFIG_HOME` in `env`, flags include `--print`/`--sandbox`/
   `--dangerously-skip-permissions`/`--print-timeout`, `output_parser === 'default'`,
   `enabled === true`, auth `failure_exit_codes` includes 41.
2. `channel-aliases.test.ts` — `normalizeChannelName('agy') === 'antigravity'`,
   identity for unknown/canonical names.
3. `review` alias test — `--channels=agy` dispatches the `antigravity` channel;
   `channels_disabled: ['agy']` disables it; canonical name still works.
4. `compensator.test.ts` — `COMPENSATING_FOCUS.antigravity` exists and resolves.
5. host-isolation regression — cwd-only neutral posture (no HOME placeholder)
   creates the temp dir, pins `PWD`/`OLDPWD`/`INIT_CWD`, performs **no** credential
   symlink (guards the D3 "real HOME" assumption).
6. Full gate: `make check-all` (run `npm install` at the worktree root first — a
   known worktree dependency gap).

## Follow-ups (file as issues)

- **F1 (dated):** Retire/disable the `gemini` built-in channel at/after its
  **June 18, 2026** sunset, making `antigravity` the sole default Google-family
  channel. Quote the sunset date in the issue.
- **F2:** Revisit agy hardening to close the global-config residual gap (D3) once
  agy ships discrete `--no-memory`/`--no-subagents`/web-allowlist flags, an
  auth-only credential file (enabling grok-style HOME isolation), or a local
  `auth status` subcommand (enabling a zero-quota auth check, D4).

## References

- Deprecation announcement: <https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/>
- Grok hardening design (reference posture): `docs/superpowers/specs/2026-05-30-mmr-grok-channel-hardening-design.md`
- Host isolation: `packages/mmr/src/core/host-isolation.ts`
- Channel selection: `packages/mmr/src/commands/review.ts` (`resolveDispatchChannels`)
