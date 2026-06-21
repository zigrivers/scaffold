---
name: review-macos-release
description: Combined ship-readiness review of the macOS distribution and entitlements/privacy specs
summary: "Single gate over docs/macos-distribution.md and docs/macos-entitlements-privacy.md — verifies signing/notarization completeness, sandbox/entitlements correctness, privacy strings, and config consistency (e.g. no Sparkle in a Mac App Store build)."
phase: "quality"
order: 967
dependencies: [macos-distribution-spec, macos-entitlements-privacy-spec]
outputs: [docs/reviews/review-macos-release.md, docs/reviews/macos-release/review-summary.md, docs/reviews/macos-release/codex-review.json, docs/reviews/macos-release/antigravity-review.json]
conditional: null
reads: [macos-distribution-spec, macos-entitlements-privacy-spec, system-architecture]
knowledge-base: [macos-code-signing, macos-app-sandbox-entitlements]
---

This step performs a combined cross-spec ship-readiness review of the macOS distribution and entitlements/privacy specifications, treating them as a single coherent gate rather than independent documents. Because signing, sandboxing, TCC privacy strings, and update-mechanism choices are tightly coupled across both specs, a joint review catches consistency failures — missing hardened-runtime exceptions, Sparkle in a Mac App Store build — that per-spec review misses entirely.

## Purpose
Review the macOS distribution and entitlements/privacy specifications together
as a combined ship-readiness gate, targeting cross-spec consistency failures
that neither spec surfaces in isolation: a distribution spec that enables Sparkle
in a Mac App Store build; an entitlements spec that declares network access but a
distribution spec that omits the corresponding hardened runtime exception; a
sandbox decision that conflicts with subprocess calls the architecture requires.

At depth 4+, dispatches to external AI models (Codex, Antigravity) for independent
review validation.

## Inputs
- `docs/macos-distribution.md` (required) — distribution spec to review
- `docs/macos-entitlements-privacy.md` (required) — entitlements/privacy spec to review
- `docs/system-architecture.md` (required) — source of truth for distribution
  channel, sandboxing config, and subprocess calls; used to verify both specs
  are internally consistent with the architecture

## Expected Outputs
- `docs/reviews/review-macos-release.md` — findings and resolution log
- `docs/macos-distribution.md` — updated with fixes
- `docs/macos-entitlements-privacy.md` — updated with fixes
- `docs/reviews/macos-release/review-summary.md` (depth 4+) — multi-model review synthesis
- `docs/reviews/macos-release/codex-review.json` (depth 4+, if available) — raw Codex findings
- `docs/reviews/macos-release/antigravity-review.json` (depth 4+, if available) — raw Antigravity findings

## Quality Criteria

### Signing and Notarization
- (mvp) Signing identity in the distribution spec matches the distribution channel (Developer ID Application for direct; Apple Distribution for MAS)
- (mvp) Notarization workflow is complete: `notarytool submit` → poll → `stapler staple` → `spctl --assess` — all four steps present for every Developer ID build
- (mvp) Hardened Runtime decision is consistent between both specs: if distribution spec enables it, entitlements spec lists any required exceptions; no undeclared exceptions
- (deep) CI secrets inventory in distribution spec covers every credential the notarization workflow touches (cert, cert password, Apple ID or API key, team ID)

### Sandbox and Entitlements
- (mvp) Sandbox decision in entitlements spec is consistent with distribution channel: MAS → sandbox required; Developer ID only → sandbox on/off matches architecture `sandboxed` value
- (mvp) Every capability declared in the entitlements spec has a corresponding `com.apple.security.*` key — no capability described in prose but absent from the entitlements list
- (mvp) Subprocess calls identified in system-architecture are resolved in the entitlements spec (bundled binary, XPC, or entitlement exception) — no unresolved subprocess dependency
- (deep) If `distribution: both`, entitlement delta between Developer ID and MAS builds is documented and the two `.entitlements` files are separately specified

### Privacy (TCC)
- (mvp) Every TCC-gated resource the app accesses has a corresponding `NS*UsageDescription` key in the entitlements spec — no missing privacy strings
- (mvp) Usage-description strings are present as content (not placeholders) and pass App Store language review: plain English, first person, specific resource mention, no marketing copy
- (deep) If the app uses Microphone, Camera, Location, or Contacts, the trigger condition is documented (e.g., "only when user initiates recording") to support App Store review notes

### Config Consistency
- (mvp) Sparkle auto-update is absent from the distribution spec if `distribution: mac-app-store` (MAS-only builds forbid third-party update mechanisms); for `distribution: both`, Sparkle is permitted but MUST be present only in the Developer ID build scheme/lane and stripped from the MAS variant
- (mvp) If `distribution: developer-id`, the distribution spec includes Sparkle configuration (appcast URL, EdDSA key) — a Developer ID app without an update mechanism is a ship-readiness gap
- (mvp) If `distribution: both`, the distribution spec REQUIRES separate Developer ID and MAS build schemes or Fastlane lanes: Sparkle is present in the Developer ID scheme only, stripped from the MAS scheme; single-scheme builds cannot satisfy both signing and update-mechanism requirements simultaneously

### Findings Triage
- (mvp) Every finding categorized P0–P3 (P0 = Breaks App Store submission or Gatekeeper. P1 = Prevents ship milestone. P2 = Known tech debt. P3 = Polish.) with specific spec section, key/field, and issue
- (mvp) Fix plan documented for all P0/P1 findings; fixes applied to both specs and re-validated
- (mvp) Downstream readiness confirmed — no unresolved P0 or P1 findings before implementation proceeds
- (depth 4+) Multi-model findings synthesized: Consensus (all models agree), Majority (2+ models agree), or Divergent (models disagree — present to user for decision)

## Methodology Scaling
- **deep**: Full multi-pass review covering all four check areas (signing/notarization,
  sandbox/entitlements, privacy/TCC, config consistency). Multi-model review
  dispatched to Codex and Antigravity if available, with graceful fallback to
  Claude-only enhanced review. Cross-spec correlation matrix produced.
- **mvp**: Config consistency check (Sparkle/MAS conflict, sandbox/channel match)
  and TCC string completeness only — the two highest-value catches for fast
  iteration.
- **custom:depth(1-5)**:
  - Depth 1: config consistency check only (Sparkle/MAS conflict, sandbox/channel alignment) — 1 review pass.
  - Depth 2: add signing/notarization completeness and TCC string presence check (2 review passes).
  - Depth 3: add entitlements cross-reference (every capability has a key), hardened runtime consistency, and subprocess resolution check (3 review passes).
  - Depth 4: add external model review for independent signing and sandbox validation (3 review passes + external dispatch).
  - Depth 5: multi-model review with reconciliation, cross-spec correlation matrix, and review notes for App Store submission (3 review passes + multi-model synthesis).

## Mode Detection
Re-review mode if `docs/reviews/review-macos-release.md` already exists. If
multi-model review artifacts exist under `docs/reviews/macos-release/`, preserve
prior findings still valid.

## Update Mode Specifics
- **Detect**: `docs/reviews/review-macos-release.md` exists with tracking comment
- **Preserve**: Prior findings still valid, resolution decisions, multi-model review artifacts
- **Triggers**: Either spec updated since last review (compare tracking comment dates); distribution channel changed; new entitlement or TCC key added
- **Conflict resolution**: Previously resolved findings reappearing = regression; flag and re-evaluate

## After This Step

When this step is complete, tell the user:

---
**Release review complete** — `docs/reviews/review-macos-release.md` created, fixes applied to both specs.

**Next:** Run `/scaffold:implementation-plan` — Build the implementation plan.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
