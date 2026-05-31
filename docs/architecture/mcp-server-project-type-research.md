# Research: Adding "MCP Server" as a Project Type

**Status:** Research only — no implementation yet.
**Date:** 2026-05-30
**Branch:** `mcp-server-workspace` (worktree off `main` @ `ce4c2da1`)
**Method:** Four parallel Explore agents mapped the project-type model, the
prompt-gating/assembly path, knowledge/methodology coverage, and the precedent
commit. Line numbers below were accurate at `ce4c2da1`; treat them as
"approximately here" rather than absolute, since adding the enum value shifts
later lines.

**Verified at `ce4c2da1`** (the local `main` tip at branch time — a local,
not-yet-pushed commit; commands re-run directly against the worktree, not just
agent reports):
- `ProjectTypeSchema` enum = the 12 values in §2 (verbatim from
  `src/config/schema.ts`).
- Knowledge base = **19 categories**. Entry count is approximate and drifts as
  entries land: `README.md:32` states **267**; `find content/knowledge -type f
  -name '*.md' | wc -l` → 268 (that includes 2 category `README.md` files in
  `data-science/` and `ml/`, so ~266 actual entry files). The exact figure is
  immaterial to this doc's argument (zero entries cover *building* MCP servers);
  treat README's 267 as the canonical number and re-run the count before the
  content PR.
- Precedent commit `506a01f4` ("feat: add research project type (#261)")
  exists and its diff touches the exact files in §4 —
  `src/config/schema.ts`, `src/wizard/copy/{core,index,research,types}.ts`,
  `src/cli/init-flag-families.ts`, `src/project/detectors/{index,types,disambiguate,research}.ts`,
  `content/methodology/research-*.yml`, plus tests. The §4 checklist is
  precedent-confirmed, not merely inferred.
- The hard gate test `tests/packaging/project-type-overlay-alignment.test.ts`
  exists.
- Net-new step registration mechanism confirmed — see §4a.

---

## 1. TL;DR / Recommendation

Adding an MCP Server project type is a **well-trodden, content-heavy but
mechanically simple** change. The codebase already supports 12 project types
through a single source-of-truth enum plus a fan-out of per-type registration
points, and the **`research` type (commit `506a01f4`, v3.15.0) is the exact
template to copy** — it is the **only** type with the full rich shape we need
(schema + validator + detector + wizard + a dedicated CLI **flag family** +
wizard flags + overlay + a dedicated knowledge directory). Note: `data-science`
(v3.23.0) and `web3` (v3.27.0) were added *after* research, so research is not
the newest type — but those two shipped a *thinner* shape (no `*_FLAGS` family in
`src/cli/init-flag-families.ts`, no entry in `src/wizard/flags.ts`; verified —
only `RESEARCH_FLAGS` exists). Since our chosen config is rich and flag-backed,
`research` remains the precise precedent.

**Approach (decided — see §7):** Follow the `research` precedent end-to-end.
Register the type with a **rich 6-field config**, author a
`content/knowledge/mcp-server/` directory, wire an `mcp-server-overlay.yml` that
injects that knowledge into existing steps and disables the UI steps
(design-system, ux-spec, review-ux; database-schema → `if-needed`), **and**
author one net-new MCP-specific meta-prompt — `mcp-tool-resource-contract` (a
tool/resource/prompt contract spec analogous to `api-contracts`). Future domains
and any further MCP-specific steps are deferred.

This is the **full v1 scope**, delivered across **two PRs** to keep reviews
tractable — **PR1** = type registration + a thin overlay (working, selectable
type, packaging gate green); **PR2** = the new step + knowledge directory + rich
overlay injection + docs. See §6 for the step-by-step split and the exact PR
boundary.

**Why this approach over alternatives:**
- *Thin registration first, depth second* keeps each PR reviewable — the
  existing 16-phase pipeline already covers vision → PRD → tech-stack →
  architecture → specs → quality, and MCP servers fit that spine, so PR1 ships a
  working type and the knowledge + single new step land additively in PR2 without
  blocking.
