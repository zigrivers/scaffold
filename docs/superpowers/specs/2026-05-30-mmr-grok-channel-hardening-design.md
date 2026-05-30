# Design: Harden the MMR Grok channel against context bleed & host/project-context wandering

**Date:** 2026-05-30
**Status:** Approved (brainstorm) + revised over several rounds of multi-model
spec review (Codex, Gemini, Claude, Grok); all blocking findings were folded
into the relevant sections inline rather than collected in a separate log —
ready for implementation plan
**Component:** `packages/mmr` (grok channel) + `CLAUDE.md` review docs
**Severity:** P1 — silently wrong review output (a review can pass/fail on
findings from an unrelated repo)

> Builds on the to-do `tasks/2026-05-30-mmr-grok-channel-hardening-todo.md`,
> which captured the R1/R2 observations and the initial fix sketch. This spec
> records the brainstorm decisions and the **verified** findings from a
> multi-model review of the spec itself, which materially widened the
> "project-context" vector into a broader **host-config** vector (skills, MCP
> servers, and hooks survive a neutral `--cwd`) and pinned down the real
> neutralization mechanism (isolated `HOME`).

## Problem

A `grok` review invocation does not behave as a closed-book reviewer of the
supplied prompt/diff. Multiple independent contamination vectors let it answer
from the wrong context:

1. **Cross-session memory** — grok's cross-session memory store. This is the
   **R1 root cause**: a review of the guides plan instead reviewed a doc from
   an unrelated repo (`nibble`) pulled from a prior session's memory.
2. **Filesystem roaming** — agentic `read_file` (and friends) are enabled by
   default, so grok can read the working tree instead of answering from the
   prompt.
3. **Host-config + project-context injection** — independent of the prompt,
   grok auto-loads context from the working directory **and the user's HOME**
   (`~/.grok/`). Verified via `grok inspect --json` (see table below):
   - `projectInstructions` — `Claude.md` / `Agents.md` in the cwd (~6.7k tokens).
   - **user-scoped skills** — 81 skills from `~/.grok/skills` (catalog injected).
   - **MCP servers** — e.g. `local-ai-delegate` from `~/.grok/config.toml`;
     during the spec review grok actually *attempted MCP tool use*.
   - **hooks** and user-level config (`~/.grok/config.toml`).
   - **permission rules** — `permissions.loaded` HOME-scoped rules (36 on this
     host) that govern what the agent may do.

   None of this belongs in a review of a supplied diff, and — critically — a
   neutral `--cwd` only clears `projectInstructions`; skills, MCP, hooks, and
   permission rules are HOME-scoped and survive it.

### Verified `grok inspect --json` facts (2026-05-30, grok 0.2.11 / grok-build)

| Posture | projectInstructions | skills | mcpServers | hooks | permissions.loaded |
|---|---|---|---|---|---|
| Default (run inside repo) | 2 | 81 | 1 (`local-ai-delegate`) | many | 36 |
| Run from neutral cwd | **0** | 81 | 1 | many | 36 |
| `HOME=<isolated empty dir>` + neutral cwd | **0** | **0** | **0** | **0** | **0** |

- The `inspect` **subcommand** rejects `--cwd` (`grok inspect --cwd …` errors),
  but the **global** form `grok --cwd <dir> inspect --json` is accepted and
  inspects that cwd. Either way, cwd only controls `projectInstructions`
  (verified: `projectInstructions: 0`, `skills: 81` under a neutral cwd) —
  skills/MCP/hooks are HOME-scoped. So the channel sets cwd via the spawn
  working directory (or the global `--cwd`), and isolates the rest via `HOME`.
- Under isolated `HOME`, `grok models` still exits 0 (**auth survives** on this
  macOS host — credentials are keychain-backed, not read from
  `~/.grok/auth.json`). On Linux/CI auth is file-based in `~/.grok/auth.json`,
  so isolated `HOME` **may break auth there** — this MUST be verified per
  platform (see Risks / D3).

