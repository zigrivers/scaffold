---
name: game-milestone-definitions
description: Standard game development milestones from concept through live ops, gate criteria, and task-wave mapping
topics: [game-dev, milestones, production, vertical-slice, alpha, beta]
---

Game development milestones are the checkpoints that determine whether a project is on track, at risk, or should be cancelled. Unlike software sprints that deliver incremental value, game milestones represent qualitative gates — each one answers a fundamentally different question about the project. Missing a milestone gate criteria is a signal that should trigger re-evaluation, not just a schedule adjustment. The discipline to enforce gate criteria is what separates shipped games from cancelled ones.

## Summary

### Standard Milestone Sequence

Game development follows a well-established milestone progression, though studios may rename or combine stages:

1. **Concept** — Is this idea worth exploring?
2. **Pre-Production / Prototype** — Can we prove the core is fun?
3. **Vertical Slice** — Can we build a representative slice at shippable quality?
4. **First Playable** — Does the full game structure work?
5. **Alpha (Feature Complete)** — Are all features implemented?
6. **Beta (Content Complete)** — Is all content in the game?
7. **Release Candidate** — Is the game ready to ship?
8. **Gold Master / Launch** — The game ships.
9. **Live / Post-Launch** — Ongoing support, patches, content updates.

### Feature Complete vs Content Complete

These terms are frequently confused and the distinction matters:

- **Feature Complete (Alpha)**: Every gameplay system, mechanic, and tool is implemented and functional. Art and audio may be placeholder. Balance is rough. Bugs are acceptable. The question answered: "Does everything work?"
- **Content Complete (Beta)**: All levels, assets, dialogue, music, and UI are in the game at final quality. No new content will be added — only polish, optimization, and bug fixes from here. The question answered: "Is everything here?"

### Content Lock vs Code Lock

- **Content Lock** occurs at Beta — no new art, audio, levels, or text enters the build
- **Code Lock** occurs at Release Candidate — no new code changes except critical bug fixes
- Violating these locks introduces regression risk and delays shipping

### Milestone-to-Task-Wave Mapping

Each milestone maps to a wave of tasks that should be planned, estimated, and tracked:

- **Concept**: Design tasks only (research, competitive analysis, pitch document)
- **Pre-Production**: Design + engineering prototype tasks (throwaway code is expected)
- **Vertical Slice**: Full-discipline tasks (design, engineering, art, audio) at final quality for one slice
- **Alpha**: Engineering-heavy tasks (implement all remaining systems), art production ramps up
- **Beta**: Content production-heavy tasks (level building, asset finalization, localization)
- **Release Candidate**: QA-heavy tasks (bug fixing, performance optimization, platform certification)

## Deep Guidance

### Milestone 1: Concept

**Duration**: 1-4 weeks

**Gate question**: "Is this idea worth investing in?"

**Gate criteria:**
- Written pitch document (1-3 pages) covering: genre, target audience, core hook, competitive landscape, platform targets
- Game pillars defined (3-5, phrased as "X over Y" tradeoffs)
- Core loop described at a high level
- Market analysis: who are the competitors, what is the opportunity, what is the differentiation
- Initial scope estimate: team size, timeline, budget range
- Key risks identified with mitigation strategies

**Documentation expected:**
- Pitch document
- Competitive analysis spreadsheet
- Initial risk register

**Go/No-Go signals:**
- Go: Clear differentiation, viable market, team capable of executing, budget available
- No-Go: Undifferentiated from competitors, market too small, team lacks critical skills, scope exceeds budget

### Milestone 2: Pre-Production / Prototype

**Duration**: 4-12 weeks

**Gate question**: "Is the core gameplay fun?"

**Gate criteria:**
- Playable prototype demonstrating the core loop (primary loop only)
- Prototype has been playtested by people outside the team
- Playtest feedback documented and analyzed
- Core loop validated as engaging: players voluntarily continue playing past the minimum test time
- Technical feasibility confirmed for highest-risk features
- Art style exploration complete with reference sheet or mood board
- Full GDD v1.0 written

**Documentation expected:**
- GDD v1.0
- Playtest reports (minimum 5 external testers)
- Technical feasibility assessment for top 3 risk items
- Art direction reference document
- Updated risk register

**Go/No-Go signals:**
- Go: Playtesters find the core loop engaging, technical risks are mitigable, art direction is clear
- No-Go: Core loop is not fun after iteration, a critical technical feature is infeasible, art direction is unresolved