- *No new methodology preset* — presets (mvp/deep/custom) are orthogonal to type;
  the overlay layers on top of whichever preset the user picks. Every existing
  type works this way; MCP should too.
- *Dedicated knowledge category* (`content/knowledge/mcp-server/`) mirrors
  `research/`, `game/`, `web3/` and keeps the ~12 MCP entries cohesive and
  greppable, rather than scattering them across `core/`/`backend/`/`library/`.

---

## 2. How project type works today

There is **one source of truth** — the Zod enum in
`src/config/schema.ts` (~lines 18-22):

```typescript
export const ProjectTypeSchema = z.enum([
  'web-app', 'mobile-app', 'backend', 'cli', 'library', 'game',
  'data-pipeline', 'ml', 'browser-extension', 'research',
  'data-science', 'web3',
])
```

Everything downstream derives from `ProjectTypeSchema.options` (CLI `choices`,
wizard select list, overlay validation). But several places still need explicit
per-type registration because each type carries its own config schema, coupling
validator, detector, copy, flags, and overlay.

**Four layers:**
1. **Detection** — `src/project/detectors/*.ts`, one detector per type, run in
   parallel from `detectors/index.ts`, ranked by confidence, with interactive
   disambiguation (`disambiguate.ts` → `PROJECT_TYPE_PREFERENCE`).
2. **Config** — per-type Zod schema in `schema.ts` + a coupling validator in
   `src/config/validators/<type>.ts` registered in `validators/index.ts`. The
   validator enforces "config present ⇒ projectType matches" (and any
   cross-field rules). Stored in `.scaffold/config.yml`.
3. **CLI / Wizard** — a flag family in `src/cli/init-flag-families.ts`
   (`--<type>-*` flags, mixed-family rejection, `buildFlagOverrides`), wired into
   `init.ts` and `adopt.ts`; interactive questions in `src/wizard/questions.ts`;
   user-facing copy in `src/wizard/copy/`.
4. **Assembly** — `src/core/assembly/overlay-state-resolver.ts` looks for
   `content/methodology/<type>-overlay.yml`; if present, `applyOverlay` merges
   its step-enablement, knowledge, reads, and dependency overrides on top of the
   chosen preset.

### Key finding: prompts are NOT gated by frontmatter

CLAUDE.md's "optional prompts apply only to certain project types" is implemented
**entirely via overlays**, not via an `applies-to`/`project-type` frontmatter
field. The only frontmatter gate is `conditional: 'if-needed'` (skippable step),
defined in `src/types/frontmatter.ts` (line 117-118) — and it is **not**
type-aware.

A type tailors the pipeline by writing an overlay that flips
`stepOverrides.<step>.enabled` true/false and appends `knowledgeOverrides`.
Example precedent: `game-overlay.yml` disables `design-system`, `ux-spec`,
`review-ux` and enables ~24 game steps. So **MCP tailoring = author one overlay
YAML**, zero changes to prompt frontmatter or assembly code.

---

## 3. Knowledge & methodology coverage

- **19 knowledge categories, ~267 entries** (README:32; see header for the
  count nuance). **Zero** cover *building* MCP servers. The only MCP mentions
  are about *consuming* MCP
  (`core/ai-memory-management.md`, `core/task-tracking.md`,
  `pipeline/environment/ai-memory-setup.md`) — not authoring.
- Knowledge injection is **explicit per-step mapping** in the overlay's
  `knowledge-overrides`, resolved by name against the knowledge index
  (`src/core/assembly/knowledge-loader.ts`). Not keyword/auto. So new entries
  only appear if the overlay names them.
- **No new preset needed.** Presets (mvp/deep/custom) set depth + default step
  enablement; the type overlay layers on top. Confirmed in
  `overlay-state-resolver.ts` (preset steps spread first, overlay merged second).
- `content/tools/` and `content/skills/` are **type-agnostic** — no changes
  needed there.
