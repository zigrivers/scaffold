# MMR Antigravity (`agy`) Review-Channel Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a built-in `antigravity` review channel to the MMR CLI that runs Google's `agy` CLI headless and hardened, enabled by default alongside the deprecating `gemini` channel, with `agy` accepted as an alias for the canonical `antigravity` name everywhere a channel name is a user input.

**Architecture:** Almost all behavior reuses existing MMR machinery (stdin prompt delivery, the `default` findings parser, `sh -c` auth checks, `{{neutral_cwd}}` neutral-posture). The new code is: a tiny alias module, alias normalization centralized in `resolveDispatchChannels` and applied to config channel-map keys at load, one targeted host-isolation fix (gate the grok credential symlink on `HOME` neutralization so agy's cwd-only posture stays empty), the channel definition itself, and a compensator-focus entry. No schema or parser changes.

**Tech Stack:** TypeScript (ES modules, `.js` import suffixes), Vitest, Zod config schema, the `@zigrivers/mmr` workspace package under `packages/mmr/`.

**Spec:** `docs/superpowers/specs/2026-05-30-mmr-antigravity-channel-support-design.md` (read it before starting; the Decisions D1–D6 and the source-verified facts justify each choice below).

---

## ⚠️ Branch context (read first)

This worktree (`/Users/kenallred/Developer/scaffold-mmr-antigravity`, branch
`feat/mmr-antigravity-channel`) was created off `feat/guides-system-expansion`,
which **has since been merged into `main` and deleted**. Two consequences:

1. **The diff base is the SHA `93370f90`, not a branch name.** Use
   `git diff 93370f90..HEAD` / `mmr review --base 93370f90` for branch-scoped diffs.
2. **`package.json` here reads `1.4.0`, but `main` is at `1.4.1`** (the grok-hardening
   release landed on main after this fork point). **Before the release-prep task
   (Task 7), rebase this branch onto `origin/main`** so the version bump and CHANGELOG
   are accurate, then bump to `1.5.0` (new feature ⇒ minor). Do the rebase as the
   first action of Task 7, not mid-implementation.

Run all commands from `packages/mmr/` unless a path says otherwise. If `npm`
commands report missing root deps, run `npm install` at the **worktree root**
(`/Users/kenallred/Developer/scaffold-mmr-antigravity`) first — a known worktree gap.

---

## File Structure

**Created:**
- `packages/mmr/src/config/channel-aliases.ts` — `CHANNEL_ALIASES` map + `normalizeChannelName()`. Single source of truth for channel-name aliases.
- `packages/mmr/tests/config/channel-aliases.test.ts` — unit tests for the alias module.

**Modified:**
- `packages/mmr/src/commands/review.ts` — `resolveDispatchChannels` normalizes aliases internally (explicit list + disabled-set membership).
- `packages/mmr/src/config/loader.ts` — normalize alias channel-map keys per overlay before merge (canonical wins on collision + warn).
- `packages/mmr/src/core/host-isolation.ts` — gate the `~/.grok/auth.json` symlink on `env.HOME === NEUTRAL_HOME_PLACEHOLDER`.
- `packages/mmr/src/config/defaults.ts` — add `BUILTIN_CHANNELS.antigravity`.
- `packages/mmr/src/core/compensator.ts` — add `antigravity` to `COMPENSATING_FOCUS`.
- `packages/mmr/tests/commands/review-abstract-filter.test.ts` — resolver alias tests.
- `packages/mmr/tests/config/loader.test.ts` — config-key alias-normalization tests.
- `packages/mmr/tests/core/host-isolation.test.ts` — cwd-only-no-symlink regression test.
- `packages/mmr/tests/config/defaults.test.ts` — `antigravity` channel-shape tests.
- `packages/mmr/tests/core/compensator.test.ts` — `antigravity` focus-entry test.
- `packages/mmr/README.md`, root `CLAUDE.md`, `packages/mmr/CHANGELOG.md`, `packages/mmr/package.json` — docs + release prep (Task 7).

---

## Task 1: Channel alias module

**Files:**
- Create: `packages/mmr/src/config/channel-aliases.ts`
- Test: `packages/mmr/tests/config/channel-aliases.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/mmr/tests/config/channel-aliases.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CHANNEL_ALIASES, normalizeChannelName } from '../../src/config/channel-aliases.js'

describe('normalizeChannelName', () => {
  it('maps the agy alias to the canonical antigravity key', () => {
    expect(normalizeChannelName('agy')).toBe('antigravity')
  })

  it('returns the canonical name unchanged', () => {
    expect(normalizeChannelName('antigravity')).toBe('antigravity')
  })

  it('returns unknown / other channel names unchanged', () => {
    expect(normalizeChannelName('gemini')).toBe('gemini')
    expect(normalizeChannelName('totally-unknown')).toBe('totally-unknown')
  })

  it('exposes the agy→antigravity mapping in CHANNEL_ALIASES', () => {
    expect(CHANNEL_ALIASES.agy).toBe('antigravity')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config/channel-aliases.test.ts`
Expected: FAIL — cannot resolve `../../src/config/channel-aliases.js` (module not found).

- [ ] **Step 3: Write the module**

Create `packages/mmr/src/config/channel-aliases.ts`:

```ts
/**
 * Aliases for built-in channel names, accepted everywhere a channel name is a
 * user input: `--channels`, `channels_disabled`, and config `channels:` keys.
 * Maps an alias → its canonical key (the key used in BUILTIN_CHANNELS).
 *
 * `agy` is the terminal command for Google's Antigravity CLI; `antigravity` is
 * the canonical channel key (descriptive; shown in docs and `mmr config`).
 */
export const CHANNEL_ALIASES: Record<string, string> = {
  agy: 'antigravity',
}

/** Normalize a channel name to its canonical key (identity if not an alias). */
export function normalizeChannelName(name: string): string {
  return CHANNEL_ALIASES[name] ?? name
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config/channel-aliases.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/config/channel-aliases.ts packages/mmr/tests/config/channel-aliases.test.ts
git commit -m "feat(mmr): add channel-name alias module (agy→antigravity)"
```

---

## Task 2: Centralize alias normalization in `resolveDispatchChannels`

**Files:**
- Modify: `packages/mmr/src/commands/review.ts` (the `resolveDispatchChannels` function, ~lines 141-164)
- Test: `packages/mmr/tests/commands/review-abstract-filter.test.ts`

Context: `resolveDispatchChannels(channels, explicit, disabled)` is the single
chokepoint that turns channel-name inputs into the dispatch list. Normalizing
here means `--channels=agy` and `channels_disabled: ['agy']` both resolve to
`antigravity`, and no future caller can bypass the alias. The call site at
`review.ts:489-490` continues to pass the **raw** `channels_disabled` set — the
resolver owns normalization.

- [ ] **Step 1: Write the failing tests**

In `packages/mmr/tests/commands/review-abstract-filter.test.ts`, add an
`antigravity` entry to the `sampleChannels` fixture (so the resolver can find the
canonical target), then add two alias tests. The fixture object currently ends with
the `disabled` entry; add this line inside `sampleChannels` (keep the `satisfies`
clause intact):

```ts
    antigravity: { kind: 'subprocess' as const, enabled: true, abstract: false, command: 'agy', flags: [], env: {}, prompt_wrapper: '{{prompt}}', output_parser: 'default', stderr: 'capture' as const },
```

Then add these tests inside the `describe('resolveDispatchChannels (T1-A)', ...)` block:

```ts
  it('resolves the agy alias to the canonical antigravity channel when explicitly requested', () => {
    const names = resolveDispatchChannels(sampleChannels, ['agy'], new Set())
    expect(names).toEqual(['antigravity'])
  })

  it('treats a canonical antigravity request the same as the alias', () => {
    const names = resolveDispatchChannels(sampleChannels, ['antigravity'], new Set())
    expect(names).toEqual(['antigravity'])
  })

  it('honors channels_disabled given as the agy alias (default resolution)', () => {
    const names = resolveDispatchChannels(sampleChannels, undefined, new Set(['agy']))
    expect(names).not.toContain('antigravity')
    expect(names).toContain('qwen')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/commands/review-abstract-filter.test.ts`
Expected: FAIL — the alias tests fail because `resolveDispatchChannels(['agy'])`
returns `['agy']` (or throws "not found"), and `Set(['agy'])` does not disable
`antigravity`.

- [ ] **Step 3: Modify `resolveDispatchChannels`**

In `packages/mmr/src/commands/review.ts`, add the import near the other config
imports at the top of the file:

```ts
import { normalizeChannelName } from '../config/channel-aliases.js'
```

Replace the body of `resolveDispatchChannels` (currently lines ~141-164) with:

```ts
export function resolveDispatchChannels(
  channels: Record<string, ChannelConfigParsed>,
  explicit: string[] | undefined,
  disabled: Set<string>,
): string[] {
  // Normalize aliases up front so every downstream decision (existence check,
  // abstract filter, disabled membership) operates on canonical names. This is
  // the single chokepoint — centralizing here means no caller can bypass alias
  // handling by passing the raw `disabled` set or an aliased `--channels` value.
  const normalizedDisabled = new Set([...disabled].map(normalizeChannelName))

  const isDispatchable = (name: string, explicitRequest = false): boolean => {
    const ch = channels[name]
    if (!ch) throw new Error(`Channel "${name}" not found in config`)
    if (ch.abstract === true) {
      if (explicitRequest) {
        throw new Error(`Channel "${name}" is abstract and cannot be dispatched`)
      }
      return false
    }
    return true
  }

  if (explicit !== undefined) {
    return explicit
      .map(normalizeChannelName)
      .filter((name) => isDispatchable(name, true))
  }
  return Object.entries(channels)
    .filter(([name, ch]) => ch.enabled && !normalizedDisabled.has(name) && !ch.abstract)
    .map(([name]) => name)
}
```

Note: the returned names are canonical, so the existing `config.channels[name]`
lookups in the auth loop (`review.ts:510`) and dispatch resolve correctly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/commands/review-abstract-filter.test.ts`
Expected: PASS (original tests + 3 new alias tests).

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/commands/review.ts packages/mmr/tests/commands/review-abstract-filter.test.ts
git commit -m "feat(mmr): resolve agy alias to antigravity in resolveDispatchChannels"
```

---

## Task 3: Gate the grok credential symlink on HOME neutralization

**Files:**
- Modify: `packages/mmr/src/core/host-isolation.ts` (the credential-preservation block, ~lines 42-54; plus the `PREFIX` comment ~lines 7-12)
- Test: `packages/mmr/tests/core/host-isolation.test.ts`

Context (spec D3): `withNeutralPosture` currently symlinks `~/.grok/auth.json` into
the temp dir on **any** isolation, including the cwd-only case the `antigravity`
channel uses. That would put a grok credential symlink inside agy's supposedly-empty
neutral cwd. The fix gates the symlink on the **`HOME` key** being neutralized
(checking the key specifically, not "any env value === placeholder", so a future
XDG-only channel doesn't get grok's creds either). `grok` neutralizes `HOME`, so it
is unaffected.

- [ ] **Step 1: Write the failing test**

In `packages/mmr/tests/core/host-isolation.test.ts`, inside the
`describe('grok credential preservation', ...)` block (which already stages a fake
`$HOME/.grok/auth.json` in `beforeEach`), add:

```ts
    it('does NOT symlink grok creds for a cwd-only neutral posture (no HOME neutralization)', () => {
      // antigravity's posture: neutral cwd, real HOME (env has no HOME placeholder).
      const r = withNeutralPosture({}, NEUTRAL_CWD_PLACEHOLDER)
      const neutralDir = r.cwd!
      made.push(neutralDir)

      // The neutral cwd must be genuinely empty — no .grok dir at all.
      expect(fs.existsSync(path.join(neutralDir, '.grok'))).toBe(false)
      // PWD pinning still applies for cwd neutralization.
      expect(r.env.PWD).toBe(neutralDir)

      r.cleanup()
      // Original credential untouched.
      expect(fs.existsSync(path.join(fakeHome, '.grok', 'auth.json'))).toBe(true)
    })

    it('still symlinks grok creds when HOME is neutralized (grok-style posture unaffected)', () => {
      const r = withNeutralPosture(
        { HOME: NEUTRAL_HOME_PLACEHOLDER, XDG_CONFIG_HOME: NEUTRAL_HOME_PLACEHOLDER },
        NEUTRAL_CWD_PLACEHOLDER,
      )
      made.push(r.cwd!)
      expect(fs.existsSync(path.join(r.cwd!, '.grok', 'auth.json'))).toBe(true)
      r.cleanup()
    })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/host-isolation.test.ts`
Expected: FAIL on the cwd-only test — `.grok` exists in the neutral dir because the
current code symlinks unconditionally.

- [ ] **Step 3: Gate the symlink block**

In `packages/mmr/src/core/host-isolation.ts`, wrap the credential-preservation
block (currently ~lines 42-54) in a `homeNeutralized` guard. Replace:

```ts
  // Preserve grok's file-backed credentials so an isolated HOME doesn't break
  // auth on non-keychain platforms (Linux/CI store creds at ~/.grok/auth.json).
  // We symlink ONLY auth.json — NOT config.toml/skills/, so host config stays empty.
  try {
    const realHome = process.env.HOME || os.homedir()
    const cred = path.join(realHome, '.grok', 'auth.json')
    if (fs.existsSync(cred)) {
      const grokDir = path.join(dir, '.grok')
      fs.mkdirSync(grokDir, { recursive: true })
      fs.chmodSync(grokDir, 0o700)
      fs.symlinkSync(cred, path.join(grokDir, 'auth.json'))
    }
  } catch { /* best effort — keychain platforms don't need it */ }
```

with:

```ts
  // Preserve grok's file-backed credentials ONLY when HOME itself is neutralized
  // (grok's posture). For a cwd-only posture (e.g. the antigravity channel) HOME is
  // real, so creds are found normally and a symlink here would be both pointless
  // and harmful — it would put a grok credential inside the neutral cwd. Check the
  // HOME key specifically, not "any env value === placeholder", so a future
  // XDG-only neutralization does not inherit grok's creds either.
  const homeNeutralized = env.HOME === NEUTRAL_HOME_PLACEHOLDER
  if (homeNeutralized) {
    // We symlink ONLY auth.json — NOT config.toml/skills/, so host config stays empty.
    try {
      const realHome = process.env.HOME || os.homedir()
      const cred = path.join(realHome, '.grok', 'auth.json')
      if (fs.existsSync(cred)) {
        const grokDir = path.join(dir, '.grok')
        fs.mkdirSync(grokDir, { recursive: true })
        fs.chmodSync(grokDir, 0o700)
        fs.symlinkSync(cred, path.join(grokDir, 'auth.json'))
      }
    } catch { /* best effort — keychain platforms don't need it */ }
  }
```

Also update the `PREFIX` comment (~lines 7-12) to note shared use:

```ts
// The neutral-posture placeholders are used by the builtin `grok` channel (HOME +
// cwd) and the `antigravity` channel (cwd only). The credential-preservation step
// below is gated on HOME neutralization, so only grok's HOME-isolated posture pulls
// in ~/.grok/auth.json. The `mmr-grok-` temp-dir prefix is retained (shared by both
// channels; sweepStaleNeutralDirs matches it). Generalize the prefix + credential
// path together if a third isolated CLI is added.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/host-isolation.test.ts`
Expected: PASS — cwd-only posture leaves the neutral dir empty; HOME-neutral still
symlinks; all pre-existing host-isolation tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/core/host-isolation.ts packages/mmr/tests/core/host-isolation.test.ts
git commit -m "fix(mmr): gate grok cred symlink on HOME neutralization (cwd-only posture stays empty)"
```

---

## Task 4: Add the `antigravity` built-in channel

**Files:**
- Modify: `packages/mmr/src/config/defaults.ts` (add to `BUILTIN_CHANNELS`)
- Test: `packages/mmr/tests/config/defaults.test.ts`

Context (spec D1–D4): the channel runs `agy --print` with stdin delivery, a neutral
cwd (real HOME), `--sandbox` + `--dangerously-skip-permissions`, the `default`
parser, and a sentinel-string auth check that matches **both** documented
auth-failure strings.

- [ ] **Step 1: Write the failing tests**

In `packages/mmr/tests/config/defaults.test.ts`, add after the grok describe block:

```ts
describe('BUILTIN_CHANNELS — antigravity', () => {
  const ch = () => BUILTIN_CHANNELS.antigravity

  it('exposes an antigravity channel enabled by default', () => {
    expect(ch()).toBeDefined()
    expect(ch()?.enabled).toBe(true)
  })

  it('invokes the agy CLI in print mode', () => {
    expect(ch()?.command).toBe('agy')
    expect(ch()?.flags).toContain('--print')
  })

  it('delivers the prompt via stdin', () => {
    expect(ch()?.prompt_delivery).toBe('stdin')
  })

  it('runs in a neutral cwd but does NOT override HOME/XDG (agy creds live under real HOME)', () => {
    expect(ch()?.cwd).toBe('{{neutral_cwd}}')
    expect(ch()?.env).toEqual({})
    expect(ch()?.env).not.toHaveProperty('HOME')
    expect(ch()?.env).not.toHaveProperty('XDG_CONFIG_HOME')
  })

  it('is hardened with --sandbox and auto-approve, with a bounded print timeout', () => {
    expect(ch()?.flags).toContain('--sandbox')
    expect(ch()?.flags).toContain('--dangerously-skip-permissions')
    expect(ch()?.flags).toContain('--print-timeout')
  })

  it('parses plain model output with the default findings parser', () => {
    expect(ch()?.output_parser).toBe('default')
  })

  it('auth.check matches BOTH auth-failure sentinels and recovery triggers the OAuth flow', () => {
    const check = ch()?.auth?.check ?? ''
    expect(check).toMatch(/authentication required/i)
    expect(check).toMatch(/authentication timed out/i)
    expect(ch()?.auth?.failure_exit_codes).toContain(41)
    expect(ch()?.auth?.recovery).toMatch(/agy -p/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/config/defaults.test.ts`
Expected: FAIL — `BUILTIN_CHANNELS.antigravity` is undefined.

- [ ] **Step 3: Add the channel definition**

In `packages/mmr/src/config/defaults.ts`, add this entry to the `BUILTIN_CHANNELS`
object (place it after the `grok` entry, before `'doc-conformance'`):

```ts
  antigravity: {
    kind: 'subprocess',
    enabled: true,
    abstract: false,
    // Google's Antigravity CLI (terminal command `agy`) — the forward replacement
    // for the deprecating Gemini CLI (Gemini CLI stops serving Pro/Ultra
    // 2026-06-18). Runs alongside the `gemini` channel until that sunset.
    // Verified on agy 1.0.2: `agy --print` reads the prompt from stdin and writes
    // the model reply to stdout (exit 0). There is NO `--output-format json` flag,
    // so the reply is plain text and the review prompt's findings JSON is handled
    // by the `default` parser (same as codex).
    command: 'agy',
    prompt_delivery: 'stdin',
    // Neutral cwd strips project-local AGENTS.md/.agents/mcp_config.json and denies
    // the repo as a workspace (agy reviews only the diff in the prompt). HOME is
    // intentionally NOT overridden: agy stores credentials under $HOME, so a
    // neutral HOME breaks auth (verified) and there is no clean auth-only file to
    // symlink. env must be present ({}) — BUILTIN_CHANNELS is SubprocessChannelParsed.
    cwd: '{{neutral_cwd}}',
    env: {},
    // --sandbox: OS sandbox (sandbox-exec/nsjail). --dangerously-skip-permissions:
    // auto-approve so a headless tool call can't hang to --print-timeout; isolation
    // comes from the empty neutral cwd, not from approval prompts (mirrors gemini's
    // --approval-mode yolo). --print-timeout bounds a hung run.
    flags: [
      '--print',
      '--sandbox',
      '--dangerously-skip-permissions',
      '--print-timeout', '300s',
    ],
    auth: {
      // agy exits 0 even on auth failure (verified), so detect the sentinel strings
      // rather than trust the exit code. Two distinct auth-failure outputs exist:
      // "Authentication required …" and "Error: authentication timed out" — match
      // both. Runs under `sh -c` (auth.ts), so the pipeline + exit codes work.
      check: 'agy -p "respond with ok" --print-timeout 12s 2>&1 | grep -qiE "authentication required|authentication timed out" && exit 41 || exit 0',
      timeout: 20,
      failure_exit_codes: [41],
      recovery: 'agy -p "hello"   # then open the printed Google OAuth URL and paste the code',
    },
    prompt_wrapper: '{{prompt}}',
    output_parser: 'default',
    stderr: 'capture',
    timeout: 360,
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/config/defaults.test.ts`
Expected: PASS (all antigravity tests + pre-existing channel tests).

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/config/defaults.ts packages/mmr/tests/config/defaults.test.ts
git commit -m "feat(mmr): add antigravity (agy) built-in review channel"
```

---

## Task 5: Normalize alias channel-map keys at config load

**Files:**
- Modify: `packages/mmr/src/config/loader.ts` (add a helper; call it in `loadConfigLayers`, ~lines 264-289)
- Test: `packages/mmr/tests/config/loader.test.ts`

Context: a user who learns `agy` from the CLI may write `agy:` under `channels:` in
`.mmr.yaml`. Without normalization that creates a phantom `agy` channel (never
dispatched) instead of overriding `antigravity`. We remap alias keys to canonical
per overlay **before** the deep-merge (canonical wins on collision + warn), so the
alias works uniformly. Provenance stays keyed by the canonical name because the
remap happens before merge/provenance logic sees the keys.

**Depends on Task 4:** the `antigravity` channel must already exist in
`BUILTIN_CHANNELS` so an `agy:` override merges onto a complete channel (a partial
channel with only `timeout` would fail `MmrConfigSchema.parse`).

- [ ] **Step 1: Write the failing tests**

The existing `tests/config/loader.test.ts` stages config by writing a `.mmr.yaml`
into a temp dir and calling `loadConfig({ projectRoot: tmpDir, userHome: tmpDir })`
(see its `beforeEach`/`afterEach` that create/remove `tmpDir`). Add `vi` to the
vitest import at the top of the file (`import { describe, it, expect, beforeEach,
afterEach, vi } from 'vitest'`), then add this describe block (it creates its own
temp dir so it is self-contained):

```ts
describe('channel-key alias normalization', () => {
  let aliasTmp: string
  beforeEach(() => { aliasTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-alias-')) })
  afterEach(() => { fs.rmSync(aliasTmp, { recursive: true, force: true }) })

  it('merges an "agy:" config override onto the canonical antigravity channel', () => {
    const yaml = [
      'version: 1',
      'channels:',
      '  agy:',
      '    timeout: 99',
    ].join('\n')
    fs.writeFileSync(path.join(aliasTmp, '.mmr.yaml'), yaml)

    const config = loadConfig({ projectRoot: aliasTmp, userHome: aliasTmp })
    expect(config.channels.agy).toBeUndefined()            // no phantom channel
    expect(config.channels.antigravity?.timeout).toBe(99)  // merged onto canonical
    expect(config.channels.antigravity?.command).toBe('agy') // base fields preserved
  })

  it('prefers the canonical key and warns when both agy and antigravity are set', () => {
    const yaml = [
      'version: 1',
      'channels:',
      '  agy:',
      '    timeout: 11',
      '  antigravity:',
      '    timeout: 22',
    ].join('\n')
    fs.writeFileSync(path.join(aliasTmp, '.mmr.yaml'), yaml)

    const warn = vi.fn()
    const config = loadConfig({ projectRoot: aliasTmp, userHome: aliasTmp, onWarning: warn })
    expect(config.channels.antigravity?.timeout).toBe(22)  // canonical wins
    expect(config.channels.agy).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('alias for "antigravity"'))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/config/loader.test.ts`
Expected: FAIL — `config.channels.agy` is defined (phantom channel) and
`config.channels.antigravity.timeout` is `360` (the default), not the override.

- [ ] **Step 3: Add the helper and call it**

In `packages/mmr/src/config/loader.ts`, add the import at the top:

```ts
import { normalizeChannelName } from './channel-aliases.js'
```

Add this helper (place it just above `loadConfigLayers`):

```ts
/**
 * Remap alias channel-map keys (e.g. `agy`) to their canonical key
 * (`antigravity`) in a single config overlay, BEFORE it is deep-merged. When an
 * overlay declares both an alias and its canonical key, the canonical wins and a
 * warning is emitted. Overlays without a `channels` map pass through unchanged.
 */
function normalizeOverlayChannelKeys(
  overlay: Record<string, unknown>,
  warn: WarningSink,
): Record<string, unknown> {
  if (!isPlainRecord(overlay.channels)) return overlay
  const src = overlay.channels as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(src)) {
    const canonical = normalizeChannelName(key)
    if (canonical !== key) {
      if (Object.prototype.hasOwnProperty.call(src, canonical)) {
        warn(`mmr: config channel "${key}" is an alias for "${canonical}"; "${canonical}" is also set — ignoring "${key}"`)
        continue
      }
      warn(`mmr: config channel "${key}" is an alias for "${canonical}"; using "${canonical}"`)
    }
    out[canonical] = val
  }
  return { ...overlay, channels: out }
}
```

Then update `loadConfigLayers` to normalize the user and project overlays before
merge, resolving the warn sink from `opts.onWarning`:

```ts
function loadConfigLayers(opts: LoadConfigOptions): ConfigLayers {
  const { cliOverrides } = opts
  const userHome = opts.userHome ?? os.homedir()
  const warn: WarningSink = opts.onWarning ?? console.warn

  let merged: Record<string, unknown> = structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>

  const userConfigPath = path.join(userHome, '.mmr', 'config.yaml')
  const userConfig = normalizeOverlayChannelKeys(loadYaml(userConfigPath) ?? {}, warn)
  if (Object.keys(userConfig).length > 0) {
    resetExtendingChannelBases(merged, userConfig)
    merged = deepMerge(merged, userConfig)
  }

  const projectConfig = normalizeOverlayChannelKeys(loadProjectYaml(opts) ?? {}, warn)
  if (Object.keys(projectConfig).length > 0) {
    resetExtendingChannelBases(merged, projectConfig)
    merged = deepMerge(merged, projectConfig)
  }

  const cliConfig = cliOverridesToConfig(cliOverrides)
  if (Object.keys(cliConfig).length > 0) {
    merged = deepMerge(merged, cliConfig)
  }

  return { merged, userConfig, projectConfig, cliConfig }
}
```

> `WarningSink` is already declared in `loader.ts` (used by `parseMergedConfig` /
> `warnOnInlineSecretHeaders`). Reuse the existing type — do not redefine it. Confirm
> `LoadConfigOptions` has an `onWarning?: WarningSink` field (it does — `loadConfig`
> passes `opts.onWarning` to `parseMergedConfig`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/config/loader.test.ts`
Expected: PASS (existing loader tests + 2 new alias-key tests). The `agy:` override
now lands on `config.channels.antigravity`; the collision case warns + prefers canonical.

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/config/loader.ts packages/mmr/tests/config/loader.test.ts
git commit -m "feat(mmr): normalize alias channel-map keys at config load"
```

---

## Task 6: Compensator focus for the antigravity channel

**Files:**
- Modify: `packages/mmr/src/core/compensator.ts` (the `COMPENSATING_FOCUS` map, ~lines 8-20)
- Test: `packages/mmr/tests/core/compensator.test.ts`

Context (spec D6): if `agy` is unavailable and a job was created (≥1 channel passed
auth), a `claude -p` compensating pass fires with the Google-family focus — the same
lane `gemini` occupies.

- [ ] **Step 1: Write the failing tests**

The focus map `COMPENSATING_FOCUS` is not exported; it is read by the exported
`resolveCompensatorFocus(config: MmrConfigParsed, originalChannel: string)`, which
falls back to a generic string for unknown channels. The existing
`describe('resolveCompensatorFocus', ...)` block already defines a `baseConfig:
MmrConfigParsed` literal. Add these two tests inside that block:

```ts
  it('returns the Google-family focus for the antigravity channel', () => {
    const focus = resolveCompensatorFocus(baseConfig, 'antigravity')
    expect(focus).toMatch(/architectural patterns/i)
    expect(focus).toMatch(/broad-context reasoning/i)
    expect(focus).toMatch(/Antigravity/i)
  })
```

Also add one assertion in the existing `getCompensatingChannels` describe block to
confirm an unavailable antigravity is compensated (its signature is
`getCompensatingChannels(statuses: Record<string, ChannelStatus>, compensatorChannel: string)`):

```ts
  it('compensates for an unavailable antigravity channel', () => {
    const statuses: Record<string, ChannelStatus> = {
      claude: 'completed',
      antigravity: 'auth_failed',
    }
    const result = getCompensatingChannels(statuses, 'claude')
    expect(result.map(c => c.compensatingName)).toContain('compensating-antigravity')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/compensator.test.ts`
Expected: FAIL — `resolveCompensatorFocus(baseConfig, 'antigravity')` returns the
generic fallback ("Focus your review on areas typically covered by antigravity…"),
which does not match `/architectural patterns/`. (The `getCompensatingChannels`
assertion passes already — it is status-based — but the focus test fails until the
map entry is added.)

- [ ] **Step 3: Add the focus entry**

In `packages/mmr/src/core/compensator.ts`, add to the `COMPENSATING_FOCUS` map
(after the `grok` entry):

```ts
  antigravity:
    'Focus your review on: architectural patterns, design consistency,'
    + ' broad-context reasoning, separation of concerns, and dependency analysis.'
    + ' You are compensating for a missing Antigravity (agy) review.',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/compensator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/src/core/compensator.ts packages/mmr/tests/core/compensator.test.ts
git commit -m "feat(mmr): add antigravity compensator focus (Google-family lane)"
```

---

## Task 7: Docs, CHANGELOG, and version bump

**Files:**
- Modify: `packages/mmr/README.md`, root `CLAUDE.md`, `packages/mmr/CHANGELOG.md`, `packages/mmr/package.json`

- [ ] **Step 1: Rebase onto main (base branch was deleted)**

```bash
git fetch origin
git rebase origin/main
```

Resolve any conflicts (the spec/plan docs are new files, so conflicts are unlikely;
`package.json`/`CHANGELOG.md` may need a manual merge — keep main's 1.4.1 history and
add the new entry on top in Step 4). Re-run `npx vitest run` after rebase to confirm
green before continuing.

- [ ] **Step 2: Update `packages/mmr/README.md`**

Find the channel list (the line describing "Dispatches reviews to Claude CLI, Codex
CLI, and Gemini CLI" near the top, and the config-example / output-parser sections).
Add Antigravity to the prose channel list and add a short config note:

```md
- **Antigravity CLI** (`agy`) — Google's forward replacement for the deprecating
  Gemini CLI. Enabled by default; runs hardened (neutral cwd, `--sandbox`,
  auto-approve). The channel key is `antigravity`; `agy` is accepted as an alias
  in `--channels`, `channels_disabled`, and `channels:` config keys.
```

- [ ] **Step 3: Update root `CLAUDE.md`**

In the "built-in channels" description (the section listing Codex, Gemini, Claude,
Grok), add Antigravity as a fifth built-in channel, note `gemini` is sunsetting
2026-06-18, add the auth-recovery line `- Antigravity: \`! agy -p "hello"\``, and add
an `antigravity`/`agy` example to the `channels_disabled` guidance. Add a manual
hardened-fallback block mirroring the grok one:

````md
# agy (Antigravity) — hardened review posture: neutral cwd (strips project
# AGENTS.md/.agents/mcp_config.json + denies repo access), OS sandbox, auto-approve
# to avoid headless approval hangs. Real HOME (agy creds live under $HOME).
NCWD="$(mktemp -d)"; trap 'rm -rf "$NCWD"' EXIT INT TERM
printf '%s' "$PROMPT" | ( cd "$NCWD" && agy --print --sandbox \
  --dangerously-skip-permissions --print-timeout 300s 2>/dev/null )
````

- [ ] **Step 4: Update `packages/mmr/CHANGELOG.md` and bump version**

Add a `[1.5.0]` entry (after rebasing, the prior top entry is `[1.4.1]`):

```md
## [1.5.0] — 2026-05-30

### Added
- New built-in `antigravity` review channel running Google's `agy` CLI (the
  forward replacement for the deprecating Gemini CLI), enabled by default and
  running in parallel with `gemini` until gemini's 2026-06-18 sunset. Runs
  hardened: neutral cwd (strips project config + denies repo access), `--sandbox`,
  auto-approve to avoid headless hangs; real HOME (agy creds live under `$HOME`).
- `agy` accepted as an alias for the canonical `antigravity` channel name in
  `--channels`, `channels_disabled`, and `channels:` config keys.

### Fixed
- Host isolation: the grok credential symlink is now gated on HOME neutralization,
  so a cwd-only neutral posture (the antigravity channel) no longer creates a
  `.grok/auth.json` symlink in its working directory.
```

Then bump the version in `packages/mmr/package.json` from `1.4.1` to `1.5.0`.

- [ ] **Step 5: Commit**

```bash
git add packages/mmr/README.md CLAUDE.md packages/mmr/CHANGELOG.md packages/mmr/package.json
git commit -m "docs(mmr): document antigravity channel + bump to 1.5.0"
```

---

## Task 8: Full gate + branch review

**Files:** none (verification only)

- [ ] **Step 1: Ensure root deps are installed**

Run (from the worktree root): `npm install`
Expected: completes; root dev-deps present (avoids the known worktree type-check gap).

- [ ] **Step 2: Run the mmr package tests**

Run (from `packages/mmr/`): `npx vitest run`
Expected: PASS — all suites, including the new alias, loader, host-isolation,
defaults, and compensator tests.

- [ ] **Step 3: Type-check and full gate**

Run (from `packages/mmr/`): `npm run type-check`
Then (from the worktree root): `make check-all`
Expected: both green. If `make check-all` reports a pre-existing unrelated failure,
note it; do not let the new code introduce any failure.

- [ ] **Step 4: Multi-model review of the implementation diff**

Run (from the worktree root): `mmr review --base origin/main --head HEAD --sync --format json`
(After the Task 7 rebase the branch is on top of `origin/main`, so this diff is the
full implementation.) Fix any blocking findings (severity ≥ the `.mmr.yaml`
`fix_threshold`, default P2) per CLAUDE.md's review rules, then re-review until the
verdict is `pass`/`degraded-pass`.

- [ ] **Step 5: Finish the branch**

Use the superpowers:finishing-a-development-branch skill to open a PR **targeting
`main`** (the original base branch `feat/guides-system-expansion` no longer exists).

---

## Notes on follow-ups (do NOT implement here — file as issues)

- **F1 (dated):** Retire/disable the `gemini` built-in channel at/after its
  **2026-06-18** sunset, making `antigravity` the sole default Google-family channel.
- **F2:** Revisit agy hardening once it ships discrete `--no-memory`/`--no-subagents`/
  web-allowlist flags, an auth-only credential file (grok-style HOME isolation), or a
  local `auth status` subcommand (zero-quota auth check). First probe whether
  `ANTIGRAVITY_EXECUTABLE_DATA_DIR` can relocate the CLI config root.
