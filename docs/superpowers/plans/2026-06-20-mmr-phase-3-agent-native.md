# MMR Agent-Legible Config — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Make MMR self-describing for agents — a machine-readable capability manifest (`mmr commands --json`) and inline just-in-time docs (`mmr explain <topic>`), so an agent can learn the whole surface in one call instead of probing N commands.

**Architecture:** Both are read-only, hand-authored data surfaces (no introspection of yargs internals — a curated manifest is more reliable and stays in lockstep with what we actually want agents to see). A single source-of-truth `COMMAND_MANIFEST` array drives `mmr commands` (text + `--json`). `EXPLAIN_TOPICS` drives `mmr explain`. A drift test asserts every registered top-level CLI command appears in the manifest, so the manifest can't silently fall behind.

**Tech Stack:** TypeScript, yargs, vitest.

## Global Constraints (carry Phase 1-2 lessons)

- **Read-only, no secrets**: these commands print static docs — no config values, no channel probing, nothing user-configurable. So no redaction surface. Keep it that way (don't interpolate config).
- **Machine-readable twin**: `mmr commands --json` emits structured data; `--format text` (default) is human-readable.
- **No forward-references**: every command in the manifest must be registered in `cli.ts`. The drift test enforces this.
- **TDD**; `npm run check` green before push; branch `feat/mmr-agent-legible-phase-3`.

---

## File Structure

- `packages/mmr/src/core/manifest.ts` — **new.** `COMMAND_MANIFEST: CommandSpec[]` (name, summary, example, writes, args) — the single source of truth.
- `packages/mmr/src/commands/commands.ts` — **new.** `mmr commands [--format json]`.
- `packages/mmr/src/core/explain.ts` — **new.** `EXPLAIN_TOPICS: Record<string, string>` (topic → markdown body).
- `packages/mmr/src/commands/explain.ts` — **new.** `mmr explain [<topic>]` (lists topics with no arg; prints one with a topic).
- `packages/mmr/src/cli.ts` — register both.
- Tests under `packages/mmr/tests/commands/` + a manifest-drift test.

---

## Task 1: command manifest + `mmr commands`

**Files:** `src/core/manifest.ts`, `src/commands/commands.ts`, `src/cli.ts`; tests `tests/commands/commands.test.ts`, `tests/core/manifest-drift.test.ts`.

**Interfaces:**
- `interface CommandSpec { command: string; summary: string; example: string; writes: boolean; args?: string[] }`
- `COMMAND_MANIFEST: ReadonlyArray<CommandSpec>` — one entry per agent-relevant command (review, status, results, config <each action>, doctor, reconcile, sessions, ack, skill, commands, explain).

- [ ] **Step 1: failing test — `mmr commands --json` emits parseable specs including config disable + doctor**

```typescript
it('emits a machine-readable manifest', async () => {
  const { commandsCommand } = await import('../../src/commands/commands.js')
  // logSpy captures stdout
  await commandsCommand.handler({ format: 'json', _: ['commands'], $0: 'mmr' } as never)
  const specs = JSON.parse(out) as Array<{ command: string; example: string; writes: boolean }>
  expect(specs.find((s) => s.command.startsWith('config disable'))?.writes).toBe(true)
  expect(specs.find((s) => s.command === 'doctor')).toBeTruthy()
  expect(specs.find((s) => s.command.startsWith('config path'))?.writes).toBe(false)
})
```

- [ ] **Step 2: run, verify fail.**
- [ ] **Step 3: implement.** Author `COMMAND_MANIFEST` in `manifest.ts`. `commands.ts`: default prints an aligned `COMMAND  —  summary` table; `--format json` prints `JSON.stringify(COMMAND_MANIFEST, null, 2)`. Register in `cli.ts`.
- [ ] **Step 4: run, verify pass.**
- [ ] **Step 5: manifest-drift test** — every command registered in `cli.ts` (introspect `yargs().getInternalMethods?.()` is brittle; instead maintain an explicit `REGISTERED_TOP_LEVEL = ['review','status',...]` list in cli.ts exported for the test) has a manifest entry whose `command` starts with that name. Assert no registered command is missing from the manifest.

```typescript
it('manifest covers every registered top-level command', async () => {
  const { REGISTERED_TOP_LEVEL } = await import('../../src/cli.js')
  const { COMMAND_MANIFEST } = await import('../../src/core/manifest.js')
  for (const name of REGISTERED_TOP_LEVEL) {
    expect(COMMAND_MANIFEST.some((s) => s.command === name || s.command.startsWith(name + ' '))).toBe(true)
  }
})
```

- [ ] **Step 6: commit** `feat(mmr): mmr commands machine-readable capability manifest (D2)`.

## Task 2: `mmr explain <topic>`

**Files:** `src/core/explain.ts`, `src/commands/explain.ts`, `src/cli.ts`; test `tests/commands/explain.test.ts`.

**Topics (initial):** `channels`, `config`, `scopes`, `compensation`, `redaction`, `provenance`. Each a concise markdown body an agent can read inline.

- [ ] **Step 1: failing test**

```typescript
it('explains a known topic and lists topics with no arg', async () => {
  const { explainCommand } = await import('../../src/commands/explain.js')
  await explainCommand.handler({ topic: 'compensation', _: ['explain'], $0: 'mmr' } as never)
  expect(out).toMatch(/structural/i)
  // no topic → list
  await explainCommand.handler({ _: ['explain'], $0: 'mmr' } as never)
  expect(out).toMatch(/channels/) // lists available topics
})
it('errors (exit 1) on an unknown topic and lists valid ones', async () => { /* assert exit 1 + topic list */ })
```

- [ ] **Step 2-4:** implement. `explain.ts` core holds the topic bodies. `commands/explain.ts`: no topic → print the topic list; known topic → print its body; unknown → error to stderr with the list + exit 1. Register in `cli.ts`.
- [ ] **Step 5: commit** `feat(mmr): mmr explain inline just-in-time docs (D3)`.

## Task 3: docs (skill/guide)

**Files:** `content/skills/mmr/SKILL.md`, `content/guides/mmr/index.md` (+ rebuild).

- [ ] Add `mmr commands --json` and `mmr explain <topic>` to the skill + guide subcommand table. Note for agents: load the whole surface with `mmr commands --json` instead of probing. Rebuild guides; citation/drift gates.
- [ ] Commit `docs(mmr): document commands + explain (D2, D3)`.

## Final verification
- [ ] `npm run check` green; `make check-all` green.
- [ ] Smoke-test `mmr commands --json | jq '.[0]'`, `mmr explain compensation`.
- [ ] Push, PR, multi-model review, fix all findings, merge.

## Self-Review
Covers vision Phase-3 rows: D2 (Task 1), D3 (Task 2). The "required vs optional channel semantics" Phase-3 item was delivered in Phase 2 (the `required` flag + compensation classification), so it's not repeated here. Read-only surfaces → minimal review risk; the drift test prevents the manifest from going stale.
