---
name: game-localization
description: String management, font atlas pipeline, text expansion, subtitle standards, VO localization, culturalization, and LQA methodology
topics: [game-dev, localization, l10n, lqa, fonts, rtl]
---

Game localization is not translation — it is the engineering and cultural adaptation required to make a game feel native in every target market. A translated string that does not fit the UI, a font that cannot render Chinese characters, a gesture that is offensive in Brazil, or a subtitle that flashes too fast for reading speed norms — each of these failures breaks immersion and signals to the player that they are an afterthought. Localization touches every layer of the stack: string management, rendering, audio, UI layout, cultural review, and QA. The cost of retrofitting localization into a game that was not designed for it is 3-5x higher than building it in from the start.

## Summary

### String Management Systems

All player-facing text must be externalized into string tables, never hardcoded. The string management pipeline has three components: authoring (developers write string IDs), translation (translators produce localized variants), and integration (the game loads the correct variant at runtime).

**String ID conventions:**
- Use hierarchical, descriptive IDs: `ui.main_menu.play_button`, `dialogue.npc_blacksmith.greeting_01`
- Never use the English text as the key — English text changes during development, breaking all translations
- Prefix system strings vs content strings: `sys.error.connection_lost` vs `content.quest.dragon_slayer.desc`
- Include context hints in comments: `/* Button label, max 12 chars */` helps translators make appropriate choices

**Text expansion rules by language:**
- English (source) → German: +30% average, up to +50% for short strings
- English → Finnish: +30-40%
- English → French: +15-20%
- English → Spanish: +15-25%
- English → Japanese: -10-30% (fewer characters but may need more vertical space)
- English → Chinese (Simplified): -30-50% in character count but wider individual glyphs
- English → Korean: -10-20% character count
- English → Arabic/Hebrew (RTL): Similar length but requires full layout mirroring

UI must accommodate the worst-case expansion. A button designed to fit "Play" (4 chars) must also fit "Spielen" (7 chars, German) without truncation or overflow.

### Font Atlas and Rendering

Latin-alphabet games can use a single font atlas with 200-300 glyphs. CJK (Chinese, Japanese, Korean) localization requires thousands of glyphs, fundamentally changing the font rendering strategy.

**CJK considerations:**
- Japanese requires ~2,200 Joyo kanji + hiragana + katakana (~3,000 glyphs minimum)
- Chinese Simplified requires ~6,500 common characters (GB2312 set) for full coverage
- Korean Hangul has 11,172 possible syllable blocks; pre-composed sets of ~2,500 cover 99% of text
- Static font atlases at this scale consume 16-64 MB of texture memory
- Dynamic font rendering (runtime rasterization with caching) is preferred for CJK — render glyphs on demand and cache to atlas

**RTL (Right-to-Left) languages:**
- Arabic and Hebrew text flows right-to-left, but numbers and Latin text embedded within flow left-to-right (bidirectional text)
- UI layouts must mirror: scrollbars move to the left, progress bars fill right-to-left, navigation reverses
- Arabic requires contextual shaping — each letter has up to 4 forms depending on position (initial, medial, final, isolated)
- Arabic text cannot simply be reversed string — a shaping engine (HarfBuzz, ICU) must process it

### Subtitle and Caption Standards

Subtitle presentation has measurable impact on comprehension and player experience. Industry standards from film and broadcast apply, with game-specific additions.

## Deep Guidance

### String Extraction and Translation Pipeline

The localization pipeline begins with string extraction and ends with integrated, tested builds in every supported language.

**Step 1: String extraction**

All strings live in a structured format that supports translator context:

```json
{
  "strings": [
    {
      "id": "ui.hud.health_label",
      "source": "Health",
      "context": "HUD label next to health bar. Max 10 characters.",
      "max_length": 10,
      "tags": ["ui", "hud"],
      "screenshot": "assets/loc_screenshots/hud_health.png"
    },
    {
      "id": "ui.shop.buy_button",
      "source": "Buy Now",
      "context": "Purchase button in item shop. Should convey urgency.",
      "max_length": 15,
      "tags": ["ui", "shop", "monetization"],
      "screenshot": "assets/loc_screenshots/shop_buy.png"
    },
    {
      "id": "dialogue.guard.warning_01",
      "source": "Halt! No one passes without the captain's seal.",
      "context": "Spoken by gate guard NPC. Stern, military tone.",
      "max_length": null,
      "tags": ["dialogue", "npc"],
      "voice_acted": true,
      "character": "Guard Captain Aldric"
    }
  ]
}
```

**Step 2: Translation Management System (TMS)**

Use a TMS (Crowdin, Lokalise, Phrase, memoQ) rather than spreadsheets. TMS platforms provide:
- Translation memory (TM) — previously translated strings are suggested automatically, ensuring consistency and reducing cost
- Glossary enforcement — key terms (character names, game mechanics, UI labels) are locked to approved translations
- In-context editing — translators see the string alongside a screenshot of where it appears in-game
- Pseudo-localization — generates fake translations that simulate text expansion and character coverage for testing before real translations arrive
- Branch-aware workflows — translations track the development branch, merge with code, and flag conflicts

**Step 3: Integration and build**

```bash
#!/usr/bin/env bash
# loc-build.sh — Pull translations and build localized assets
set -euo pipefail

TMS_PROJECT_ID="${TMS_PROJECT_ID:?Set TMS_PROJECT_ID}"
SUPPORTED_LANGS=("en" "de" "fr" "es" "ja" "ko" "zh-Hans" "zh-Hant" "ar" "pt-BR" "ru")

echo "=== Pulling translations from TMS ==="
for lang in "${SUPPORTED_LANGS[@]}"; do
  echo "  Pulling ${lang}..."
  tms-cli pull --project "$TMS_PROJECT_ID" \
    --language "$lang" \
    --output "assets/localization/${lang}.json" \
    --format structured-json
done

echo "=== Validating translations ==="
for lang in "${SUPPORTED_LANGS[@]}"; do
  echo "  Validating ${lang}..."
  # Check for missing translations
  loc-validator check-completeness \
    --source "assets/localization/en.json" \
    --target "assets/localization/${lang}.json" \
    --fail-on-missing

  # Check max_length constraints
  loc-validator check-length \
    --target "assets/localization/${lang}.json" \
    --fail-on-overflow

  # Check for placeholder consistency ({name}, {count}, etc.)
  loc-validator check-placeholders \
    --source "assets/localization/en.json" \
    --target "assets/localization/${lang}.json"
done

echo "=== Building font atlases ==="
for lang in "${SUPPORTED_LANGS[@]}"; do
  font-builder build \
    --language "$lang" \
    --strings "assets/localization/${lang}.json" \
    --output "assets/fonts/${lang}_atlas.png" \
    --sdf-mode
done

echo "=== Localization build complete ==="
```

### Font Rendering Pipeline

For CJK languages, static pre-baked font atlases are impractical. The standard approach is a dynamic Signed Distance Field (SDF) font renderer:

1. **Pre-seed the atlas** — At load time, rasterize the 500 most common characters for the target language into an SDF texture atlas
2. **Runtime rasterization** — When the text renderer encounters a glyph not in the atlas, rasterize it from the TrueType/OpenType font file, generate the SDF, and pack it into the atlas
3. **Atlas management** — Use a shelf-packing algorithm. When the atlas fills (typically 2048x2048 or 4096x4096), evict least-recently-used glyphs
4. **Fallback fonts** — If the primary font lacks a glyph (e.g., a Latin font missing CJK characters), fall back to Noto Sans CJK or a platform system font

SDF fonts scale cleanly at any size without regeneration, support outlines and drop shadows in the shader, and consume less memory than bitmap fonts at equivalent quality.