- There is **no in-repo `mcp-builder` skill**; the Claude Code `mcp-builder`
  skill is external. It is a good *content source* when authoring the knowledge
  entries (FastMCP vs TS SDK, tool/resource/prompt design) but is not wired into
  scaffold.

### Proposed knowledge entries (`content/knowledge/mcp-server/`)

Roughly 10-14 entries; start with the core set and expand:

| Entry | Covers |
|-------|--------|
| `mcp-protocol-fundamentals` | client/server model, message lifecycle, capabilities |
| `mcp-tool-design` | tool definitions, input schemas, naming, idempotency |
| `mcp-resource-design` | resources, URIs, pagination, discovery |
| `mcp-prompt-primitives` | prompts as MCP primitives |
| `mcp-transport-patterns` | the two spec transports — stdio vs Streamable HTTP; legacy HTTP+SSE migration; when to use each |
| `mcp-sdk-selection` | FastMCP (Python) vs TypeScript SDK trade-offs |
| `mcp-authentication` | API keys, OAuth, capability gating |
| `mcp-error-handling` | protocol error codes, partial failures, recovery |
| `mcp-testing-strategies` | client mocks, protocol-compliance/integration tests |
| `mcp-deployment-patterns` | stdio process, container, serverless, hosted |
| `mcp-observability` | logging, request tracing, debugging |
| `mcp-versioning` | protocol/capability versioning & client compat |

Adding this directory raises the knowledge-base category count from **19 → 20**;
refresh the knowledge-base summary in `README.md` (and any hard-coded
count/category references) when the content PR lands.

MCP moves fast — mark protocol/transport/SDK entries `volatility: fast-moving`
and cite the spec + SDK docs (Context7 is available for current SDK docs).

---

## 4. Precedent file-touch list (from `research`, commit `506a01f4`)

This is the authoritative checklist **for the base type registration** (what
`research` itself touched). The chosen v1 scope (§7.4) adds one net-new pipeline
step on top of this — **do not stop at §4; the additional touchpoints
(`content/pipeline/specification/mcp-tool-resource-contract.md`, `deep.yml` +
`mvp.yml` + `custom-defaults.yml` step declarations, the overlay enablement, the E2E + bats coverage)
are listed in §4a.** **TDD note:** for every code change below, the precedent
shipped tests alongside — write those first (Section 6).

### Code (register the type)
1. `src/config/schema.ts` — add `'mcp-server'` to `ProjectTypeSchema`; add
   `McpServerConfigSchema` (`.strict()`); add `mcpServerConfig?` to the
   project/service schema. **Do not** export `mcpServerRealDomains` in v1 — there
   are no domains (§7.2); that export (and the `domain-overlay-alignment` test
   row in §5) only applies if domains are added later.
2. `src/types/config.ts` — export the `McpServerConfig` type; extend the
   `ProjectConfig`/`DetectedConfig` unions.
3. `src/config/validators/mcp-server.ts` *(new)* — coupling validator.
4. `src/config/validators/index.ts` — register in `ALL_COUPLING_VALIDATORS`.
5. `src/project/detectors/mcp-server.ts` *(new)* — `detectMcpServer`.
6. `src/project/detectors/index.ts` — add to `ALL_DETECTORS`.
7. `src/project/detectors/types.ts` — `McpServerMatch` + add to `DetectionMatch`.
8. `src/project/detectors/disambiguate.ts` — add to `PROJECT_TYPE_PREFERENCE`.
9. `src/wizard/copy/mcp-server.ts` *(new)* + register in `copy/index.ts` &
   `copy/types.ts`.
10. `src/wizard/copy/core.ts` — add `mcp-server` label + short description to the
    project-type option list.
11. `src/wizard/questions.ts` — add an inline `if (projectType === 'mcp-server')
    { ... }` collection block (the precedent uses an inline if-block, **not** a
    named getter — model on the `if (projectType === 'research')` block at
    `questions.ts:486`), and add the `mcpServerConfig` field to the
    **`WizardAnswers`** interface (defined in `questions.ts`).
