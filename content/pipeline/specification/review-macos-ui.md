---
name: review-macos-ui
description: Review the macOS UI spec for HIG conformance, accessibility, and keyboard completeness
summary: "Replaces review-ux for macOS-native projects. Audits docs/macos-ui-spec.md against Apple HIG, accessibility requirements, and keyboard/menu completeness."
phase: "specification"
order: 864
dependencies: [macos-ui-spec]
outputs: [docs/reviews/specification-review-macos-ui.md]
conditional: null
reads: [macos-ui-spec, user-stories]
knowledge-base: [macos-hig-ui-patterns, macos-accessibility]
---

Review the macOS UI specification (`docs/macos-ui-spec.md`) for HIG conformance,
accessibility completeness, and keyboard/menu coverage. This step replaces
`review-ux` for macOS-native projects. Web UX reviews check responsive breakpoints,
touch targets, and WCAG contrast; macOS UI reviews audit against the Apple Human
Interface Guidelines, platform accessibility APIs (VoiceOver, Dynamic Type, Reduce
Motion), and the keyboard contract of a well-behaved Mac app. At depth 4+, dispatches to one external AI model (Codex or Gemini, if CLI
available) for independent validation. At depth 5, a full multi-model review
with reconciliation is dispatched.

## Mode Detection
Check for `docs/reviews/specification-review-macos-ui.md`. If it exists, operate
in **re-review mode**: load the prior findings, identify which have been resolved
(present in previous report but absent or fixed in current spec), and focus new
passes on unresolved findings and any sections of the spec that changed since the
last review timestamp.

## Update Mode Specifics
- **Detect prior artifact**: `docs/reviews/specification-review-macos-ui.md` exists
  with a tracking comment containing the prior review date
- **Preserve**: previously resolved findings and their resolution notes; multi-model
  review artifacts under `docs/reviews/macos-ui/` if present
- **Triggers**: upstream `docs/macos-ui-spec.md` modified since the last review
  date; `docs/user-stories.md` added new stories not yet reflected in the spec
- **Conflict resolution**: a finding that was marked resolved but reappears in the
  updated spec is a regression — flag it with severity at least P1 and note the
  regression explicitly in the report

## Purpose
Verify that `docs/macos-ui-spec.md` is complete, HIG-conformant, and
implementation-ready. This multi-pass review targets macOS-UI-specific failure
modes:

- Menu bar items that conflict with HIG-reserved shortcuts or omit required
  standard items (⌘Q, ⌘W, Help menu, etc.)
- Custom keyboard shortcuts that collide with system or per-app reserved bindings
- User stories with no corresponding menu item, toolbar action, or keyboard path
- Custom views that lack VoiceOver accessibility labels or roles
- Animations without Reduce Motion alternatives
- Dark Mode adoptions that rely on hardcoded colors instead of semantic tokens
- Multi-window behavior that is undefined or inconsistent with the app's scene model
- Menu-bar-extra lifecycle violations (e.g., inadvertently showing a Dock icon)

## Inputs
- `docs/macos-ui-spec.md` (required) — spec to review
- `docs/user-stories.md` (required) — for story-to-UI-surface coverage verification

## Expected Outputs
- `docs/reviews/specification-review-macos-ui.md` — findings with severity ratings,
  location references, and resolution log
- `docs/macos-ui-spec.md` — updated with fixes for all P0/P1 findings
- `docs/reviews/macos-ui/review-summary.md` (depth 4+) — multi-model review synthesis
- `docs/reviews/macos-ui/codex-review.json` (depth 4+, if available) — raw Codex findings
- `docs/reviews/macos-ui/gemini-review.json` (depth 4+, if available) — raw Gemini findings

## Quality Criteria
- (mvp) App-style declaration reviewed: correct lifecycle implications stated for the chosen style (standard, menu-bar extra, or background agent)
- (mvp) App Menu verified: About, Settings (⌘,), Services submenu, Hide/Hide Others/Quit (⌘Q) all present and in HIG order; no custom items placed between Services and Hide
- (mvp) Standard menus checked for mandatory items: File (New, Open, Close, Save, Print where applicable), Edit (Undo/Redo, Cut/Copy/Paste/Select All), Window (Minimize ⌘M, Zoom), Help
- (mvp) Every keyboard shortcut in the spec verified against the HIG reserved-shortcut list — no collision with ⌘Q, ⌘W, ⌘M, ⌘H, ⌘Space, ⌘Tab, and other reserved bindings
- (mvp) Every user story maps to at least one navigable UI surface (menu item, toolbar button, shortcut, or documented gesture)
- (mvp) VoiceOver label confirmed for every custom `NSView` subclass or SwiftUI canvas/drawing view in the spec
- (mvp) Reduce Motion alternative documented for every animated transition in the spec
- (mvp) Every finding categorized P0–P3 with specific document section, element, and issue description
- (mvp) Fix plan documented for all P0/P1 findings; fixes applied to `docs/macos-ui-spec.md` and re-validated
- (mvp) Review report includes an explicit **Readiness Status** section with a pass/fail verdict
- (mvp) Downstream readiness confirmed — no unresolved P0 or P1 findings remain before handoff
- (deep) Responder-chain walkthrough verified: key events for the primary task flow reach the correct handler with no unhandled paths
- (deep) Dark Mode token audit: no hardcoded `NSColor`/`Color` literals in the spec — all colors reference semantic system colors or named asset catalog entries
- (deep) Dynamic Type compliance reviewed: custom font usage either adopts `NSFontDescriptor` text styles or waives Dynamic Type with documented rationale
- (deep) Multi-window behavior matrix reviewed: every user-initiated window action (New Window, Close, full-screen) has a defined outcome
- (deep) Menu-bar extra spec (if applicable) reviewed: icon is a template image at correct dimensions, activation model is correct, popover/menu content is fully itemized
- (deep) Multi-monitor behavior verified or confirmed as not applicable
- (depth 4+) Multi-model findings synthesized — Consensus, Majority, or Divergent — with user escalation for Divergent HIG-interpretation conflicts

## Methodology Scaling
- **deep**: Full multi-pass review — HIG conformance, shortcut collision audit,
  story-to-surface coverage, VoiceOver completeness, Reduce Motion coverage, Dark
  Mode token audit, Dynamic Type compliance, multi-window matrix, menu-bar extra
  spec (if applicable), and responder-chain walkthrough. Multi-model review
  dispatched if available.
- **mvp**: HIG menu-bar conformance pass and keyboard-shortcut collision check only.
- **custom:depth(1-5)**:
  - Depth 1: two passes — menu-bar item conformance (App Menu + standard menus) and shortcut collision check.
  - Depth 2: four passes — add story-to-UI-surface coverage and VoiceOver label completeness.
  - Depth 3: six passes — add Reduce Motion coverage, Dark Mode token audit, and responder-chain walkthrough for the primary task flow.
  - Depth 4: all passes (add Dynamic Type compliance, multi-window matrix, menu-bar extra spec) + one external model (if CLI available).
  - Depth 5: all passes + multi-model review with reconciliation and user escalation for Divergent findings.

## After This Step

When this step is complete, tell the user:

---
**Review complete** — `docs/reviews/specification-review-macos-ui.md` created, fixes applied to `docs/macos-ui-spec.md`.

**Next:** Run `/scaffold:macos-distribution-spec` — Specify signing, notarization, and distribution for the app.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
