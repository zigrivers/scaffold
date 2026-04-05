---
name: localization-plan
description: Plan target languages, string management, font support (CJK/RTL), UI text expansion, VO localization, cultural adaptation, and LQA
summary: "Plans the localization strategy — target languages and tiers, string management pipeline, font support for CJK and RTL scripts, UI text expansion handling (~30% for German), voice-over localization approach, cultural adaptation guidelines, and linguistic QA process."
phase: "specification"
order: 874
dependencies: [game-design-document]
outputs: [docs/localization-plan.md]
conditional: "if-needed"
reads: [game-ui-spec, narrative-bible]
knowledge-base: [game-localization]
---

## Purpose
Plan the localization strategy — the systematic process of adapting the game
for multiple languages and cultures. Localization is not translation: it
encompasses string management infrastructure, font and text rendering for
diverse scripts, UI layout adaptation for text expansion, voice-over
production across languages, cultural sensitivity review, and a quality
assurance process that validates every localized build.

Localization decisions have deep technical implications that must be resolved
before content production begins. String externalization must be built into
the code architecture — retrofitting it after thousands of hardcoded strings
exist is prohibitively expensive. Font atlases must support target scripts
(CJK characters alone require thousands of glyphs). UI layouts must
accommodate text expansion (German text is typically 30% longer than English;
some languages expand by 50% or more). Right-to-left (RTL) scripts (Arabic,
Hebrew) require mirrored UI layouts. These are not cosmetic adjustments —
they are architectural requirements that affect every system touching text.

Three localization depth tiers exist:

1. **Text-only localization**: All in-game text is translated, but audio
   remains in the original language (with subtitles). Most cost-effective,
   suitable for indie and mid-scale games.
2. **Partial VO localization**: Text is fully translated, and key narrative
   audio (cinematics, main story) is re-recorded in target languages. Secondary
   audio (barks, incidental dialogue) uses original language with subtitles.
3. **Full VO localization**: All spoken content is re-recorded in every target
   language. Highest cost, required for AAA titles targeting global markets.

## Conditional Evaluation
Enable when: the project config indicates more than one supported locale
(`supportedLocales.length > 1`) — the game will ship in multiple languages,
requiring string externalization, font support, UI adaptation, and a
localization pipeline.

Skip when: the game ships in a single language only. Games with no text (pure
visual/musical experiences) or games explicitly scoped to one market with no
localization plans do not need this specification.

## Inputs
- docs/game-design.md (required) — narrative scope, text volume, VO volume, cultural setting informing adaptation needs
- docs/plan.md (required) — target markets and languages, localization budget and timeline constraints
- docs/game-ui-spec.md (optional, forward-read) — UI layout system, text rendering approach, font pipeline
- docs/narrative-bible.md (optional, forward-read) — dialogue volume, character voice profiles, cultural references requiring adaptation

## Expected Outputs
- docs/localization-plan.md — target languages, string management pipeline,
  font strategy, UI adaptation guidelines, VO localization approach, cultural
  adaptation process, and LQA plan

## Quality Criteria
- (mvp) Target languages listed with priority tiers: Tier 1 (ship languages), Tier 2 (post-launch), Tier 3 (community-contributed), with rationale for each tier based on market analysis
- (mvp) String management pipeline specified: string externalization format (JSON, XLIFF, PO, proprietary), key naming convention, pluralization and gender rules, interpolation/variable syntax, context annotations for translators
- (mvp) Font strategy documented: font families per script category (Latin, CJK, Cyrillic, Arabic, Devanagari), font atlas generation pipeline, fallback chain, dynamic font loading for memory-constrained platforms
- (mvp) UI text expansion handling: layout system accommodates 30-50% text growth, truncation and overflow strategy, minimum touch targets preserved regardless of text length, RTL layout mirroring plan (if applicable)
- (mvp) Localization build pipeline: how localized assets are packaged (per-language bundles, on-demand download, embedded), language switching at runtime (restart required vs hot-swap)
- (deep) VO localization plan: localization depth per language (text-only, partial VO, full VO), casting direction per language, lip-sync adaptation approach (re-animation, procedural, blend shapes), recording specification (sample rate, format, naming)
- (deep) Cultural adaptation guidelines: content sensitivity review process, region-specific content variants (violence/gore rating adjustments, culturally inappropriate symbols, color symbolism), legal requirements per market (age rating localization, loot box probability disclosure language)
- (deep) LQA (Linguistic Quality Assurance) process: in-context review workflow (translators play the build), bug taxonomy (truncation, overlap, mistranslation, placeholder visible, encoding error), severity levels, sign-off criteria per language
- (deep) Translation memory and terminology management: TM/glossary tooling, term consistency enforcement, brand name and proper noun lock lists, style guide per language
- (deep) Pseudolocalization testing: automated pseudo-loc pass (accented characters, text expansion simulation, RTL simulation) integrated into CI, visual regression testing for localized UI

## Methodology Scaling
- **deep**: Full localization plan covering tiered language strategy, string
  management with TM/glossary tooling, comprehensive font strategy for all
  target scripts, UI adaptation with RTL support, VO localization with lip-sync
  plan, cultural adaptation guidelines, LQA process with in-context review,
  pseudolocalization in CI, and localization analytics. 15-25 pages.
- **mvp**: Target languages, string externalization format, font strategy for
  primary scripts, UI text expansion guidelines, and basic localization build
  pipeline. 4-8 pages.
- **custom:depth(1-5)**:
  - Depth 1: target language list and string externalization format only.
  - Depth 2: add font strategy, UI text expansion handling, and localization build pipeline.
  - Depth 3: add VO localization plan, cultural adaptation guidelines, and pluralization/gender rule system.
  - Depth 4: add LQA process, translation memory tooling, RTL layout mirroring, and pseudolocalization testing.
  - Depth 5: full specification with localization analytics (translation coverage, LQA defect rates, language launch readiness dashboard), community translation infrastructure, and per-region content variant management.

## Mode Detection
Check for docs/localization-plan.md. If it exists, operate in update mode:
read existing plan and diff against current GDD language targets and narrative
scope. Preserve existing string management format, font strategy, and VO
decisions. Update target language tiers if market analysis changed. Add font
support for new scripts if languages added require them.

## Update Mode Specifics
- **Detect prior artifact**: docs/localization-plan.md exists
- **Preserve**: string management format and key naming convention, font
  families and atlas generation pipeline, VO localization depth per language,
  LQA process and bug taxonomy, cultural adaptation decisions
- **Triggers for update**: GDD changed target markets or added languages,
  narrative-bible changed dialogue volume or added culturally sensitive content,
  game-ui-spec changed text rendering or layout system, VO scope changed
  (text-only to partial VO, or partial to full), new platform added with
  different font or text rendering constraints
- **Conflict resolution**: if adding a new target language requires a script
  not currently supported by the font pipeline (e.g., adding Thai requires
  complex text shaping), document the font engineering cost explicitly and
  propose a phased approach — never add a language to the target list without
  confirming the text rendering pipeline can support its script requirements