11b. `src/wizard/wizard.ts` — **this is where `WizardOptions` lives** (interface
    at `wizard.ts:43`, *not* in `questions.ts`). Add `mcpServerFlags` to
    `WizardOptions`, re-export/import `McpServerFlags`, destructure & pass it in
    `collectWizardAnswers`, and spread `mcpServerConfig` into the assembled
    config object. Omitting this means the flags never reach the wizard.
12. `src/wizard/flags.ts` — `McpServerFlags` type.
13. `src/cli/init-flag-families.ts` — `MCP_SERVER_FLAGS`, family detection,
    mixed-family validation, `buildFlagOverrides` branch.
14. `src/cli/commands/init.ts` — option definitions + parsing; add to
    `CONFIG_SETTING_FLAGS`.
15. `src/cli/commands/adopt.ts` — mirror init's options/parsing (CLI wrapper).
15b. `src/project/adopt.ts` — **CRITICAL, exhaustive over `ProjectType`**: add
    `'mcp-server': 'mcpServerConfig'` to the `TYPE_KEY` map (`adopt.ts:26`) and a
    `case 'mcp-server':` to the `schemaForType` switch (`adopt.ts:45`, whose
    `default` is `assertNever`), plus the `McpServerConfigSchema` /
    `McpServerConfig` imports. Both structures are exhaustive — a missing arm is
    a compile-time (`assertNever`) / runtime failure in `scaffold adopt`. This is
    distinct from the CLI wrapper in item 15.

### Content
16. `content/methodology/mcp-server-overlay.yml` *(new, REQUIRED — see gate
    below)* — **PR1 (thin) version:** disable the UI steps
    `design-system`/`ux-spec`/`review-ux`; set `database-schema` to `if-needed`
    (**not** disabled — see §7.3: overlays can't branch on the `stateful` config
    value, so the step stays skippable rather than hard-off). This is all that's
    needed to satisfy the packaging gate. The knowledge injection and new-step
    enablement (item 16b) come in PR2.
16b. `mcp-server-overlay.yml` *(PR2 expansion)* — add `knowledgeOverrides` that
    inject the `content/knowledge/mcp-server/` entries into `tech-stack`,
    `system-architecture`, `api-contracts`, `security`, testing, and operations;
    enable `mcp-tool-resource-contract` (item 18b); and add `readsOverrides` to
    surface `stateful` to downstream steps. See §4a.
17. `content/knowledge/mcp-server/*.md` *(new dir, ~10-14 files)*.
18. *(only if domains)* `content/methodology/mcp-server-<domain>.yml` sub-overlays.
18b. `content/pipeline/specification/mcp-tool-resource-contract.md` *(new step —
    see §4a for the full template + Mode Detection/Update Mode blocks)*.
18c. `content/methodology/{deep,mvp,custom-defaults}.yml` — add
    `mcp-tool-resource-contract: { enabled: false }` to **all three** presets
    (with a comment tying it to the mcp-server overlay) so the auto-discovered
    step doesn't trigger a `presetMissingStep` warning. See §4a.

### Docs
19. `README.md` — `--project-type` enum list, flags section, auto-type-set list,
    overlay table, `adopt` detection table, knowledge count/category.
20. `CHANGELOG.md` — feature entry.

### 4a. Extra work from the "+1 new step" decision

> **Verification note:** every `:NN` line citation and the touch-list below were
> verified only at `ce4c2da1` on the author's worktree. Line numbers drift when
> code lands above them — treat `:NN` as hints, and re-run `grep -n` /
> `git show <sha> --name-only` / the packaging tests before coding.

Authoring a net-new document-creating pipeline prompt adds these touchpoints on
top of §4:

- `content/pipeline/specification/mcp-tool-resource-contract.md` *(new)* —
  follow the document-creating-prompt template: `# ... (Prompt)` heading,
  frontmatter (`phase`, `order`, `dependencies`, `outputs`, `knowledgeBase`,
  `reads`, `conditional`), and the **Mode Detection** + **Update Mode
  Specifics** blocks positioned after the opening paragraph (CLAUDE.md editing
  rule). Model it on `specification/api-contracts.md`.
