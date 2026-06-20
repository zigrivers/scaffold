# MMR Agent-Legible Config — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans / subagent-driven-development. Steps use checkbox syntax.

**Goal:** Add the general `config set/unset` mutators, `mmr doctor`, and flip the compensating-pass default so MMR stops wasting work on structurally-absent channels — plus the Scaffold-side compensation-guidance alignment.

**Architecture:** Build `set/unset` on the Phase-1 comment-preserving writer, adding `deleteIn` + a validate-before-commit guard. Add `required?: boolean` to the channel schema. Classify channel unavailability in `getCompensatingChannels` (structural `not_installed` vs transient) and gate structural compensation behind `--compensate-missing` / per-channel `required: true`. `mmr doctor` fuses the existing `config test` diagnostics with a remediation plan and an optional `--fix`.

**Tech Stack:** TypeScript, yargs, eemeli `yaml`, Zod, vitest.

## Global Constraints (carry ALL Phase-1 lessons forward)

- **Redact user-configurable strings everywhere they're emitted** — any `recovery`/`command`/`check` string printed to stdout/stderr/JSON goes through `redactCommandString` (or `redactConfigView`). Cover BOTH subprocess and **http** channel paths.
- **Validate before committing a write.** `set`/`unset` must produce a config that still `loadConfig`s; build the new document, validate it in memory, and only then write. Never leave an invalid config on disk.
- **Symlink safety:** project (untrusted) writes reject symlinks; only the user-owned global file opts into `allowSymlink`. Reuse `WriteOpts`.
- **Scope guards stay symmetric** (global vs project; the channel must be resolvable in the target scope).
- **HTTP-channel parity:** any new code that branches on channels must handle `kind: 'http'` (no command/install).
- **try/catch around every fs write**, friendly error, non-zero exit.
- **No forward-references**: every command/flag a message points to must exist.
- **C1 is a behavior change → the consolidated release is MAJOR (mmr 2.0.0)**; CHANGELOG "Behavior changes" + a one-time runtime notice + the `--compensate-missing`/`required: true` opt-outs (decision D3).
- **TDD**; `npm run check` green before push; branch `feat/mmr-agent-legible-phase-2`.

---

## File Structure

- `packages/mmr/src/config/writer.ts` — add `unsetConfigValueSegs` (deleteIn) + a `validateConfigContent` helper (parse candidate via the existing loader path).
- `packages/mmr/src/commands/config.ts` — add `set`/`unset` actions; validate-before-commit.
- `packages/mmr/src/config/schema.ts` — add `required?: boolean` to the subprocess/http channel schema.
- `packages/mmr/src/core/compensator.ts` — `getCompensatingChannels` gains structural/transient classification.
- `packages/mmr/src/commands/review.ts` — thread `--compensate-missing`; emit the one-time structural-skip notice.
- `packages/mmr/src/commands/doctor.ts` — **new.** `mmr doctor` + `--fix`.
- `packages/mmr/src/cli.ts` — register `doctorCommand`.
- `content/tools/review-pr.md`, `content/tools/review-code.md`, `CLAUDE.md`, `content/skills/mmr/SKILL.md`, `content/guides/mmr/index.md` — compensation-guidance + doctor docs.

---

## Task 1: `config set <dotted.path> <value>` with validate-before-commit

**Files:** `src/config/writer.ts`, `src/commands/config.ts`; tests `tests/config/writer-validate.test.ts`, `tests/commands/config-set.test.ts`.

**Interfaces:**
- `validateConfigText(text: string): { ok: true } | { ok: false; error: string }` — parse candidate YAML through the same Zod/loader validation used on read, without touching disk.
- New config action `set` writing `args.name` (dotted path) = `args.value` to the chosen scope.

- [ ] **Step 1: failing test — set writes a typed value and rejects one that would invalidate config**

```typescript
// tests/commands/config-set.test.ts (sketch — mirror config-enable-disable harness)
it('sets a dotted value with type coercion to the project file', async () => {
  await run({ action: 'set', name: 'defaults.fix_threshold', value: 'P1', project: true })
  expect(fs.readFileSync(path.join(tmp, '.mmr.yaml'), 'utf-8')).toMatch(/fix_threshold: P1/)
})
it('refuses a set that would make config invalid (does not write)', async () => {
  // defaults.fix_threshold only accepts P0..P3
  const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  await run({ action: 'set', name: 'defaults.fix_threshold', value: 'NOPE', project: true })
  expect(exitSpy).toHaveBeenCalledWith(1)
  expect(fs.existsSync(path.join(tmp, '.mmr.yaml'))).toBe(false)
  errSpy.mockRestore(); exitSpy.mockRestore()
})
```