**Critical rule**: The prototype is throwaway code. Do not carry prototype code into production. Its purpose is learning, not building.

### Milestone 3: Vertical Slice

**Gate question**: "Can we build this game at shippable quality?"

**Duration**: 8-16 weeks

This is the most important milestone in game development. The vertical slice is a small, complete section of the game built to final quality. It represents 5-15 minutes of gameplay that is indistinguishable from the final product in terms of polish, art quality, audio quality, and gameplay feel.

**Gate criteria:**
- One complete section/level/area at final visual quality
- All core mechanics functional and polished in this section
- Final-quality art, audio, and UI for this section
- Performance targets met on target hardware for this section
- Build is stable (no crashes during a 30-minute play session)
- External playtest confirms the experience matches the intended pillar delivery

**Documentation expected:**
- Updated GDD reflecting lessons from vertical slice
- Production pipeline documentation (how assets are created, reviewed, integrated)
- Technical design document for all major systems
- Performance benchmark report on target hardware
- Updated project plan with revised scope and schedule

**Go/No-Go signals:**
- Go: The vertical slice is fun, visually compelling, technically sound, and producible at a sustainable pace
- No-Go: The slice is not fun, visual quality is below target, production pipeline is too slow, performance is unacceptable

**Why the vertical slice matters**: It is the "is this fun?" gate. Everything before this was theory and prototyping. The vertical slice is the first moment the team sees the actual game. If the vertical slice is not compelling, the full game will not be compelling. This is the cheapest point to cancel or pivot.

```yaml
# Milestone Gate Checklist Template
# Copy and customize for each milestone review

milestone: "Vertical Slice"
date: "YYYY-MM-DD"
reviewers:
  - name: ""
    role: "Project Lead"
  - name: ""
    role: "Design Lead"
  - name: ""
    role: "Tech Lead"
  - name: ""
    role: "Art Lead"

gate_criteria:
  gameplay:
    - criterion: "Core loop playable end-to-end"
      status: "pass | fail | partial"
      notes: ""
    - criterion: "All primary mechanics functional"
      status: ""
      notes: ""
    - criterion: "External playtest completed (min 5 testers)"
      status: ""
      notes: ""
    - criterion: "Playtest satisfaction score >= 7/10"
      status: ""
      notes: ""

  technical:
    - criterion: "Target framerate met (specify: 30/60 fps)"
      status: ""
      notes: ""
    - criterion: "No crashes in 30-min session"
      status: ""
      notes: ""
    - criterion: "Memory budget met on target platform"
      status: ""
      notes: ""
    - criterion: "Load times within target (specify seconds)"
      status: ""
      notes: ""

  art_audio:
    - criterion: "Final-quality art for slice content"
      status: ""
      notes: ""
    - criterion: "Final-quality audio for slice content"
      status: ""
      notes: ""
    - criterion: "UI mockups approved for all screens"
      status: ""
      notes: ""

  production:
    - criterion: "Asset pipeline documented and tested"
      status: ""
      notes: ""
    - criterion: "Content production rate is sustainable"
      status: ""
      notes: ""
    - criterion: "Updated schedule based on actual velocity"
      status: ""
      notes: ""

decision: "go | no-go | conditional-go"
conditions: ""  # If conditional-go, what must be resolved and by when
next_milestone: "First Playable"
next_review_date: "YYYY-MM-DD"
```

### Milestone 4: First Playable

**Duration**: 8-20 weeks after vertical slice

**Gate question**: "Does the full game structure work?"

**Gate criteria:**
- Complete game flow from start to finish (even if many sections use placeholder content)
- All primary and secondary gameplay systems implemented (may use placeholder art/audio)
- Save/load functional
- All game modes playable (single-player, multiplayer modes if applicable)
- Menu flow complete (main menu, settings, pause, game over)
- Build runs on all target platforms (does not need to meet final performance targets)

**Documentation expected:**
- Complete level/mission list with status (placeholder/WIP/final)
- System design documents for all gameplay systems
- Platform-specific technical notes
- Updated content production schedule

### Milestone 5: Alpha (Feature Complete)

**Duration**: 12-30 weeks after first playable

**Gate question**: "Are all features implemented?"

**Gate criteria:**
- Every feature in the approved scope is implemented and functional
- No major systems are missing — this is the last point to add new features
- All difficulty levels/modes are playable
- Multiplayer networking is functional (if applicable)
- Platform-specific features implemented (achievements, save systems, controller support)
- All UI screens implemented (final art not required)
- Localization pipeline is functional (all strings are externalized)
- Automated test coverage for critical gameplay systems

