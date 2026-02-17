<!-- scaffold:design-system v1 2026-02-17 -->
# Design System

Visual design system for the Scaffold pipeline dashboard. All CSS lives in `lib/dashboard-theme.css` and is embedded into the generated HTML by `scripts/generate-dashboard.sh`.

**Aesthetic: "Precision Industrial"** — Swiss-typographic control room. Clean surfaces, intentional color, monospace data readouts, and subtle motion that rewards attention.

## 1. Quick Reference

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--bg` | `#f5f6fa` | `#0f1117` | Page background |
| `--bg-card` | `#ffffff` | `#1a1d2e` | Card surfaces |
| `--accent` | `#4f46e5` | `#818cf8` | Primary interactive color |
| `--green` | `#059669` | `#34d399` | Completed status |
| `--blue` | `#2563eb` | `#60a5fa` | Likely-completed status |
| `--yellow` | `#d97706` | `#fbbf24` | Warnings, blocked items |
| `--gray` | `#9ca3af` | `#6b7294` | Skipped status |
| `--radius` | `10px` | `10px` | Default border radius |
| `--font-sans` | System stack | System stack | Body text |
| `--font-mono` | SF Mono stack | SF Mono stack | Data, commands, counts |

## 2. Design Tokens

### 2.1 Color Palette

#### Light Mode

| Token | Value | Purpose |
|-------|-------|---------|
| `--bg` | `#f5f6fa` | Page background (cool blue-tinted white) |
| `--bg-card` | `#ffffff` | Card and panel surfaces |
| `--bg-hover` | `#eef0f6` | Hover state for interactive surfaces |
| `--bg-inset` | `#e8eaf2` | Inset/recessed elements (copy buttons, inputs) |
| `--text` | `#1a1d2e` | Primary text (deep navy-black) |
| `--text-muted` | `#6b7294` | Secondary text (descriptions, labels) |
| `--text-faint` | `#9ba1c0` | Tertiary text (metadata, timestamps) |
| `--border` | `#dde0ed` | Default borders |
| `--border-light` | `#eceef5` | Subtle dividers (footer border) |
| `--accent` | `#4f46e5` | Primary accent (indigo) |
| `--accent-hover` | `#4338ca` | Accent hover state (deeper indigo) |
| `--accent-glow` | `rgba(79,70,229,0.10)` | Accent background wash |

#### Dark Mode

| Token | Value | Purpose |
|-------|-------|---------|
| `--bg` | `#0f1117` | Page background (near-black with blue undertone) |
| `--bg-card` | `#1a1d2e` | Card surfaces (dark navy) |
| `--bg-hover` | `#252940` | Hover state |
| `--bg-inset` | `#141724` | Inset elements |
| `--text` | `#e2e5f0` | Primary text (soft white) |
| `--text-muted` | `#7c82a8` | Secondary text (muted lavender) |
| `--text-faint` | `#555c80` | Tertiary text |
| `--border` | `#2a2f45` | Default borders |
| `--border-light` | `#21253a` | Subtle dividers |
| `--accent` | `#818cf8` | Primary accent (lighter indigo) |
| `--accent-hover` | `#a5b4fc` | Accent hover (pastel indigo) |
| `--accent-glow` | `rgba(129,140,248,0.12)` | Accent background wash |

#### Status Colors (both modes)

| Status | Light | Dark | Background (Light) | Background (Dark) |
|--------|-------|------|-------------------|--------------------|
| Completed | `#059669` | `#34d399` | `#ecfdf5` | `rgba(6,78,59,0.25)` |
| Likely Done | `#2563eb` | `#60a5fa` | `#eff6ff` | `rgba(30,58,95,0.30)` |
| Warning/Blocked | `#d97706` | `#fbbf24` | `#fffbeb` | `rgba(120,53,15,0.25)` |
| Skipped | `#9ca3af` | `#6b7294` | `#f3f4f6` | `#252940` |

### 2.2 Typography

**Font stacks** (system fonts only — no CDN dependencies):

| Token | Value | Usage |
|-------|-------|-------|
| `--font-sans` | `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif` | Body text, headings |
| `--font-mono` | `"SF Mono", "Cascadia Code", "Fira Code", "JetBrains Mono", Menlo, Consolas, monospace` | Commands, counts, step numbers |

