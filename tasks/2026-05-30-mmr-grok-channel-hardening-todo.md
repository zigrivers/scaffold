# TO-DO: Harden the MMR Grok channel against context bleed & filesystem wandering

**Created:** 2026-05-30
**Status:** Open — not started (separate workstream)
**Type:** Bug / reliability hardening
**Component:** `packages/mmr` (grok channel) + CLAUDE.md review docs
**Severity:** P1 — produces silently wrong review output (a review can pass/fail
on findings from an unrelated repo)
**Owner:** _unassigned_

> This is a standalone workstream, intentionally **not** folded into the guides
> coverage-expansion plan (`docs/superpowers/specs/2026-05-30-guides-coverage-expansion-plan.md`).
> It was discovered while multi-model-reviewing that plan.
>
> **Authoritative design:** `docs/superpowers/specs/2026-05-30-mmr-grok-channel-hardening-design.md`
> expands and supersedes the fix sketch below (it adds the host-config vector —
> skills/MCP/hooks — and the verified isolated-`HOME` neutralization mechanism).
> Where the two differ, the design doc wins.

## Summary

A direct `grok --prompt-file <file>` review can **ignore the supplied prompt**,
invoke its own agentic `read_file` tools, and latch onto a **prior session's
context via cross-session memory** — producing an on-its-face-confident review of
the *wrong target*. Because MMR's native grok channel invokes grok with the
**same unconstrained flags**, the MMR grok channel is exposed to the identical
failure; it is non-deterministic and will resurface unpredictably in real
reviews.

## How it was observed

- **R1 (2026-05-30):** A manual `grok --prompt-file /tmp/grok-plan-review.txt
  --output-format json` review of the guides plan instead reviewed
  `docs/superpowers/plans/2026-05-26-missing-product-surfaces-plan.md` **from a
  different repo (`nibble`/trading-engine)** and hallucinated that repo's findings
  (G-001…G-008). The grok output even contained `tool_error` lines from its own
  `read_file` attempts on nonexistent paths, and its `thought` trace shows it
  scanning `~/Developer` and settling on `/Users/kenallred/Developer/nibble`.
- **R2 (2026-05-30):** The MMR grok channel (mmr 1.4.0) ran with the *same flags*
  and returned correct, on-topic findings. It worked **by luck**, not by
  construction — the stale context simply didn't dominate that run.

## Root cause

`grok --help` exposes the relevant levers; none are currently used:

- **`--no-memory`** — "Disable cross-session memory for this session." The R1
  wander pulled a *prior session's* nibble-repo context. **This is the primary
  culprit.**
- Agentic built-in tools (`read_file`, web search) are enabled by default,
  letting grok roam the filesystem instead of answering from the prompt.
  Constrainable via **`--disallowed-tools <TOOLS>`**, **`--tools <TOOLS>`**
  (allowlist), **`--sandbox <PROFILE>`** (read-only FS/network), and
  **`--disable-web-search`**.
- **`--no-subagents`**, **`--no-plan`** further reduce nondeterministic agentic
  behavior.

## Exposure (why this is a product bug, not just a manual-usage caveat)

MMR's grok channel uses the same bare invocation as the manual fallback:

```ts
// packages/mmr/src/config/defaults.ts:110-112
command: 'grok',
prompt_delivery: 'prompt-file',
flags: ['--prompt-file', '{{prompt_file}}', '--output-format', 'json'],
```

No `--no-memory`, no tool/sandbox constraints. So the official `mmr review`
grok channel can wander exactly as the R1 manual pass did. A code review must
answer without cross-session memory, host/project instructions (Claude.md,
skills, MCP, hooks), or working-tree reads. (Per the design doc's D1, cited
**web** context is allowed by default — the hardening targets memory, host
config, and filesystem reads, not the web; "strictly from the prompt/diff"
applies only to the documented closed-book override.)

The CLAUDE.md manual fallback has the same gap:

```bash
# CLAUDE.md:267
grok --prompt-file PROMPT_FILE --output-format json 2>/dev/null
```

## Proposed fix

1. **Harden the grok channel flags** in `packages/mmr/src/config/defaults.ts`
   (the `grok` channel `flags` array). At minimum add `--no-memory`; strongly
   prefer also constraining tools so a review cannot read the working tree:
   - `--no-memory` (required)
   - tool lockdown — e.g. `--disallowed-tools read_file,...` or a read-only
     `--sandbox` profile (decide which grok mechanism is the cleanest no-FS posture)
   - consider `--disable-web-search`, `--no-subagents`, `--no-plan` for
     determinism
2. **Mirror the same flags** in the CLAUDE.md **review-dispatch** example only —
   the single grok review line at `CLAUDE.md:267`. The auth/installation probes
   (`grok models`, `command -v grok` at L255/L260) and the recovery line
   (`! grok login` at L213) are not review dispatches and need no flag changes.
   (Note: there is **no** review command at `CLAUDE.md:56` — that line is the
   `make test` table row; the earlier "~L56" claim was wrong.)
   - **Compensator:** `flags`/`env` (incl. isolated `HOME`) inherit
     automatically via `resolveCompensatorDispatch`, but `cwd` does **not** —
     `CompensatorDispatch` has no `cwd` field, so grok-as-compensator would
     still run in the repo cwd and re-load `projectInstructions`. The design
     doc's decision is to add `cwd` to `CompensatorDispatch` and forward it, so
     `packages/mmr/src/core/compensator.ts` **does** need a small edit (plus an
     inheritance regression test). See the design doc's Compensator section.
3. **Regression test:** assert the resolved grok channel command includes
   `--no-memory` (extend `packages/mmr/tests/config/defaults.test.ts`); ideally a
   test that a grok review run does not read project files (sandbox/tool assertion).
4. **Verify upstream flag semantics** before shipping — confirm `--no-memory`
   and the chosen tool-lockdown flag behave as intended on the installed
   `grok-build` model (the model rejects some options, e.g. `--effort` →
   HTTP 400; see memory `grok-not-in-brew-mmr`).

## Acceptance criteria

> **Note:** the design doc holds the authoritative, expanded acceptance
> criteria (host-config neutralization, fail-closed fallback, compensator cwd,
> deterministic verification gate). The list below is the original sketch, kept
> for history; defer to the design doc where they differ.

- [ ] MMR grok channel invokes grok with `--no-memory` and a no-FS-read posture.
- [ ] A grok review answers without cross-session memory, host/project
      instructions/skills/MCP/hooks, or working-tree reads (web context allowed
      by default) — verified by the design doc's deterministic gate, with the
      nondeterministic "stale context" repro kept as best-effort.
- [ ] CLAUDE.md manual grok command (L267) updated to match.
- [ ] Regression test covering the channel flags + compensator inheritance.
- [ ] Note the fix in `tasks/lessons.md` and update memory `grok-not-in-brew-mmr`.

## References

- Plan that surfaced this: `docs/superpowers/specs/2026-05-30-guides-coverage-expansion-plan.md` (Review log R1/R2)
- Channel def: `packages/mmr/src/config/defaults.ts:100-129`
- Compensator: `packages/mmr/src/core/compensator.ts`
- Channel defaults test: `packages/mmr/tests/config/defaults.test.ts`
- CLAUDE.md manual fallback: `CLAUDE.md:267` (+ auth recovery ~`CLAUDE.md:213`)
- Memory: `grok-not-in-brew-mmr` (agentic-wander caveat)