**Documentation expected:**
- Feature completion matrix (every feature rated: implemented/functional/polished)
- Known issues list (bugs are expected; they should be categorized by severity)
- Performance baseline report
- Localization readiness report

**Critical rule**: No new features after Alpha. Feature requests after Alpha are deferred to post-launch or DLC. Scope discipline here determines whether the project ships on time.

### Milestone 6: Beta (Content Complete)

**Duration**: 8-16 weeks after alpha

**Gate question**: "Is all content in the game?"

**Gate criteria:**
- All levels, missions, and encounters are in the game at final quality
- All art assets are final (no more placeholder art)
- All audio assets are final (music, SFX, voice acting)
- All text and dialogue are final and localized
- All cinematics and cutscenes are final
- Difficulty balance pass complete
- First-time user experience (FTUE) / tutorial is complete
- Platform certification pre-check passes (no certification blockers)

**Documentation expected:**
- Content completion matrix (every asset rated: draft/WIP/final)
- Localization status by language
- Balance spreadsheet with tuning parameters
- Certification pre-check report

**Critical rule**: Content lock. No new content after Beta. Only bug fixes, optimization, and polish.

### Milestone 7: Release Candidate

**Duration**: 4-8 weeks after beta

**Gate question**: "Is the game ready to ship?"

**Gate criteria:**
- Zero critical (crash) bugs
- Zero high-severity gameplay-blocking bugs
- Performance targets met on all target platforms
- Platform certification requirements met (console TRCs/XRs, platform store requirements)
- All legal and ratings requirements met (ESRB, PEGI, age gates)
- Day-one patch scope defined (if applicable)
- Server infrastructure tested at expected launch load (if applicable)

**Documentation expected:**
- Bug database with all issues triaged and either fixed or deferred-to-patch
- Final performance report per platform
- Certification submission checklist
- Launch day operations plan

### Milestone 8: Gold Master / Launch

**Gate question**: "Ship it?"

**Gate criteria:**
- Release Candidate approved by all leads
- Platform certification passed
- Store pages finalized (descriptions, screenshots, trailers)
- Marketing materials ready
- Community/support infrastructure ready (forums, bug reporting, social media)
- Day-one patch built and tested (if applicable)

### Milestone 9: Live / Post-Launch

This is not a single gate but an ongoing phase. Key activities:

- Monitor crash reports, player feedback, and telemetry
- Release hotfix patches for critical issues within 24-72 hours
- First content update within 4-8 weeks to maintain player engagement
- Roadmap communication to community
- Live service operations (if applicable): seasons, battle passes, events, balance patches

### Milestone Duration by Project Scale

| Milestone | Indie (6-18 mo) | AA (18-36 mo) | AAA (36-60+ mo) |
|-----------|:--:|:--:|:--:|
| Concept | 1-2 wk | 2-4 wk | 4-8 wk |
| Pre-Production | 2-4 wk | 4-12 wk | 8-24 wk |
| Vertical Slice | 4-8 wk | 8-16 wk | 12-24 wk |
| First Playable | 4-8 wk | 8-16 wk | 16-32 wk |
| Alpha | 4-12 wk | 12-24 wk | 24-52 wk |
| Beta | 2-4 wk | 4-12 wk | 12-24 wk |
| Release Candidate | 1-2 wk | 2-4 wk | 4-8 wk |

### Common Milestone Anti-Patterns

**The Phantom Alpha**: The team declares "Alpha" but entire systems are still being designed. If features are still being added, it is not Alpha — it is still in production. Mislabeling milestones gives false schedule confidence.

**The Never-Ending Beta**: Content keeps being added after Beta because "just one more thing." Every addition resets QA testing. Content lock means content lock.

**The Missing Vertical Slice**: Skipping the vertical slice to "save time" and jumping straight to full production. This is the single most common cause of game cancellations — the team discovers the game is not fun only after spending most of the budget.

**Gate Criteria Inflation**: Making gates so strict that nothing passes, or so loose that everything passes. Gates should be difficult but achievable — their purpose is to catch real problems, not to create bureaucracy.

**The Orphan Milestone**: Defining milestones without assigning ownership for the gate review. Every milestone needs a named reviewer with authority to enforce the go/no-go decision.
