# Game Development Content — Domain Quality Audit

You are performing a deep domain review of scaffold's game development
content. The objective: verify that every knowledge entry and pipeline
step contains accurate, actionable, engine-agnostic guidance that an AI
agent can use to produce professional-quality game development artifacts
across genres, platforms, and studio scales.

This audit covers **53 content files**:
- 24 game knowledge entries (`content/knowledge/game/*.md`)
- 5 game review knowledge entries (`content/knowledge/review/review-game-design.md`,
  `review-art-bible.md`, `review-game-economy.md`, `review-netcode.md`,
  `review-platform-cert.md`)
- 24 game pipeline steps (the 24 steps enabled in
  `content/methodology/game-overlay.yml` under `step-overrides`; resolve
  each slug to `content/pipeline/**/{slug}.md`)

This audit is organized into 11 independent modules. Execute each one
completely. For each, read the relevant files in full, assess domain
quality, and log findings with specific rewrite proposals.

---

## Known Good Patterns (Read Before Auditing)

These are by design. Do NOT flag them as findings:

1. **Engine-agnostic framing is intentional**: Pipeline steps and knowledge
   entries deliberately avoid mandating a single engine. When guidance says
   "configure your navigation mesh" without specifying Unity NavMesh vs
   Unreal NavMesh vs Godot NavigationServer, that is correct — the overlay
   system handles engine detection separately via `scaffold adopt`.

2. **Engine-specific code examples are illustrative, not prescriptive**:
   Knowledge entries include TypeScript, C#, GDScript, Python, and HLSL
   examples. These demonstrate patterns, not required implementations. An
   entry with a Unity C# example is not "Unity-biased" unless the
   surrounding prose assumes Unity's architecture without noting it.

3. **Conditional steps are gated by game config traits**: Steps marked
   `conditional: "if-needed"` in `game-overlay.yml` activate based on
   `gameConfig` fields (e.g., `multiplayerMode !== 'none'` enables
   `netcode-spec`). Do not flag conditional steps as "missing for certain
   genres" unless the activation criteria are actually wrong.

4. **MVP depth is intentionally brief**: At MVP/depth-1, steps produce
   minimal viable artifacts for prototyping (1-3 pages). Do not flag MVP
   output as "insufficient" — flag it only if it omits something required
   to start prototyping.

5. **Knowledge entries use Summary + Deep Guidance structure**: The Summary
   section (~50-100 lines) is injected at lower depths; the full entry
   (including Deep Guidance) is injected at higher depths. Content in Deep
   Guidance is not "buried" — it is depth-gated by design.

6. **Review knowledge entries use a 7-pass format**: The 5 game review
   entries follow the scaffold review methodology pattern (7 sequential
   passes with a Finding Template), not the Summary + Deep Guidance
   pattern. This structural difference from game knowledge entries is
   intentional.

7. **The overlay appends knowledge, it does not replace**: When
   `game-overlay.yml` injects `game-networking` into `system-architecture`,
   it appends game networking knowledge alongside the existing architecture
   knowledge. The game entry does not need to duplicate general architecture
   guidance.

8. **Numbers that vary by genre/project are presented as ranges or
   defaults**: Entries like `game-performance-budgeting.md` give frame
   budgets as ranges (e.g., "60fps = 16.67ms, 30fps = 33.33ms") rather
   than single values. Range-based guidance is correct, not vague.