**Size scale:**

| Token | Value | Usage |
|-------|-------|-------|
| `--text-xs` | `0.75rem` (12px) | Badges, metadata, step numbers |
| `--text-sm` | `0.8125rem` (13px) | Descriptions, copy buttons |
| `--text-base` | `0.9375rem` (15px) | Body text, prompt names |
| `--text-lg` | `1.125rem` (18px) | Section headings (h2) |
| `--text-xl` | `1.375rem` (22px) | Reserved for emphasis |
| `--text-2xl` | `1.75rem` (28px) | Page title (h1), card numbers |

**Line heights:**

| Token | Value | Usage |
|-------|-------|-------|
| `--lh-tight` | `1.25` | Headings, card numbers |
| `--lh-normal` | `1.5` | Body text |
| `--lh-relaxed` | `1.625` | Descriptions, long-form |

**Weights:**

| Token | Value | Usage |
|-------|-------|-------|
| `--fw-normal` | `400` | Body text |
| `--fw-medium` | `500` | Labels, metadata |
| `--fw-semi` | `600` | Headings, prompt names |
| `--fw-bold` | `700` | Page title, card numbers |

**Letter spacing:**

| Token | Value | Usage |
|-------|-------|-------|
| `--ls-tight` | `-0.01em` | Headings, large text |
| `--ls-wide` | `0.025em` | Uppercase labels, badges, metadata |

### 2.3 Spacing Scale

4px base unit. All spacing uses these tokens:

| Token | Value | Common usage |
|-------|-------|-------------|
| `--sp-1` | `4px` | Minimal gap (dot margin, inline spacing) |
| `--sp-2` | `8px` | Tight gap (badge padding, phase header gap) |
| `--sp-3` | `12px` | Card gap, prompt card padding |
| `--sp-4` | `16px` | Card inner padding, section gap |
| `--sp-5` | `20px` | Banner padding |
| `--sp-6` | `24px` | Section margin-bottom, page side padding |
| `--sp-8` | `32px` | Page top/bottom padding |
| `--sp-10` | `40px` | Major section separation (standalone, footer) |

### 2.4 Borders & Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius` | `10px` | Cards, banners, panels |
| `--radius-sm` | `6px` | Buttons, inline elements, code blocks |
| `--border` | varies | Standard element borders |
| `--border-light` | varies | Subtle dividers (footer) |

Borders are always 1px solid, except:
- Phase headers: 2px solid bottom border
- Next banner: 1px + 4px left accent border

### 2.5 Shadows

Multi-layer shadows for natural depth:

| Token | Usage |
|-------|-------|
| `--shadow-sm` | Prompt cards at rest |
| `--shadow` | Summary cards at rest, prompt cards on hover |
| `--shadow-md` | Cards on hover (elevated) |
| `--shadow-lg` | Reserved for modals/overlays |

### 2.6 Layout

| Token | Value | Purpose |
|-------|-------|---------|
| `--max-w` | `960px` | Content max-width |
| `--page-pad` | `24px` | Horizontal padding |

The `.wrap` container centers content and applies max-width + padding. All dashboard content lives inside `.wrap`.

## 3. Components

### 3.1 Progress Bar

**Classes:** `.progress-bar`, `.seg-done`, `.seg-likely`, `.seg-skip`

Horizontal bar showing pipeline completion. Segments are gradient-filled with a subtle glow for emphasis.

```html
<div class="progress-bar">
    <div class="seg-done" style="width:40%"></div>
    <div class="seg-likely" style="width:15%"></div>
    <div class="seg-skip" style="width:5%"></div>
</div>
```

**Tokens used:** `--progress-bg`, `--green`, `--blue`, `--gray`

**Design details:**
- Height: `var(--progress-h)` (10px)
- Fully rounded (99px radius) for a "rail" appearance
- Inset box-shadow for recessed track feel
- Each segment has a `linear-gradient(135deg, ...)` for dimensionality
- Done and likely segments have a colored `box-shadow` glow

### 3.2 Summary Cards

**Classes:** `.cards` (grid), `.card`, `.card-num`, `.card-lbl`

Grid of metric cards showing completion counts.

```html
<div class="cards">
    <div class="card">
        <div class="card-num" style="color:var(--green)">12</div>
        <div class="card-lbl">Completed</div>
    </div>
</div>
```