- [ ] **Step 2: run, verify fail.**
- [ ] **Step 3: implement.** Add `validateConfigText` to writer (build a `Document`, but validate by running the merged value through `MmrConfigSchema` — reuse loader's parse path on the candidate text). Add a `setConfigValueChecked(file, segs, value, opts)` that: load doc → setIn → render `toString()` → `validateConfigText(rendered)` → if invalid, throw/return error WITHOUT writing → else `safeWrite`. The `config set` handler resolves scope (reuse `resolveConfigPaths`/`--global`/`--project`, default project), computes `allowSymlink` for global, calls the checked setter inside try/catch, prints the new value + provenance + revert (`config unset` / prior value).
- [ ] **Step 4: run, verify pass.**
- [ ] **Step 5: commit** `feat(mmr): config set with validate-before-commit (A2)`.

## Task 2: `config unset <dotted.path>`

**Files:** `src/config/writer.ts` (`unsetConfigValueSegs` via `doc.deleteIn`), `src/commands/config.ts`; test `tests/commands/config-unset.test.ts`.

- [ ] **Step 1: failing test** — unset removes the override and reports the inherited fallback value.

```typescript
it('unsets a project override and reports the inherited default', async () => {
  fs.writeFileSync(path.join(tmp, '.mmr.yaml'), 'version: 1\ndefaults:\n  timeout: 999\n')
  await run({ action: 'unset', name: 'defaults.timeout', project: true })
  expect(fs.readFileSync(path.join(tmp, '.mmr.yaml'), 'utf-8')).not.toMatch(/timeout: 999/)
  const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n')
  expect(out).toMatch(/300/) // inherited default
})
```

- [ ] **Step 2-4:** implement `unsetConfigValueSegs(file, segs, opts)` (loadDoc → `doc.deleteIn(segs)` → validate-before-commit → safeWrite). Handler: compute the effective value AFTER unset (via `loadConfigWithProvenance`) and print it as the fallback. Same scope/symlink/try-catch rules.
- [ ] **Step 5: commit** `feat(mmr): config unset reverts an override (A2)`.

## Task 3: schema `required?: boolean`

**Files:** `src/config/schema.ts`; test `tests/config/schema.test.ts`.

- [ ] Add `required: z.boolean().optional()` to the subprocess + http channel schemas. Test: a channel with `required: true` parses; default is `undefined`. Commit `feat(mmr): channel required flag (C1 opt-in)`.

## Task 4: classify compensation (C1) — structural vs transient

**Files:** `src/core/compensator.ts`, `src/commands/review.ts`; tests `tests/core/compensator-classify.test.ts`.

**Interface change:** `getCompensatingChannels(channelStatuses, compensatorChannel, opts: { compensateMissing: boolean; channels: Record<string, {required?: boolean}> }): CompensatingChannel[]`.

- [ ] **Step 1: failing test** — `not_installed` is skipped by default; compensated when `compensateMissing` or `required: true`; `auth_failed`/`timeout`/`failed` always compensated.

```typescript
it('does not compensate a structurally-absent channel by default', () => {
  const out = getCompensatingChannels({ grok: 'not_installed', codex: 'auth_failed' }, 'claude',
    { compensateMissing: false, channels: {} })
  expect(out.map((c) => c.originalChannel)).toEqual(['codex'])
})
it('compensates not_installed when required or --compensate-missing', () => {
  expect(getCompensatingChannels({ grok: 'not_installed' }, 'claude',
    { compensateMissing: true, channels: {} }).length).toBe(1)
  expect(getCompensatingChannels({ grok: 'not_installed' }, 'claude',
    { compensateMissing: false, channels: { grok: { required: true } } }).length).toBe(1)
})
```

- [ ] **Step 2-4:** implement. In the loop: for `not_installed`, push only if `opts.compensateMissing || opts.channels[name]?.required`. Other degraded statuses unchanged. Thread `--compensate-missing` boolean option through `reviewCommand` builder + handler into the `getCompensatingChannels` call. Emit a **one-time** notice (stderr) the first run a structural channel is skipped-without-compensation, naming it + the opt-outs.
- [ ] **Step 5: commit** `feat(mmr): stop compensating structurally-absent channels by default (C1, behavior change)`.

## Task 5: `mmr doctor` (+ `--fix`)

**Files:** `src/commands/doctor.ts` (new), `src/cli.ts`; test `tests/commands/doctor.test.ts`.

**Behavior:** Iterate channels (reuse `config test` logic — extract a shared `probeChannels()` so doctor and `config test` don't duplicate). Classify each: ok / auth_failed (→ recovery, REDACTED) / not_installed (→ "install, or `mmr config disable <name>`") / disabled. Print a plan. `--fix` runs `mmr config disable` on each structurally-absent channel (using the Phase-1 mutator, default global since not-installed is machine-level). `--json` for agents (redacted).

- [ ] **Step 1: failing test** — doctor prints a per-channel plan; `not_installed` shows the disable remediation; recovery is redacted.
- [ ] **Step 2-4:** implement. Extract `probeChannels(config)` into a shared module (e.g. `src/core/channel-health.ts`) returning `{name, status, recovery?}[]` with recovery already redacted and HTTP handled; `config test` and `doctor` both call it. `doctor --fix` calls the disable path for `not_installed` channels and reports what it changed.
- [ ] **Step 5: commit** `feat(mmr): mmr doctor diagnoses and fixes channels (C2)`.

## Task 6: Scaffold-side compensation alignment (E3) + docs

**Files:** `CLAUDE.md`, `content/tools/review-pr.md`, `content/tools/review-code.md`, `content/skills/mmr/SKILL.md`, `content/guides/mmr/index.md` (+ rebuild guides).

- [ ] Update the "compensating pass for each missing external channel" guidance to distinguish transient (compensate) vs structural (skip + remediate; opt in with `--compensate-missing`/`required: true`). Document `mmr doctor`, `config set/unset`. Rebuild guides; run citation/drift gates.
- [ ] Commit `docs(mmr): align compensation guidance + document doctor/set (E3)`.

## Final verification
- [ ] `cd packages/mmr && npm run check` green.
- [ ] `make check-all` green (content touched).
- [ ] Smoke-test `config set/unset`, `mmr doctor`, `mmr doctor --fix` in a scratch dir.
- [ ] Push, PR, multi-model review, fix all findings, merge.

## Self-Review
Covers vision Phase-2 rows: A2 (Tasks 1-2), C1 (Tasks 3-4), C2 (Task 5), E3 (Task 6). D3 (major release) is handled at the consolidated release (Task 7 of the overall effort), flagged here as a constraint. Defensive constraints from Phase 1 are encoded in Global Constraints and each task references validate-before-commit / redaction / symlink / scope / http parity.