- **Register the new step so the pipeline knows it exists.** Mechanism confirmed
  in `src/core/assembly/preset-loader.ts`: steps are **auto-discovered** from
  the meta-prompt files (`knownStepNames`, `loadPreset` param). A preset entry
  for an *unknown* step is a hard **error** (`presetInvalidStep`,
  preset-loader.ts:102); a known step *not listed* in a preset is only a
  **warning** (`presetMissingStep`, preset-loader.ts:142). So the new
  `mcp-tool-resource-contract` file is auto-discovered the moment it lands, but
  to keep presets warning-clean and make default enablement explicit, **declare
  it `enabled: false` in all three presets — `content/methodology/deep.yml`,
  `mvp.yml`, and `custom-defaults.yml`** (those three are the methodology
  presets; the other `content/methodology/*.yml` files — `*-overlay.yml`,
  `research-*.yml`, `backend-fintech.yml` — are project-type / domain overlays,
  not presets). Then flip it to `enabled: true` in `mcp-server-overlay.yml`. (Do
  **not** add it to a preset as enabled-everywhere — it's MCP-only. Omitting any
  one preset yields a `presetMissingStep` warning for that preset.)
- `mcp-server-overlay.yml` enables `mcp-tool-resource-contract` and may add it to
  `readsOverrides` (so downstream steps reference its output) and
  `dependencyOverrides`.
- Tests: extend `src/e2e/project-type-overlays.test.ts` to assert the step is
  enabled for `mcp-server` and disabled by default elsewhere; add a
  `make validate` frontmatter check pass (generic, but the new file must
  conform).

---

## 5. Validation & test gates (what will fail until satisfied)

| Gate | File | Needs |
|------|------|-------|
| Type allowed | `src/config/schema.ts` | enum value added |
| Config shape | `src/config/schema.ts` | `McpServerConfigSchema` |
| Config↔type coupling | `src/config/validators/` | new validator registered |
| **Overlay must exist** | `tests/packaging/project-type-overlay-alignment.test.ts` | every enum value needs a `<type>-overlay.yml`, or this test **fails immediately** |
| Domain overlays | `tests/packaging/domain-overlay-alignment.test.ts` | only if `mcpServerRealDomains` exported |
| `make validate` | `scripts/validate-frontmatter.sh` | generic; no change needed |

The overlay-alignment packaging test is the one that turns "add an enum value"
into "you must also ship an overlay." That's a feature — it prevents a
half-registered type.

---

## 6. TDD-first implementation outline (ordered)

Write the test in each step **before** the code. Run `make check-all` (bash +
TS/vitest) throughout.

1. **Schema test → schema.** `src/config/schema.test.ts`: assert
   `'mcp-server' ∈ ProjectTypeSchema.options`; assert `McpServerConfigSchema`
   accepts a valid config and rejects unknown keys (`.strict()`). **Do not put
   the coupling assertion here** — per §2/§4/§5 the "config present ⇒ projectType
   matches" rule and any cross-field rules are owned by the per-type coupling
   validator (invoked from the schema `superRefine`), not the bare config
   schema. Then make it pass in `schema.ts`.
2. **Validator test → validator.** `src/config/validators/mcp-server.test.ts`:
   assert that `mcpServerConfig` without `projectType:'mcp-server'` is rejected,
   plus any cross-field rule (e.g. `auth:'oauth'` requires non-stdio /
   `deployment:'hosted'`). Then `mcp-server.ts` + register in
   `validators/index.ts`.
3. **Detector test → detector.** `src/project/detectors/mcp-server.test.ts`
   covering high/medium/low/null tiers on realistic signals (e.g.
   `@modelcontextprotocol/sdk` dep, `mcp`/`fastmcp` in deps, a server entry that
   speaks MCP over stdio). Then `mcp-server.ts` + registry/types/preference.