**Memory budgets for font atlases:**
- Latin-only game: 1-2 MB (one 1024x1024 RGBA atlas)
- CJK support: 8-16 MB (one 4096x4096 atlas with dynamic packing)
- Full global language support including Arabic shaping: 16-32 MB

### RTL Implementation Guide

Right-to-left support requires changes at three levels: text rendering, UI layout, and content design.

**Text rendering:**
- Integrate a Unicode bidirectional algorithm (UAX #9) implementation — ICU or FriBidi
- The algorithm determines the correct visual order for mixed-direction text (Arabic words interspersed with English brand names and numbers)
- Arabic contextual shaping: use HarfBuzz or platform-native text shaping. Each Arabic letter changes form based on its neighbors. Simple string reversal produces garbage.
- Diacritical marks (tashkeel) in Arabic must be positioned correctly above/below base characters

**UI layout mirroring:**
- Horizontal layouts reverse: left-aligned text becomes right-aligned, left-margin becomes right-margin
- Navigation flows reverse: "next" arrows point left, "back" arrows point right
- Progress bars and sliders fill from right to left
- Scrollbars move to the left side
- Icons that convey direction (arrows, pointing hands) must be mirrored; icons that do not convey direction (a clock, a star) must NOT be mirrored
- Implement a layout direction flag (`isRTL`) that UI containers check when positioning children

**Exceptions to mirroring:**
- Phone number fields stay LTR (numbers are universal)
- Timestamps remain in local convention
- Media playback controls (play, fast-forward) are not mirrored — these are universal symbols
- Latin text within an RTL context keeps its LTR direction (handled by the bidi algorithm)

### Subtitle and Caption Standards

Subtitle presentation follows established readability guidelines:

**Timing:**
- Minimum display time: 1.5 seconds (even for very short text)
- Maximum display time: 7 seconds per subtitle block
- Reading speed: 15-20 characters per second for adults; 12-15 for children's games
- Gap between consecutive subtitles: minimum 0.25 seconds (allows the eye to register a change)

**Formatting:**
- Maximum 2 lines per subtitle block
- Maximum 42 characters per line (including spaces)
- Use sentence case, not ALL CAPS (all caps reduces readability by 10-15%)
- Speaker identification for off-screen characters: brackets or colored text
- Italics for off-screen dialogue, narration, or internal monologue
- Sound effect descriptions in square brackets for accessibility: `[explosion]`, `[footsteps approaching]`

**Positioning:**
- Default position: bottom-center of screen, above any HUD elements
- When a HUD element overlaps, subtitles shift upward dynamically
- For VR: subtitles are world-locked (not head-locked) at 2-3 meters from the player, slightly below eye level
- Speaker-specific positioning: in multiplayer or scenes with multiple speakers, position subtitles near the speaker

### Voice-Over Localization

VO localization is the most expensive and complex localization task. Two strategies exist:

**Full dubbing:**
- Record all dialogue in every target language
- Requires casting voice actors for each language — matching tone, age, and personality of the original performance
- Lip-sync must be re-targeted (a major animation cost) or the game uses faceless/masked characters to avoid the issue
- Cost: $0.30-$0.80 per word per language for professional studio recording
- Timeline: 4-8 weeks per language after scripts are locked
- Best for story-driven games (RPGs, adventure games) where VO is central to the experience

**Subtitles only (original VO):**
- Keep the original language VO; translate text only
- Dramatically cheaper and faster
- Players hear the original performance, which is often preferred for stylized games (anime-style, distinct cultural settings)
- Adequate for most indie and AA games, and for languages with smaller markets

**Hybrid approach:**
- Dub into the 3-5 largest markets (English, Japanese, French, German, Spanish) and subtitle the rest
- This is the AAA standard for cost-effective global reach

**VO production workflow:**
1. Lock dialogue scripts (no changes after this point without re-recording)
2. Provide translators with audio reference files so they hear the original delivery
3. Translators produce adapted scripts that match lip-sync timing where possible
4. Casting directors in each territory audition actors against original character profiles
5. Record in professional studios with game audio direction (context, emotion, pacing)
6. Integrate recorded audio, verify lip-sync, QA dialogue triggers

### Culturalization

Culturalization goes beyond translation to address cultural sensitivities:

**Content to review:**
- **Gestures**: Thumbs-up is offensive in parts of the Middle East; the OK hand sign is offensive in Brazil
- **Colors**: White symbolizes death/mourning in East Asia; red symbolizes luck in China but danger in Western cultures
- **Symbols**: Religious symbols, national flags, and political imagery require careful handling — some are legally restricted (German anti-Nazi laws, Chinese content restrictions)
- **Numbers**: 4 is unlucky in East Asia (sounds like "death" in Mandarin/Japanese); 13 is unlucky in Western cultures
- **Historical references**: Colonial, wartime, and territorial references can provoke strong reactions — consult regional specialists
- **Body exposure**: Standards vary drastically; Middle Eastern and Chinese markets have stricter modesty requirements
- **Gambling imagery**: Loot boxes, slot machines, and gacha mechanics face legal restrictions in Belgium, Netherlands, and increasingly other markets

**Rating board variations:**
- A game rated T (Teen) by ESRB may receive a different rating from PEGI, CERO (Japan), or GRAC (Korea) based on cultural sensitivity differences
- Blood color (red vs green), alcohol references, and sexual content have different thresholds per region
- Some markets require a separate content review authority (China's NPPA approval process can take 6+ months)

### Linguistic Quality Assurance (LQA)

LQA is dedicated testing of every localized build, performed by native speakers who are also gamers.

**LQA methodology:**

```
Phase 1: Text-in-context review (3-5 days per language)
  - Play through the entire game in each language
  - Flag: truncation, overflow, missing translations, placeholder errors
  - Flag: tone/register mismatches (formal where casual is needed)
  - Flag: inconsistent terminology (same item called different names)
  - Flag: gender/number agreement errors in gendered languages

Phase 2: Audio review (2-3 days per dubbed language)
  - Verify all VO lines trigger correctly
  - Check lip-sync alignment
  - Flag mispronunciations of character/place names
  - Verify subtitle-to-audio synchronization

Phase 3: Functional review (1-2 days per language)
  - Test text input (player names, chat) in each language's character set
  - Test sorting (alphabetical order differs: Swedish å comes after z)
  - Test date/time/number formatting (DD/MM vs MM/DD, comma vs period decimal)
  - Test currency formatting ($1,000.00 vs 1.000,00 €)

Phase 4: Culturalization review (1-2 days per region)
  - Review all visual content (textures, UI art, cutscenes) for cultural issues
  - Verify map/territory representations do not trigger geopolitical disputes
  - Check that monetization flows comply with local regulations
```

**Bug severity for localization:**
- **Critical**: Game crashes due to localization data; hard-coded English blocks progression
- **Major**: Truncated text hides gameplay information; wrong translation changes meaning
- **Minor**: Awkward phrasing; inconsistent but understandable terminology
- **Cosmetic**: Slightly imperfect formatting; minor spacing issues

### Pseudo-Localization for Early Testing

Before real translations are available, use pseudo-localization to catch localization bugs during development:

```
Original:  "Health: {0}/{1}"
Pseudo-FR: "[Ĥéåļŧĥ: {0}/{1}        ]"
Pseudo-AR: "[‫صحة‬: {0}/{1}]"  (with RTL marker)
Pseudo-JP: "[ヘルス: {0}/{1}]"
```

Pseudo-localization rules:
- Replace ASCII characters with accented Unicode equivalents (catches encoding bugs)
- Expand string length by 30-40% with padding (catches truncation bugs)
- Wrap strings in brackets `[...]` (catches hardcoded strings that were not externalized — they will not have brackets)
- Add RTL markers for Arabic pseudo-loc (catches layout mirroring issues)

Run pseudo-localized builds in CI. If any UI element overflows, truncates, or displays raw string IDs, the build should warn. This catches 80% of localization bugs before a single translator touches the project.