MMR's built-in grok channel
(`packages/mmr/src/config/defaults.ts:100-129`) invokes grok with bare flags
(`--prompt-file … --output-format json`), exposing all of the above. R2 showed
the MMR channel returning correct findings **by luck**, not construction. The
same gap exists in the `CLAUDE.md` manual fallback.

## Decisions

### D1. Keep web search; lock down only the dangerous capabilities

Web search/fetch did **not** cause the wrong-target bug and is genuinely useful
in reviews (API-deprecation, CVE, current library behavior). It is a **policy**
choice, not a correctness fix. Default: **web search stays enabled.** The
hardening prohibits *cross-session memory*, *host/project instructions*, *MCP*,
*skills/hooks*, and *working-tree reads* — it does **not** prohibit cited web
context. (This resolves the apparent contradiction with the old "strictly from
the prompt/diff" wording; see Acceptance criteria.)

### D2. FS lockdown via web-only allowlist (deny-by-default) + minimum-safe fallback

Use `--tools` as an **allowlist** that re-enables only the web tool(s), denying
everything else (including `read_file`). Deny-by-default has the safe failure
mode — if grok adds/renames a tool, the worst case is web search stops working
(a lost capability), never a silently re-opened FS hole. A denylist
(`--disallowed-tools`) was rejected because a newly-added grok FS tool would be
allowed by default.

> **grok is version-volatile — but the fallback must fail closed.** If the
> installed grok rejects `--tools` or the tool names differ (e.g.
> `--allowed-tools`, HTTP 400), the channel MUST NOT silently run with
> filesystem tools available — that would leave `read_file` open and violate
> the no-FS acceptance criterion. The fallback order, all of which preserve a
> no-FS posture, is:
> 1. an equivalent verified no-FS-**read** mechanism. Note a *read-only*
>    `--sandbox` profile does NOT qualify — the threat is working-tree *reads*
>    (leakage), and read-only still permits `read_file`. The acceptable
>    alternatives are an enumerated `--disallowed-tools` denylist covering every
>    FS-read tool (verified by test), or a `--sandbox` profile verified to deny
>    filesystem reads of the repo/host;
> 2. failing that, **disable the grok channel** (mark it `degraded`/skipped so
>    MMR's compensating-pass logic covers it) rather than running it FS-open.
> A degraded "memory-only" mode (`--no-memory` + isolated `HOME`, no tool lock)
> is **not** acceptable as a default and, if ever offered, requires explicit
> user opt-in and is **excluded** from the hardening acceptance criteria.
>
> **Fallback selection is static, not runtime.** The posture is chosen once,
> after the manual verification gate (Risks), and baked into the channel config
> — the dispatcher does NOT parse stderr for "unknown flag" and retry at
> runtime. The flag tuple that actually worked is recorded post-verification.

> **Verify at implementation:** grok's exact web tool names (likely
> `web_search` / `web_fetch` — `--disable-web-search` help disables "web search
> and web fetch tools"). Confirm `--tools <names>` is accepted by `grok-build`
> and a review still runs with FS tools denied.

### D3. Neutralize host-config + project-context via isolated HOME (the real lever)

A review must not be seeded with project `Claude.md`/`Agents.md`, the user
skill catalog, MCP servers, or hooks. **Neutral `--cwd` is insufficient** (it
only clears `projectInstructions`). The verified mechanism that clears **all**
host-config sources at once is running grok with an **isolated `HOME`** pointed at a
throwaway directory, combined with a neutral working directory.

Mechanism on the channel (`BUILTIN_CHANNELS.grok` already has an `env` field):

- set `env.HOME` to an isolated dir (and, to be safe across platforms, also
  `XDG_CONFIG_HOME`), and run from a neutral `cwd`;
- deliver the prompt with an **absolute** `--prompt-file` path (relative paths
  break once `cwd`/`HOME` change).

**Auth-vs-isolation tradeoff (gated):** isolated `HOME` removes
`~/.grok/auth.json`. On macOS auth is keychain-backed and survives (verified);
on Linux/CI it likely does not. Implementation MUST verify auth on the target
platform under isolated `HOME`. If auth breaks, use a **surgical isolated dir**
that contains *only* the credential material (e.g. symlink `~/.grok/auth.json`
and any required `bin`/`vendor` entries into the isolated `HOME`) while omitting
`config.toml`, `skills/`, and MCP config — then re-verify `grok inspect` shows
all of those sources empty (instructions, skills, MCP, hooks, permissions) AND `grok models` exits 0.

**New runtime support required (this is net-new plumbing, not pre-existing).**
A static `flags` array cannot express a per-run neutral `cwd` or isolated
`HOME`. Today the only `{{ }}` expansion in the dispatcher is the prompt-file
special case (`dispatcher.ts` ~L84-86); there is **no** channel `cwd` field and
**no** `env`-value placeholder expansion. The implementation must add, in order:

1. **Schema** — add optional `cwd?: string` to the subprocess channel schema
   (`packages/mmr/src/config/schema.ts`, `CommonChannelFields` /
   `SubprocessChannelSchema`).
2. **Runtime neutral-dir creation** — a `{{neutral_home}}` / `{{neutral_cwd}}`
   placeholder backed by `fs.promises.mkdtemp(path.join(os.tmpdir(), 'mmr-grok-'))`
   (note the `path.join` — bare `fs.mkdtemp(os.tmpdir())` appends to the prefix
   and yields a sibling like `/tmpXXXX`, not a dir inside the temp root),
   created **unique per run** (so parallel reviews never share a dir → no
   cross-run bleed). Clean up that exact directory in a `try/finally` around the
   subprocess, **and** a best-effort `SIGINT`/`SIGTERM` handler doing a
   *synchronous* `rmSync(..., { recursive: true, force: true })` (async cleanup
   in `process.on('exit')` is unreliable, and no handler survives `SIGKILL`).
   Because hard kills can still orphan dirs, use a predictable prefix
   (`mmr-grok-`) and add a startup/periodic sweep of stale `os.tmpdir()` entries
   as the durable backstop. (Note: this is a **new** lifecycle — `prompt-file`
   delivery writes a *persisted* `<channel>.prompt.txt` artifact in the channel
   dir and provides no ephemeral-temp cleanup to reuse; introduce a small
   reusable temp-resource manager if one is wanted.) (A single fixed pre-created read-only isolated
   config dir is an acceptable alternative only if never written by concurrent
   runs.)
3. **Placeholder expansion + forwarding** — expand the `cwd`/`env` placeholders
   before spawn, thread `cwd` through `DispatchOptions` and the
   `packages/mmr/src/commands/review.ts` dispatch call sites (both the parallel
   and sequential paths, ~L661 and ~L695, which build `dispatchChannel` options
   from `chConfig` and currently thread only `flags`/`env`/`prompt_delivery`),
   and confirm the spawn site in `dispatcher.ts` sets `cwd` and forwards
   `channel.env`.
4. **Auth probe must use the SAME expanded posture.** MMR runs the channel's
   `auth.check` (`grok models`) *before* dispatch, via `core/auth.ts`, merging
   `channel.env`. If only the dispatcher expands `{{neutral_home}}`, the auth
   probe runs with a literal placeholder `HOME` (nonexistent dir) — it either
   false-fails or verifies a *different* posture than the review actually uses.
   The placeholder expansion (and `cwd`) MUST therefore also apply to the auth
   spawn in `core/auth.ts` and its `commands/review.ts` call site, so the probe
   verifies exactly the isolated-`HOME` posture the review will run under.
5. **Tests** — cleanup/exit-hook, per-run uniqueness, cross-platform path
   handling, and an auth-probe-under-isolated-`HOME` test.

### D4. Determinism flags (+ verify the JSON envelope is unaffected)

Add `--no-subagents` and `--no-plan` (neither affects web search) to reduce
agentic nondeterminism. `--no-memory` is the required core fix.

> **Verify at implementation:** disabling agency may change grok's JSON
> response shape (e.g. omit `thought`, or return a bare string instead of the
> `{ "text": … }` envelope the `unwrap-jsonpath $.text` parser expects). Run a
> hardened review and confirm the existing grok `output_parser` still parses;
> adjust the parser if the envelope changes.

### D5. Closed-book override must restate the full flags array (array-merge footgun)

MMR's config loader deep-merges objects but **replaces arrays** (verified:
`packages/mmr/src/config/loader.ts:39` — "Arrays replace (not concat)"). A user
who sets `channels.grok.flags` in `.mmr.yaml` just to add `--disable-web-search`
would drop the required `--prompt-file {{prompt_file}}` / `--output-format json`
and break the channel. Therefore:

- Document that a closed-book override MUST restate the **entire** hardened
  flags array (with `--disable-web-search` appended) — and, because the channel
  now runs in a neutral `cwd` (D3), the override docs MUST warn that any
  file-path flag the user adds has to be **absolute** (or use a placeholder); a
  relative path would resolve against the neutral cwd and fail — **or**
- (preferred, if cheap) add an additive `extra_flags` mechanism so users can
  append flags without replacing the required delivery/output flags. Decide in
  the implementation plan; if `extra_flags` is out of scope, ship the
  "restate full array" documentation.

This guidance must live in **end-user-facing MMR docs** (the MMR package README
and/or `.mmr.yaml` schema comments), not only in scaffold's `CLAUDE.md` — most
consumers of the override are MMR users who never read scaffold's docs.

## Resolved channel flags (target)

This is the **desired declarative shape** of the channel **after** the
prerequisite runtime support from D3 lands (schema `cwd`, per-run neutral-dir
creation, and `env`/`cwd` placeholder expansion). It is not droppable into
`defaults.ts` as-is today — the `{{neutral_*}}` placeholders do nothing until
that plumbing exists.

```ts
// packages/mmr/src/config/defaults.ts — BUILTIN_CHANNELS.grok
command: 'grok',
prompt_delivery: 'prompt-file',
cwd: '{{neutral_cwd}}',                 // D3: neutral dir (dispatcher-supplied; verify support)
env: { HOME: '{{neutral_home}}', XDG_CONFIG_HOME: '{{neutral_home}}' },  // D3: isolate host config
flags: [
  '--prompt-file', '{{prompt_file}}',   // MUST resolve to an ABSOLUTE path (D3)
  '--output-format', 'json',
  '--no-memory',                        // core: kill cross-session bleed (R1 culprit)
  '--tools', 'web_search,web_fetch',    // D2: deny-by-default; exact names verified at impl
  '--no-subagents', '--no-plan',        // D4: determinism (verify JSON envelope unaffected)
  // NO --disable-web-search — closed-book is a documented override (D1/D5)
],
```

Exact tool names, the `HOME`/`cwd` plumbing shape, and the minimum-safe
fallback are finalized in the implementation plan after the verification gate.
The placeholder values above are replaced with the verified concrete forms
before merge (no `// TBD` comments ship in the resolved channel).

## Compensator path

`resolveCompensatorDispatch` (`packages/mmr/src/core/compensator.ts:53-72`)
reads `command`, `flags`, `env`, `prompt_delivery`, etc. directly from the
resolved config, so hardening `BUILTIN_CHANNELS.grok` propagates the `flags`
and `env` (incl. isolated `HOME`) to the grok-as-compensator path.

**However, `cwd` is the gap.** `CompensatorDispatch` does not carry a `cwd`
field today, so a grok compensator would inherit the isolated `HOME` (clearing
HOME-scoped skills/MCP/hooks) but still run in the **repo cwd** and therefore
re-load `projectInstructions` (`Claude.md`/`Agents.md`). Because
`projectInstructions` is a real contamination vector, the **decision is to
propagate `cwd`** rather than leave a hole:

- add `cwd` to `CompensatorDispatch` and forward it through
  `resolveCompensatorDispatch` → `dispatchCompensatingPasses` → `dispatchChannel`;
- regression-test that grok-as-compensator inherits both the neutral `cwd` and
  the hardened `flags`/`env`.

So this is **no longer a "no edit to compensator.ts" path** — the compensator
needs the `cwd` field threaded through. (The earlier brainstorm note that the
compensator needed no changes held only for `flags`/`env`; `cwd` changes that.)

## Documentation updates (CLAUDE.md)

Only the **review-dispatch** example needs the hardened flags. Corrected
line references (verified against the current file):

- **`CLAUDE.md:267`** — `grok --prompt-file PROMPT_FILE --output-format json …`
  → add `--no-memory`, the `--tools` allowlist, `--no-subagents --no-plan`,
  the isolated-`HOME`/neutral-`cwd` guidance, and an **absolute `--prompt-file`
  path** warning (relative paths break under `--cwd`/`HOME` changes).
- **`CLAUDE.md:255` / `:260`** — installation/auth probes (`command -v grok`,
  `grok models`) are NOT review dispatches; leave functional, cross-reference
  only for the `grok models` auth check.
- **`CLAUDE.md:213`** — `! grok login` recovery line; unchanged.
- There is **no review command at `CLAUDE.md:56`** (that line is the `make test`
  table row). The earlier "~L56" reference was wrong and is dropped.

## Testing

**CI (deterministic):** extend `packages/mmr/tests/config/defaults.test.ts`:
- resolved grok channel `flags` include `--no-memory`.
- resolved grok channel `flags` include the FS-lockdown allowlist (`--tools`
  web-only) and do NOT grant a filesystem-tool allowance.
- resolved grok channel sets the host-isolation posture (`env.HOME` placeholder
  and/or `cwd`) per D3.
- a **dedicated compensator-inheritance test block**: build a minimal config
  with `defaults.compensator.channel = 'grok'`, call `resolveCompensatorDispatch`,
  and assert the returned `flags`/`env`/`prompt_delivery` carry the hardened
  values (do not rely on `BUILTIN_CHANNELS` shape alone).

**Verification gate (run at implementation, recorded — see Risks):**
- `grok inspect --json` under the hardened posture shows
  `projectInstructions: []`, `skills: []`, `mcpServers: []`, `hooks: []`, and
  `permissions.loaded: 0`.
- a probe prompt that *would* trigger `read_file` if tools were allowed produces
  no FS-tool attempt lines in grok output/trace.
- `grok models` exits 0 under the hardened posture (auth intact) on the target
  platform.
- the grok `output_parser` still parses the hardened run's JSON (D4).

**Manual / best-effort (explicitly NOT a CI gate):** the cross-session "stale
context" wander is nondeterministic (R2 passed by luck), so it is kept as a
best-effort PR-narrative repro only, with concrete pass signals (no external-
repo paths in the `thought` trace, no FS-tool calls). The deterministic gate
above is the real acceptance evidence.

## Risks & verification gate (do BEFORE shipping)

`grok-build` rejects some options (e.g. `--effort` → HTTP 400; see memory
`grok-not-in-brew-mmr`). Before finalizing, verify on the installed model and
**record the exact results in this section and `tasks/lessons.md`**:

- `--no-memory` actually disables cross-session memory.
- `--tools web_search,web_fetch` (or the verified real names) is accepted and
  leaves a review runnable with FS tools denied; otherwise apply the D2
  minimum-safe fallback.
- isolated `HOME` (+ neutral `cwd`) empties all the HOME/cwd-scoped `grok inspect` sources (instructions, skills, MCP, hooks, permissions) AND
  preserves auth on the target platform (macOS verified; **Linux/CI must be
  re-verified** — apply the D3 surgical-creds fallback if auth breaks).
- the dispatcher forwards `env`/`cwd` to the grok subprocess (D3).
- `--no-subagents`/`--no-plan` are accepted and the JSON envelope is unchanged
  (D4).
- **Record the exact successful flag/env tuple and the observed residual
  capabilities** (final skill/MCP/hook counts) so future readers know what
  "verified" meant. If any vector cannot be closed with current grok controls,
  document the residual risk and the `.mmr.yaml` escape hatch.

## Acceptance criteria

- [ ] MMR grok channel invokes grok with `--no-memory` and a no-FS-access
      posture (web-only `--tools` allowlist), with a documented minimum-safe
      fallback if the allowlist flag is rejected.
- [ ] Host-config + project-context neutralized: under the hardened posture
      `grok inspect --json` shows `projectInstructions`, `skills`, `mcpServers`,
      `hooks`, and `permissions.loaded` all empty/zero (verified), and grok auth still succeeds on the
      target platform.
- [ ] A grok review answers without cross-session memory, host/project
      instructions, MCP/skills/hooks, or working-tree reads — verified by the
      deterministic gate (no FS-tool calls on a read-trigger probe + empty
      `grok inspect` sources). Web context remains allowed by default.
- [ ] Closed-book reviews are available via a documented `.mmr.yaml` override
      that does not break required delivery/output flags (restate full array or
      `extra_flags`).
- [ ] `CLAUDE.md` review-dispatch grok command updated (L267) with correct line
      references and an absolute `--prompt-file` warning.
- [ ] Regression tests cover the channel flags/env AND compensator inheritance
      via `resolveCompensatorDispatch`.
- [ ] All flag/env semantics verified on `grok-build` (per platform for auth)
      and the exact verified tuple + residual capabilities recorded.
- [ ] Fix noted in `tasks/lessons.md`; memory `grok-not-in-brew-mmr` updated.

## Files touched

- `packages/mmr/src/config/defaults.ts` — grok channel flags + `env`/`cwd` posture
- `packages/mmr/src/config/schema.ts` — **new** optional `cwd?: string` on the
  subprocess channel schema (D3); no `cwd` exists today
- `packages/mmr/src/core/dispatcher.ts` — `env`/`cwd` placeholder expansion +
  spawn-site `cwd`/`env` forwarding; per-run neutral-dir create/cleanup (D3)
- `packages/mmr/src/core/auth.ts` — apply the same `env`/`cwd` placeholder
  expansion to the auth-probe spawn so it verifies the isolated-`HOME` posture
- `packages/mmr/src/commands/review.ts` — thread `cwd` through the dispatch
  call sites (parallel ~L661 + sequential ~L695) that build `dispatchChannel`
  options from `chConfig` (currently only `flags`/`env`/`prompt_delivery`). The
  auth path is different: the main-channel check calls `checkAuth(chConfig)`
  directly (~L542), and the compensator pre-flight calls
  `checkAuth(compChannel)` (~L224, where `compChannel = getCompensatorChannel`),
  so the placeholder/`cwd` expansion must be applied
  to the channel config **before** it reaches `checkAuth` — preferably by
  centralizing posture expansion once, upstream of both auth and dispatch, so
  the probe and the review run identical postures.
- `packages/mmr/src/core/compensator.ts` — add `cwd` to `CompensatorDispatch`
  and forward it through `dispatchCompensatingPasses` (so grok-as-compensator
  also gets the neutral cwd). `flags`/`env` already inherit automatically.
- `packages/mmr/tests/config/defaults.test.ts` — regression + compensator-inheritance tests
- (plus dispatcher/auth/runtime tests for placeholder expansion, per-run
  uniqueness, cleanup, and auth-probe-under-isolated-`HOME`)
- `CLAUDE.md` — review-dispatch grok command (L267) + absolute-path warning
- MMR package docs / `.mmr.yaml` schema comments — the closed-book-override
  guidance (restate full flags array + absolute file-path warning) so it reaches
  end users, not only scaffold maintainers (D5)
- `tasks/lessons.md` — lesson entry (incl. verified flag tuple)
- memory `grok-not-in-brew-mmr` — agentic-wander hardening note

## References

- To-do: `tasks/2026-05-30-mmr-grok-channel-hardening-todo.md`
- Channel def: `packages/mmr/src/config/defaults.ts:100-129`
- Compensator: `packages/mmr/src/core/compensator.ts:53-72`
- Config array-merge: `packages/mmr/src/config/loader.ts:39`
- Test: `packages/mmr/tests/config/defaults.test.ts`
- CLAUDE.md review dispatch: `CLAUDE.md:267` (auth probes L255/L260, recovery L213)
- Memory: `grok-not-in-brew-mmr`
- Surfaced in: `docs/superpowers/specs/2026-05-30-guides-coverage-expansion-plan.md` (R1/R2)