**Tokens used:** `--bg-card`, `--border`, `--radius`, `--shadow`, `--shadow-md`

**Design details:**
- Auto-fit grid: `minmax(130px, 1fr)`
- Numbers use monospace font for alignment
- Hover: lifts 1px with enhanced shadow
- Labels are uppercase with wide letter-spacing

### 3.3 What's Next Banner

**Classes:** `.next-banner`, `.next-cmd`

Highlighted banner showing the next recommended pipeline step.

```html
<div class="next-banner">
    <h2>What's Next</h2>
    <p>Description of the next step</p>
    <div class="next-cmd" data-cmd="/scaffold:slug">
        <code>/scaffold:slug</code>
        <button onclick="copyCmd(this)">Copy</button>
    </div>
</div>
```

**Tokens used:** `--next-bg`, `--next-border`, `--next-glow`, `--accent`

**Design details:**
- 4px left accent border with pulse animation (`pulse-border` keyframes)
- Outer glow via `box-shadow: 0 0 0 1px var(--next-glow)`
- Heading is uppercase with wide letter-spacing
- Command block uses card background with monospace font

### 3.4 Phase Header (Collapsible)

**Classes:** `.phase`, `.phase-hdr`, `.phase-hdr.closed`, `.arr`, `.phase-cnt`

Collapsible section headers for pipeline phases.

```html
<div class="phase">
    <div class="phase-hdr" onclick="togglePhase(this)">
        <span class="arr">&#9660;</span>
        <h2 style="margin:0">Phase Name</h2>
        <span class="phase-cnt">3/5</span>
    </div>
    <div class="plist">...</div>
</div>
```

**Tokens used:** `--border`, `--accent`, `--text-faint`

**Design details:**
- 2px bottom border (heavier than cards for hierarchy)
- Hover: border and heading color transition to accent
- Arrow rotates -90deg when closed (0.2s ease)
- Count uses monospace font, aligned right

### 3.5 Prompt Card

**Classes:** `.pcard`, `.pinfo`, `.pname`, `.pstep`, `.pdesc`, `.pdeps`

Individual prompt cards within phase sections.

```html
<div class="pcard">
    <div class="dot st-completed" title="Completed"></div>
    <div class="pinfo">
        <span class="pname">create-prd</span>
        <span class="pstep">Step 1</span>
        <div class="pdesc">Create a product requirements document</div>
    </div>
    <div class="pcmd" onclick="copyCmd(this)" data-cmd="/scaffold:create-prd">/scaffold:create-prd</div>
</div>
```

**Tokens used:** `--bg-card`, `--border`, `--radius`, `--shadow-sm`, `--shadow`

**Design details:**
- 3-column grid: `auto 1fr auto` (dot, info, command)
- Hover: lifts 1px, shadow deepens, border gets accent glow
- Step number uses monospace with faint color

### 3.6 Status Dot

**Classes:** `.dot`, `.st-completed`, `.st-likely-completed`, `.st-skipped`, `.st-pending`

10px colored circles indicating prompt status.

**Tokens used:** Status color tokens + their `-bg` variants

**Design details:**
- 3px ring effect via `box-shadow: 0 0 0 3px var(--*-bg)`
- Ring color matches status background for subtle halo
- Pending uses border color (neutral, no ring emphasis)

### 3.7 Badge

**Classes:** `.badge`, `.badge-optional`

Pill-shaped labels for profile type and optional markers.

```html
<span class="badge">web-app</span>
<span class="badge badge-optional">optional</span>
```

**Tokens used:** `--accent`, `--yellow`, `--yellow-bg`, `--yellow-border`

**Design details:**
- 99px radius for full pill shape
- Uppercase, extra-small text with wide letter-spacing
- Default: solid accent background, white text
- Optional variant: yellow background with yellow border outline

### 3.8 Copy Command Button

**Classes:** `.pcmd`, `.pcmd.copied`

Monospace command text that copies to clipboard on click.

```html
<div class="pcmd" onclick="copyCmd(this)" data-cmd="/scaffold:slug">/scaffold:slug</div>
```

**Tokens used:** `--bg-inset`, `--border`, `--accent`, `--accent-glow`, `--green`, `--green-bg`