4. **Flag-family test → flags.** `src/cli/init-flag-families.test.ts`: family
   consistency, mixed-family rejection, `buildFlagOverrides` mapping,
   type-preservation. Then the flag constants + init wiring + the
   `src/project/adopt.ts` `TYPE_KEY`/`schemaForType` arms (§4 items 13–15b).
5. **Wizard test → questions/wizard/copy.** `src/wizard/questions.test.ts`:
   auto-mode defaults + required-field behavior. Then the inline `if (projectType
   === 'mcp-server')` collection block (modeled on the research if-block at
   `questions.ts:486`, not a named getter), the `WizardAnswers` field in
   `questions.ts`, the `WizardOptions`/`collectWizardAnswers` wiring in
   `src/wizard/wizard.ts` (§4 item 11b), and copy.

   --- **PR1 boundary: a working, selectable type** (steps 1–6) ---
6. **Thin overlay → packaging gate.** Author `mcp-server-overlay.yml` that only
   disables the UI steps (`design-system`/`ux-spec`/`review-ux`) and sets
   `database-schema` to `if-needed`. This alone satisfies
   `tests/packaging/project-type-overlay-alignment.test.ts` (which fails the
   moment the enum value exists without an overlay). No new step or knowledge
   injection yet. PR1 ships here, green.

   --- **PR2: MCP-specific depth** (steps 7–9) ---
7. **New step.** Author `content/pipeline/specification/mcp-tool-resource-contract.md`
   (template + Mode Detection/Update Mode blocks; model on `api-contracts.md`),
   register it per §4a: declare `enabled: false` in all three presets
   (`deep.yml` + `mvp.yml` + `custom-defaults.yml`) **then** flip it to
   `enabled: true` in the overlay (so the assertion has something to assert).
   Add the E2E assertion that it's enabled for `mcp-server` and off elsewhere.
8. **Knowledge + rich overlay.** Author `content/knowledge/mcp-server/` entries
   and expand `mcp-server-overlay.yml` to inject that knowledge into
   `tech-stack`/`system-architecture`/`api-contracts`/`security`/testing/
   operations and surface `stateful` via `reads`. Add E2E knowledge-injection
   coverage in `src/e2e/project-type-overlays.test.ts` and a
   `tests/evals/mcp-server-overlay-content.bats` keyword check.
9. **Docs.** README + CHANGELOG. Then full `make check-all`, review channels, PR.

**Required pre-commit gates for PR1** (the registration PR): adding
`'mcp-server'` to the enum makes `tests/packaging/project-type-overlay-alignment.test.ts`
fail until `content/methodology/mcp-server-overlay.yml` exists — so the overlay
must ship in the same PR. PR1 must pass that packaging test (plus the
`domain-overlay-alignment` test only if domains are added — they are not in v1)
and `make validate` (frontmatter) before review.

This maps directly to the PR split: **PR1** = steps 1–6 (register the type — rich
config + validator + detector + CLI/wizard incl. `project/adopt.ts` — plus a thin
overlay that disables UI steps; ships a working, selectable type with the
packaging test green). **PR2** = steps 7–9 (the `mcp-tool-resource-contract`
step + preset declarations, the `content/knowledge/mcp-server/` directory, rich
overlay knowledge injection, and docs).

---

## 7. Resolved decisions (locked 2026-05-30)