9. **Disabled dependencies are satisfied**: The pipeline engine considers
   a dependency satisfied if the target step is disabled (e.g., conditional
   steps that aren't needed for the current genre). Do not flag
   non-conditional steps as having "broken dependencies" because they
   depend on a conditional step like `netcode-spec`.

10. **`reads` is a passive data-flow hint**: It does not enforce execution
    ordering. A step reading from a later-phase artifact is valid context
    gathering, not a dependency cycle. Forward reads are intentional — the
    step still works without the later artifact and will incorporate it on
    update runs.

11. **Game steps supplement core steps**: Game pipeline steps run alongside
    core software engineering steps (CI/CD, version control, task
    management, project structure). Do not flag game steps for missing
    general software practices — those are handled by the core pipeline.

---

## Prior Audit Context

Read the most recent audit report under
`docs/archive/audits/game-content-audit-round-*.md` (pick the highest
round number) before starting. If no prior audit exists, this is Round 1 —
skip delta comparison and treat all findings as new.

For each finding you produce, check if it appeared in a prior round:
- **Fixed then reappearing** — flag as a regression
- **Filtered as known good pattern** — do not re-report
- **Deferred** — report with updated priority and note it carried forward

Focus audit effort on **new findings** not present in prior rounds.

---

## Finding Categories

Each finding must carry exactly one category. If a finding spans multiple
categories, assign the root-cause category and note the secondary
dimension in the Impact field.

- **INACCURATE**: Factually wrong — incorrect terminology, wrong numbers,
  incorrect technical claims that would produce broken implementations.
  Use when the claim was never correct.
- **INCOMPLETE**: Missing critical content — a topic that must be covered
  for the entry to fulfill its purpose, but is absent entirely. Use when
  required coverage is absent, not when it exists but lacks depth.
- **SHALLOW**: Exists but not actionable — vague advice ("consider
  performance"), missing concrete thresholds, missing decision frameworks,
  guidance that an AI agent cannot act on without external research. Use
  when the topic is present but lacks thresholds, examples, decision
  rules, or implementation detail.
- **MISMATCHED**: Content does not match its integration point — knowledge
  injected into the wrong step, review criteria that don't cover what the
  creation step produces, overlay wiring errors. Use only when the content
  is substantively fine but attached to the wrong step, review pass, or
  overlay hook.
- **OUTDATED**: References superseded practices, deprecated APIs, changed
  pricing models, or regulatory frameworks that have materially changed
  since the content was written. Use only when the content was once
  acceptable but is no longer current.

---

## Module 1: Domain Accuracy & Completeness

**Question**: Is the game development advice factually correct, and does
each file cover the critical concepts a senior game developer would expect?

Read ALL 53 game content files completely. For each file:

1. **Factual accuracy**: Are technical claims correct? Check: terminology
   usage, numeric values (frame budgets, memory limits, network tick rates),
   algorithm descriptions, API references, platform requirements. If a
   claim is disputed in the industry, note the competing view.

2. **Critical concept coverage**: For the file's stated topic, are there
   industry-standard concepts that a senior game dev would expect but that
   are missing? Compare against authoritative references (GDC talks,
   engine documentation, published postmortems). List specific missing
   concepts, not vague "could be more complete" observations.

3. **Terminology consistency**: Are game dev terms used correctly and
   consistently across files? (e.g., "netcode" vs "networking," "tick
   rate" vs "simulation rate," "LOD" usage, "ECS" definition). Flag
   inconsistencies between files.

4. **Anti-pattern accuracy**: Many files include anti-pattern sections.
   Are the described anti-patterns real failure modes that practitioners
   encounter? Are any listed anti-patterns actually acceptable practices
   in certain contexts?

**Red flag patterns:**
- A number cited without source that contradicts common industry knowledge
- A platform requirement stated as fact that changed in the last 2 years
- A technique described as "always do X" when X only applies to specific
  engine architectures
- Missing mention of a critical failure mode that is well-documented in
  postmortems (e.g., save corruption, desync in multiplayer, memory leaks
  on console)

Deliverable: Per-file accuracy assessment with specific corrections.

---

## Module 2: Engine-Agnostic Balance

**Question**: Does each file work for Unity, Unreal, Godot, and custom
engines without assuming a specific engine's architecture?

Read ALL knowledge entries and pipeline steps. For each file:

1. **Engine assumption audit**: Identify every place where the prose
   assumes a specific engine's architecture, API naming, or workflow
   without noting the assumption. Distinguish between: (a) engine-specific
   code examples clearly labeled as such (Known Good Pattern #2), and
   (b) prose that implicitly assumes one engine's model as universal.

2. **Coverage balance**: If a file uses engine-specific examples, verify
   that the surrounding prose explains portability and does not treat one
   engine's APIs or object model as universal. Cross-engine examples are
   beneficial but not required in every file. Flag only when the prose
   assumes one engine is default or when the guidance cannot be adapted
   to Unity, Unreal, Godot, or custom engines.

3. **Architecture portability**: Does the described architecture actually
   work across engines? For example: ECS guidance must acknowledge that
   Unreal uses an Actor-Component model, not ECS. Navigation mesh guidance
   must work with Unity NavMesh, Unreal NavMesh, and Godot NavigationServer.

4. **Custom engine guidance**: For teams building custom engines, is there
   enough guidance to implement the described systems from scratch? Or does
   the content implicitly assume a commercial engine provides certain
   subsystems (physics, audio, rendering)?

**Red flag patterns:**
- Prose that says "configure the NavMeshAgent" without noting this is
  Unity-specific
- Architecture diagrams that only make sense in one engine's component model
- Performance budgets that assume a specific engine's rendering pipeline
- "Use the built-in X system" without acknowledging custom engine teams
  must build X

Deliverable: Engine-agnosticism scorecard per file (balanced / Unity-heavy /
Unreal-heavy / Godot-light / custom-neglected).

---

## Module 3: Genre Coverage & Applicability

**Question**: Does the content work across major game genres, or does it
implicitly assume 3D action games?

Read ALL pipeline steps and knowledge entries. Assess against these genre
families: FPS/TPS, RPG, strategy (RTS/TBS/4X), platformer (2D/3D),
puzzle, simulation (city-builder/management/life-sim), sports/racing,
fighting, roguelike, visual novel/adventure, MMO, mobile casual/hyper-casual.

1. **Genre assumption audit**: For each file, identify which genre families
   the guidance naturally fits and which it poorly serves. Flag files where
   a reader building a puzzle game or visual novel would find >50% of the
   guidance inapplicable without any note about when to skip or adapt.

2. **Conditional step activation**: Review the 12 conditional game steps
   in `game-overlay.yml`. For each, determine which project traits activate
   it (genre, multiplayerMode, persistence, supportedLocales,
   targetPlatforms, monetization, modding, live-ops scope) and whether
   the activation criteria are correct. Note: Known Good Pattern #3 means
   the step being conditional is by design — what you are assessing is
   whether the activation criteria correctly identify which projects need
   the step.

3. **Missing genre guidance**: Are there major genre-specific concerns
   that no file covers? Examples: turn-based game loop timing, 2D physics
   vs 3D physics considerations, procedural generation for roguelikes,
   card game rule engines, sports game simulation accuracy.

4. **Universal vs. specialized content**: For each knowledge entry, assess
   whether it tries to be universal (covering all genres) or specialized
   (targeting specific genres). Neither is wrong, but specialized content
   must state its scope, and universal content must actually work
   universally.

**Red flag patterns:**
- "Core loop" described only in terms of combat encounters
- Performance budgets that assume 3D rendering pipelines
- UI patterns that only cover HUD-heavy action game interfaces
- Testing strategies that assume real-time gameplay (not turn-based)
- Narrative design that assumes branching dialogue (not all games have
  dialogue)

Deliverable: Genre applicability matrix (files x genre families) with gap
analysis.

---

## Module 4: Knowledge Entry Depth & Actionability

**Question**: Can an AI agent produce professional-quality game development
artifacts using only the knowledge entries, without external research?

Read ALL 29 knowledge entries. For each, compare against the quality bar
set by high-quality non-game entries (e.g., `content/knowledge/core/testing-strategy.md`):

1. **Actionability test**: For each major topic in the entry, could an AI
   agent write a concrete implementation (code, document section, config
   file) using only the guidance provided? Or would it need to search the
   web for specifics? Flag every "consider X" or "think about Y" that lacks
   a concrete framework for how to consider or think about it.

2. **Threshold and evidence density**: Count concrete thresholds, formulas,
   ranges, benchmarks, checklists, or decision tables per entry. For
   **technical** entries (performance, networking, save systems, audio),
   fewer than 5 concrete numbers indicates likely shallowness. For
   **design** entries (narrative, accessibility, UI patterns), assess
   actionability via decision frameworks and criteria lists rather than
   numeric density alone.

3. **Decision framework completeness**: For entries that present choices
   (e.g., engine selection, VCS selection, audio middleware), is there a
   structured decision framework (weighted criteria, comparison matrix,
   decision tree)? Or just a prose list of options?

4. **Code pattern quality**: For entries with code examples, assess: are
   they complete enough to adapt (not just pseudocode fragments)? Do they
   demonstrate the right abstraction level? Would an AI agent produce
   correct code by following the pattern?

5. **Deep Guidance value**: For entries with Deep Guidance sections, does
   the Deep Guidance provide genuinely deeper content (implementation
   details, edge cases, advanced patterns), or is it just a longer version
   of the Summary?

**Red flag patterns:**
- "Consider performance implications" without stating what the implications
  are or what thresholds to target
- A comparison of tools/approaches with no decision matrix or selection
  criteria
- Code snippets shorter than 10 lines that claim to demonstrate a complex
  system
- Deep Guidance that repeats Summary content with more words instead of
  more depth

Deliverable: Actionability scorecard per entry (high/medium/low) with
specific enhancement proposals for low-scoring entries.

---

## Module 5: Pipeline Step Quality Criteria Rigor

**Question**: Can an AI agent objectively self-assess pass/fail on every
Quality Criterion in every game pipeline step?

Read ALL 24 game pipeline steps. For each step's Quality Criteria section:

1. **Measurability audit**: For each criterion, classify as:
   - **Objective**: Pass/fail determinable by structural check (e.g.,
     "every mechanic documented with inputs, rules, outputs, and feedback")
   - **Semi-objective**: Requires judgment but has clear indicators (e.g.,
     "core loop is closed with no dead ends")
   - **Subjective**: Cannot be self-assessed without external review (e.g.,
     "art style is cohesive") — these should be rare

2. **Coverage completeness**: Compare each step's Quality Criteria against
   its Expected Outputs. Is every aspect of the expected output covered by
   at least one criterion? Are there criteria that don't correspond to any
   expected output?

3. **Depth tag completeness**: Every criterion should be tagged `(mvp)` or
   `(deep)`. Flag untagged criteria. Verify that `(mvp)` criteria are
   genuinely sufficient for prototyping and `(deep)` criteria add
   meaningful production quality.

4. **Cross-step consistency**: Do similar step types (all review steps, all
   specification steps) use consistent quality criteria patterns? Do review
   steps use the standardized P0-P3 severity definitions? Is "traceability"
   language consistent across steps?

5. **Missing criteria**: For each step, identify quality dimensions that
   matter for the output but have no corresponding criterion. Common gaps:
   cross-artifact consistency, downstream consumability, platform awareness.

**Red flag patterns:**
- "Comprehensive coverage of X" — what constitutes comprehensive?
- "Well-structured document" — what structure specifically?
- "Appropriate level of detail" — appropriate for what audience/depth?
- A step producing a multi-section document but Quality Criteria only
  covering 2 of 6 sections
- Review steps without P0-P3 severity definitions

Deliverable: Quality Criteria rigor matrix (step x criteria count x
measurability classification) with specific rewrite proposals for
subjective criteria.

---

## Module 6: Cross-Step Coherence & Information Flow

**Question**: Do the 24 game steps form a coherent progression where each
step has what it needs and produces what downstream steps expect?

Read ALL 24 game pipeline steps AND `game-overlay.yml`.

1. **Concept traceability**: Identify game development concepts that are
   defined or introduced in one step and used in another. Verify that the
   using step either depends on or reads from the defining step. Flag
   concepts that appear in a step's body but whose source is not in its
   dependency or reads chain.

2. **Output-to-input chain**: For each step's Expected Outputs, trace
   forward: which downstream steps consume this artifact? Is the artifact
   referenced in downstream Inputs sections? Flag outputs that no
   downstream step references (unless the output is terminal/human-facing).

3. **Contradictory guidance**: Check for cases where two steps give
   conflicting advice. Examples: one step says "use integers for currency"
   while another's example code uses floats; one step recommends a specific
   file structure that conflicts with another step's assumed structure.

4. **Redundant content**: Identify content that appears in multiple
   pipeline steps or multiple knowledge entries. Some overlap is expected
   (reinforcement), but substantial duplication indicates one file should
   reference the other rather than repeating.

5. **Gap analysis**: Walk the step execution order (by phase and order
   number). At each step, verify that all information it needs has been
   produced by a prior step or is explicitly handled as an optional/forward
   read in the step body. Flag gaps only when a step requires information
   that is neither produced by a prior dependency nor handled as optional.

6. **Mode Detection & Update Safety**: For the 24 game steps, verify their
   Mode Detection and Update Mode Specifics sections are complete. For
   document-creating steps, confirm the 4 required fields exist (Detect,
   Preserve, Triggers, Conflict resolution) so agents know how to safely
   update game design documents without destroying manual edits.

**Red flag patterns:**
- Step B references "the performance budgets" but does not depend on or
  read from the `performance-budgets` step
- Two steps both define naming conventions with different rules
- A downstream step assumes a specific document section exists that the
  upstream step doesn't require in its Quality Criteria
- A conditional step depends on a non-conditional step's output, but the
  non-conditional step doesn't account for game-specific variants
- A document-creating step missing Update Mode Specifics or conflict
  resolution rules

Deliverable: Information flow diagram (or table) showing producer-consumer
relationships with gaps highlighted.

---

## Module 7: Methodology Scaling Fidelity

**Question**: Does each game step produce meaningfully different output at
each depth level, with smooth progression from prototype to production?

Read ALL 24 game pipeline step Methodology Scaling sections.

1. **Individual level differentiation**: Each of the 5 custom depth levels
   must describe distinct output. Flag levels that are copy-pasted with
   minor word changes (e.g., changing "brief" to "detailed" is not a
   meaningful differentiation).

2. **Monotonic progression**: Each successive depth level must produce
   strictly more comprehensive output. Flag non-monotonic cases: where
   depth N+1 drops something from depth N, or where depth N and N+1 are
   indistinguishable.

3. **MVP sufficiency**: At depth 1 and MVP, is the described output
   actually sufficient to start prototyping? A GDD at depth 1 that doesn't
   include a core loop description is insufficient. An art bible at depth 1
   that requires platform-specific compression formats is over-scoped.

4. **Deep completeness**: At depth 5 and deep, is the described output
   comprehensive enough for production shipping? Compare against what a
   senior game dev would expect in a shipping game's documentation.

5. **Jump size consistency**: Are the increments between adjacent depths
   roughly proportional? Flag cases where depth 1→2 is a minor increment
   but depth 4→5 adds 10 new deliverables, or vice versa.

**Red flag patterns:**
- "Depth 1-2: Basic coverage" (lumped levels, not individually described)
- Depth 3 that is nearly identical to depth 2 with one added bullet point
- Depth 5 that adds content irrelevant to production quality (academic
  analysis, historical context)
- MVP output that requires reading a dependency artifact that is disabled
  at MVP depth

Deliverable: Scaling fidelity matrix (step x depth-level distinctness
rating) with specific gap fills for weak levels.

---

## Module 8: Review Step Effectiveness

**Question**: Do the 5 game review knowledge entries catch the most common
and costly mistakes in their domain?

Read ALL 5 review entries AND their corresponding creation steps:
- `review-game-design.md` ↔ `game-design-document` step
- `review-art-bible.md` ↔ `art-bible` step
- `review-game-economy.md` ↔ `economy-design` step
- `review-netcode.md` ↔ `netcode-spec` step
- `review-platform-cert.md` ↔ `platform-cert-prep` step

1. **Coverage of creation step outputs**: For each creation step's Expected
   Outputs and Quality Criteria, verify the review entry has a pass that
   checks each element. Flag outputs or criteria that no review pass covers.

2. **Critical failure mode coverage**: For each domain, list the top 5 most
   common and costly failure modes (from postmortems, industry knowledge).
   Verify each is covered by a review pass. Examples: save corruption
   (reviewed?), economy hyperinflation (reviewed?), netcode desync under
   packet loss (reviewed?), cert failure from suspend/resume (reviewed?).

3. **Severity guidance**: Does each review entry define what constitutes a
   P0 vs P1 vs P2 vs P3 finding in its domain? Are the severity
   definitions specific enough to apply consistently? Or is severity
   classification left to reviewer judgment?

4. **Actionability of findings**: Does the Finding Template guide reviewers
   toward actionable findings? A finding of "art style is inconsistent" is
   not actionable; "character model X uses 4 material slots while the art
   bible specifies max 2 per character LOD0" is.

5. **Missing review coverage**: Are there game-specific creation steps
   that produce important artifacts but have NO corresponding review entry?
   (Current review entries cover 5 of 24 game steps.) Propose which
   additional steps most need review entries.

6. **Review step ↔ review knowledge alignment**: For each game review
   pipeline step (`review-gdd`, `review-game-ui`, `review-economy`,
   `review-netcode`), verify its `knowledge-base` frontmatter includes the
   corresponding review knowledge entry and that the step's instructions
   align with the knowledge entry's 7-pass structure.

**Red flag patterns:**
- A review pass that checks for document structure but not domain
  correctness
- Severity definitions that hinge on subjective judgment ("this feels like
  a P1")
- Missing review coverage for high-risk steps (save system, AI behavior,
  input controls)
- Review criteria that reference artifacts or sections not required by the
  creation step

Deliverable: Review effectiveness matrix with coverage gaps and proposed
new review entries.

---

## Module 9: Platform & Scale Awareness

**Question**: Does the content handle the spectrum from solo indie to AAA,
and from mobile to PC to console to VR?

Read ALL 53 game content files with these lenses:

1. **Scale sensitivity**: For each file, identify guidance that only works
   at one studio scale. A 40-page art bible process makes no sense for a
   solo dev; a "just wing it" approach to milestones makes no sense for a
   50-person team. Flag content that assumes a specific team size without
   noting it.

2. **Platform coverage**: For files that discuss platform-specific topics
   (performance, certification, input, VR), verify coverage across: PC,
   PlayStation, Xbox, Nintendo Switch, iOS, Android, Meta Quest, and
   emerging platforms (visionOS). Flag files that claim platform coverage
   but actually only address 2-3 platforms.

3. **Scaling guidance**: Does each file tell readers how to adjust scope
   based on their context? The best entries provide explicit guidance:
   "Solo dev: skip sections 3-5, focus on X. Mid-size team: full process.
   AAA: extend with Y." Flag files that present a single process without
   scale adaptation.

4. **Mobile-specific gaps**: Mobile games have unique constraints (thermal
   throttling, battery life, touch input, app store review, smaller memory).
   Are these covered where relevant, or does "platform" implicitly mean
   "PC/console"?

5. **VR/AR-specific gaps**: VR development has unique requirements (comfort
   ratings, motion sickness mitigation, spatial UI, hand tracking). Verify
   that `game-vr-ar-design.md` is sufficient and that other files reference
   VR considerations where relevant (performance budgets, input, testing).

**Red flag patterns:**
- Milestone durations given only for AAA scale with no indie adaptation
- Performance budgets that omit mobile or Switch constraints
- Testing strategies that assume dedicated QA teams
- Art pipeline guidance that assumes a multi-person art department
- Cert guidance that covers Sony/Microsoft but not Nintendo/Apple

Deliverable: Platform and scale coverage map with specific gaps per file.

---

## Module 10: Overlay Integration Quality

**Question**: Does `game-overlay.yml` correctly wire game knowledge into
pipeline steps, and are the integration points sensible?

Read `content/methodology/game-overlay.yml` AND every file it references.

1. **Knowledge injection audit**: For each `knowledge-overrides` entry,
   verify:
   - The injected knowledge entry is relevant to the target step's purpose
   - The knowledge entry does not duplicate content already in the step's
     base knowledge-base
   - The combined knowledge (base + injected) does not exceed a reasonable
     context budget for the step (>5 knowledge entries per step is a warning)

2. **Effective knowledge reachability**: For each of the 24 game knowledge
   entries, verify it is referenced by at least one pipeline step — either
   via the overlay's `knowledge-overrides` OR via a pipeline step's own
   `knowledge-base` frontmatter field. Only entries unused by both overlay
   wiring and direct step frontmatter are dead content.

3. **Reads override correctness**: For each `reads-overrides` entry, verify
   that the replacement artifact is a valid substitute. Example: replacing
   `ux-spec` reads with `game-ui-spec` reads makes sense only if
   `game-ui-spec` produces the same type of information the consuming step
   expects.

4. **Dependency override correctness**: For each `dependency-overrides`
   entry, verify that the new dependency graph is acyclic and that the
   added/replaced dependencies produce artifacts the dependent step
   actually needs.

5. **Step enablement assessment**: Review the 3 disabled steps
   (`design-system`, `ux-spec`, `review-ux`). Verify that their
   functionality is fully replaced by game equivalents and that no
   downstream step still depends on their outputs without a replacement
   source.

**Red flag patterns:**
- A knowledge entry about networking injected into an art-focused step
- A game step with 0 game knowledge entries in its effective knowledge-base
- A reads override that replaces an artifact with a differently-structured
  one (e.g., swapping a spec doc reference for a review doc reference)
- An always-enabled game step that has no knowledge-overrides AND an empty
  knowledge-base in its own frontmatter

Deliverable: Overlay integration audit table with injection correctness
and gap analysis.

---

## Module 11: End-to-End Genre Path Simulation

**Question**: Can an AI agent actually execute the game pipeline for a
specific, complex genre without getting stuck?

Pick ONE complex genre profile (e.g., Multiplayer F2P Mobile RPG, or
PC RTS with UGC, or Single-Player Console Action-Adventure). Mentally
simulate the pipeline execution using the `game-overlay.yml` conditional
logic for that profile:

1. **Step-by-step walkthrough**: For each active step in execution order,
   do all required inputs exist (produced by prior steps or marked
   optional)? Are the instructions unambiguous enough that an agent
   wouldn't need to ask clarifying questions?

2. **First stuck point**: Identify the FIRST step where an agent building
   this specific genre would get stuck, confused, or produce incorrect
   output. Explain what's missing or ambiguous.

3. **Genre handoff readiness**: After the last finalization step, verify
   an implementation agent could start work on this genre using ONLY the
   artifacts the pipeline produced. What would they be missing?

4. **Second genre comparison**: Briefly repeat items 1-2 for a contrasting
   genre (e.g., if the first was multiplayer, pick single-player; if the
   first was 3D, pick 2D). Note where the pipeline handles the contrast
   well and where it doesn't.

Deliverable: End-to-end genre simulation report with first-stuck-point
analysis.

---

## Final Deliverable

Produce `docs/archive/audits/game-content-audit-round-N.md` (increment N
from the most recent existing report, or use N=1 if none exists) containing:

1. **Executive Summary** — Domain quality score (1-10) with trend vs. prior
   round (improving / stable / declining), or "baseline" for Round 1.
   Include a comparison table for up to the last 3 available rounds; if
   fewer than 3 exist, include all available rounds and note limited history.

2. **Delta from Prior Round** — New findings only, clearly separated from
   carried-forward items. If Round 1, this section lists all findings.

3. **Regressions** — Any prior fix that reverted or degraded.

4. **Findings by Module** — All findings from modules 1-11, each with:
   - Finding ID (e.g., `1-I3` = Module 1, INACCURATE finding #3)
   - Category (INACCURATE / INCOMPLETE / SHALLOW / MISMATCHED / OUTDATED)
   - File affected (full path)
   - Evidence (exact text from the file, with line number if possible)
   - Proposed fix (specific rewrite text, not "improve this section")
   - Impact (what goes wrong if an AI agent follows the current content)
   - Priority (P0 / P1 / P2 / P3)
   - Whether this is new, carried forward, or a regression

5. **False Positive Filtering** — Findings initially flagged but filtered
   after checking Known Good Patterns. Update the appendix if new patterns
   are identified.

6. **Priority Matrix** — All validated findings ranked by impact on AI
   agent output quality:
   - **P0**: Agent produces incorrect/broken output
   - **P1**: Agent produces low-quality output that needs major rework
   - **P2**: Agent output is functional but misses industry best practices
   - **P3**: Polish — content works but could be better

7. **Recommended Actions** — Specific file edits, grouped into
   implementable work packages. Each work package should:
   - Target 1-3 files (avoid file conflicts for parallel agent execution)
   - Include the exact text to add/change/remove
   - Note which finding IDs it resolves

8. **Proposed Enhancements** — New knowledge entries, new review entries,
   or structural changes that would improve game content quality but are
   beyond fixing existing files. Prioritize by impact.

9. **Appendix** — Known-good and false-positive patterns discovered during
   this round. Update with any new patterns for future rounds.

---

## Constraints

- **Read every file completely** — domain accuracy requires reading actual
  content, not inferring from filenames or frontmatter
- **Verify your findings**: if you claim a file is missing coverage of
  topic X, grep all 53 content files AND `content/methodology/game-overlay.yml`
  for related terms first — it may be covered in a different file or wired
  via the overlay
- **Propose specific rewrites, not vague flags**: "this section is weak"
  is not a finding; "replace lines 45-52 with [specific text]" is
- **Focus on what affects AI agent output quality** — not formatting
  preferences, prose style, or aesthetic choices
- **Test against multiple genre profiles**: mentally simulate a puzzle
  game, an FPS, an RPG, and a mobile casual game using each file's
  guidance to check genre-sensitivity
- **Check findings against the Known Good Patterns section** before
  reporting — engine-specific code examples, brief MVP output, and
  conditional step gating are by design
- **Compare quality against existing non-game entries**: the bar is set by
  entries like `content/knowledge/core/testing-strategy.md` — game entries
  should meet or exceed this standard

---

## Parallelization Guide

This prompt is structured as 11 independent modules for parallel execution
with subagents. Each module targets a different quality dimension:

| Module | What It Catches | Primary Files |
|--------|----------------|---------------|
| 1. Domain Accuracy | Wrong facts, missing concepts, incorrect numbers | All 53 files |
| 2. Engine-Agnostic Balance | Engine bias in prose, unbalanced examples | All 53 files |
| 3. Genre Coverage | 3D-action-game assumptions, genre blind spots | All 53 files + overlay |
| 4. Knowledge Depth | Vague guidance, missing thresholds, weak code examples | 29 knowledge entries |
| 5. Quality Criteria Rigor | Unmeasurable criteria, missing depth tags | 24 pipeline steps |
| 6. Cross-Step Coherence | Broken information flow, contradictions | 24 pipeline steps + overlay |
| 7. Methodology Scaling | Lumped depth levels, insufficient MVP, weak deep | 24 pipeline steps |
| 8. Review Effectiveness | Uncaught failure modes, missing review coverage | 5 review entries + creation steps |
| 9. Platform & Scale | Missing platform coverage, scale assumptions | All 53 files |
| 10. Overlay Integration | Wrong injections, dead knowledge, wiring errors | game-overlay.yml + referenced files |
| 11. Genre Path Simulation | First stuck point for a specific genre profile | Active steps for chosen genre + overlay |

**Dependency note**: Modules 1-5 and 9 can run fully in parallel. Module 6
reads cross-step relationships (benefits from Module 1 findings but does
not require them). Module 8 reads creation-review pairs. Module 10 reads
overlay + referenced files. All modules can run as independent subagents
with results merged into the Final Deliverable.

**Coordinator requirement**: Module agents may produce raw findings
independently, but a final coordinator pass must deduplicate overlapping
findings, reconcile category/severity conflicts, and generate the delta,
regression, and priority sections of the Final Deliverable.

**Batching recommendation for smaller-context models**: The 53 content
files total approximately 12,700 lines (~177K tokens). For models with
<200K context windows, subdivide large-scope modules into batches:
- Batch A: 24 game knowledge entries (~8,900 lines)
- Batch B: 5 review knowledge entries (~1,500 lines)
- Batch C: 24 pipeline steps (~2,300 lines)

For models with >=200K context windows (Opus, Gemini 2.5 Pro), single-pass
execution per module is feasible but auditors should produce findings
incrementally (per-file) rather than holding all analysis in working memory.