**Design details:**
- Inset background differentiates from card surface
- Hover: border and text transition to accent, background gets accent glow
- Copied state: green border and text with green background (1.5s auto-reset)
- Monospace font with wide letter-spacing

### 3.9 Standalone Commands Section

**Classes:** `.ongoing`

Section listing always-available commands (not part of the pipeline sequence).

**Design details:**
- Extra top margin (`--sp-10`) separates from pipeline content
- Heading is styled differently: uppercase, smaller, muted — signals secondary content
- Uses same `.pcard` components for consistency

### 3.10 Footer

**Classes:** `.footer`

Minimal footer with generation attribution.

**Design details:**
- Centered, extra-small text in faint color
- Light top border for separation
- Uppercase with wide letter-spacing

## 4. Interaction Patterns

### Hover Effects

All interactive surfaces respond to hover:
- **Cards**: `translateY(-1px)` lift + shadow deepening (0.15s ease)
- **Phase headers**: border and text color transition to accent
- **Copy buttons**: border and text transition to accent + glow background
- **Prompt cards**: lift + shadow + subtle border glow

### Copy Feedback

1. User clicks `.pcmd` element
2. Command text copied to clipboard via `navigator.clipboard`
3. `.copied` class added — green border and text
4. Class removed after 1500ms

### Collapsible Sections

1. Click `.phase-hdr` triggers `togglePhase()`
2. `.closed` class toggled on header (rotates arrow)
3. `.hidden` class toggled on next sibling (`.plist`)

## 5. Dark Mode

**Mechanism:** `@media (prefers-color-scheme: dark)` overrides `:root` custom properties. No JavaScript, no toggle — follows system preference.

**Philosophy:**
- Backgrounds go dramatically darker (not just inverted)
- Text lightens but stays slightly warm (not pure white)
- Accent colors shift lighter for contrast on dark surfaces
- Status colors shift to brighter/more saturated variants
- Shadows become much deeper (higher opacity blacks)
- Status backgrounds use translucent `rgba()` to blend with dark card surfaces

## 6. Extending the Dashboard

### 6.1 Adding a New Token

1. Add the token to `:root` in the light mode section of `lib/dashboard-theme.css`
2. Add the dark mode override in the `@media (prefers-color-scheme: dark)` block
3. Document both values in this file (section 2)
4. Reference via `var(--token-name)` in component styles

### 6.2 Adding a New Component

1. Add component styles to the appropriate section in `lib/dashboard-theme.css` (follow the section comment pattern)
2. Use only existing design tokens — if new tokens are needed, add them first (step 6.1)
3. Add the HTML generation to the JS in `scripts/generate-dashboard.sh`
4. Document the component in this file (section 3) with class names, HTML structure, and tokens used

### 6.3 Adding a New Status Color

1. Add `--<status>`, `--<status>-bg`, and `--<status>-border` tokens (light + dark)
2. Add `.st-<status>` dot style with matching `box-shadow` ring
3. Update `stLbl()` in the JS to include the display label
4. Document in section 2.1 (status colors table)

## 7. Do's and Don'ts

**Do:**
- Use CSS custom properties for all values (colors, spacing, sizes)
- Follow the existing token naming pattern (`--category-variant`)
- Test changes in both light and dark mode
- Keep the generated HTML self-contained (inline everything)
- Use transitions for interactive state changes (0.15s ease default)

**Don't:**
- Hardcode hex colors, pixel values, or font names in component styles
- Add external resource references (CDN fonts, stylesheets, scripts)
- Use `!important` — restructure selectors instead
- Add JavaScript-driven dark mode — rely on `prefers-color-scheme`
- Create new spacing values outside the `--sp-*` scale

## 8. Accessibility Notes

- **Color is not the only indicator**: Status dots use title attributes for screen readers; status is also shown in context (section counts, labels)
- **Contrast**: All text/background combinations meet WCAG AA (4.5:1 for body, 3:1 for large text) in both modes
- **Interactive targets**: Copy buttons and phase headers have adequate padding for touch targets
- **Motion**: The pulse animation is subtle (opacity only) and does not cause layout shift; users with `prefers-reduced-motion` could be supported by adding a media query
- **Keyboard**: Copy buttons are `div` elements with `onclick` — a future improvement would be to use `button` elements with proper focus states