1. **Config fields — RICH (6 fields).** `McpServerConfig`:
   ```typescript
   McpServerConfigSchema = z.object({
     language:   z.enum(['typescript', 'python']),
     transport:  z.enum(['stdio', 'streamable-http', 'sse']),
     primitives: z.array(z.enum(['tools', 'resources', 'prompts'])).min(1).default(['tools']),
     auth:       z.enum(['none', 'oauth', 'apikey']),
     deployment: z.enum(['local', 'hosted']),
     stateful:   z.boolean(),
   }).strict()
   ```
   Notes on transport terminology (the current MCP spec defines exactly two
   standard transports — **stdio** and **Streamable HTTP**): `streamable-http`
   is the correct modern term (single-endpoint HTTP that uses SSE *internally*
   for response streaming); it replaced the older standalone "HTTP+SSE"
   transport. We keep `sse` in the enum (per the chosen rich config) **only** as
   a legacy/back-compat value — the wizard help text and the
   `mcp-transport-patterns` knowledge entry must label it
   "sse (legacy HTTP+SSE, deprecated — prefer streamable-http)". Do **not**
   conflate this with the codebase's `web-app` realtime `sse` option, which is a
   different concept (server-sent events for a web frontend, not an MCP
   transport). **Source (verified 2026-05-30):** the official MCP spec defines
   exactly two standard transports — stdio and Streamable HTTP — and explicitly
   states Streamable HTTP "replaces the HTTP+SSE transport from protocol version
   2024-11-05," which it labels "deprecated" (normative spec:
   <https://modelcontextprotocol.io/specification/2025-06-18/basic/transports>;
   fetched and confirmed 2026-05-30). A reviewer model trained before the
   2025-03-26 spec revision may incorrectly call `sse` the current standard — it
   is not. `deployment` largely correlates
   with `transport` (stdio⇒local, http⇒hosted); the wizard should **default**
   `deployment` from `transport` but allow override. Consider a coupling
   cross-field check (e.g. `auth: oauth` only meaningful when
   `deployment: hosted` / non-stdio) in the validator.
2. **Domains — NONE for v1.** No `mcpServerRealDomains`, no sub-overlays, no
   domain-overlay-alignment test entry. Revisit later (`data-access`,
   `dev-tools`, `saas-integration`).
3. **Step gating — `database-schema = if-needed`.** Hard-disable
   `design-system`, `ux-spec`, `review-ux` (no UI). Keep `database-schema` as
   `if-needed` so stateful servers can use it. **Integration with the `stateful`
   config field:** overlays apply *static* step overrides and are **not**
   parameterized by config-field values, so the overlay cannot literally branch
   on `stateful`. Honor it by (a) keeping `database-schema` `if-needed` in the
   overlay and (b) surfacing `stateful` in the assembled prompt context (via the
   MCP knowledge / reads) so the running agent decides at that step. True
   config-value-driven step enablement is a larger, separate enhancement — out
   of scope for v1.
4. **Scope — OVERLAY + 1 NEW STEP.** Ship the knowledge-only overlay **plus** one
   new MCP-specific meta-prompt: `mcp-tool-resource-contract` (a tool/resource/
   prompt contract spec, analogous to `api-contracts`, in the specification
   phase). See §4a for the extra work this adds.
5. **Knowledge sourcing — cite live spec + SDK docs (Context7); mark
   protocol/transport/SDK entries `volatility: fast-moving`.** Confirmed.
6. **Detection — CONSERVATIVE.** `@modelcontextprotocol/sdk` (or `mcp`/`fastmcp`)
   as a dependency alone ⇒ **low/medium** (could be a consumer). Dependency
   **plus** an entrypoint that registers tools/resources (TS) or uses
   `FastMCP(`/`@mcp.tool` (Python) ⇒ **high**.

---

## Appendix: source map (files cited, at `ce4c2da1`)

- Enum / config: `src/config/schema.ts`, `src/types/config.ts`
- Validators: `src/config/validators/{index,research,web-app,...}.ts`
- Detection: `src/project/detectors/{index,types,disambiguate,research}.ts`
- CLI: `src/cli/init-flag-families.ts`, `src/cli/commands/{init,adopt}.ts`
- Wizard: `src/wizard/{questions,flags}.ts`, `src/wizard/copy/*`
- Assembly: `src/core/assembly/{overlay-state-resolver,overlay-resolver,overlay-loader,knowledge-loader,preset-loader}.ts`
- Frontmatter: `src/types/frontmatter.ts`
- Overlays: `content/methodology/*-overlay.yml`
- Packaging gates: `tests/packaging/{project-type,domain}-overlay-alignment.test.ts`
- Precedent: commit `506a01f4` ("feat: add research project type")
