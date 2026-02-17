---
description: "Create a cohesive design system for frontend"
long-description: "Generates docs/design-system.md with color palettes, typography scales, spacing tokens, and component patterns for consistent frontend styling."
---

Create a cohesive design system for this project that AI agents will use for all frontend work. The goal is a professional, polished UI without requiring design expertise from me.

Review docs/tech-stack.md to understand our frontend framework and any UI libraries already chosen. Review docs/plan.md to understand the application's purpose and target users.

I have no design experience, so I'm relying on you to make good choices and explain them simply.

## Mode Detection

Before starting, check if `docs/design-system.md` already exists:

**If the file does NOT exist → FRESH MODE**: Skip to the next section and create from scratch.

**If the file exists → UPDATE MODE**:
1. **Read & analyze**: Read the existing document completely. Check for a tracking comment on line 1: `<!-- scaffold:design-system v<ver> <date> -->`. If absent, treat as legacy/manual — be extra conservative.
2. **Diff against current structure**: Compare the existing document's sections against what this prompt would produce fresh. Categorize every piece of content:
   - **ADD** — Required by current prompt but missing from existing doc
   - **RESTRUCTURE** — Exists but doesn't match current prompt's structure or best practices
   - **PRESERVE** — Project-specific decisions, rationale, and customizations
3. **Cross-doc consistency**: Read related docs (`docs/tech-stack.md`, `docs/plan.md`) and verify updates won't contradict them. Skip any that don't exist yet.
4. **Preview changes**: Present the user a summary:
   | Action | Section | Detail |
   |--------|---------|--------|
   | ADD | ... | ... |
   | RESTRUCTURE | ... | ... |
   | PRESERVE | ... | ... |
   If >60% of content is unrecognized PRESERVE, note: "Document has been significantly customized. Update will add missing sections but won't force restructuring."
   Wait for user approval before proceeding.
5. **Execute update**: Restructure to match current prompt's layout. Preserve all project-specific content. Add missing sections with project-appropriate content (using existing docs as context).
6. **Update tracking comment**: Add/update on line 1: `<!-- scaffold:design-system v<ver> <date> -->`
7. **Post-update summary**: Report sections added, sections restructured (with what changed), content preserved, and any cross-doc issues found.

**In both modes**, follow all instructions below — update mode starts from existing content rather than a blank slate.

### Update Mode Specifics
- **Primary output**: `docs/design-system.md`
- **Secondary output**: Theme config files (tailwind.config.js, theme.ts, etc.)
- **Preserve**: All token values (colors, fonts, spacing), theme configuration, component pattern decisions, accessibility choices
- **Related docs**: `docs/tech-stack.md`, `docs/plan.md`
- **Special rules**: Never change color values, font families, or spacing scales without user approval — these define the visual identity. Preserve all theme config file customizations.

## Objectives

1. Define a complete visual language (colors, typography, spacing, etc.)
2. Configure our UI framework/library with these design tokens
3. Create reusable component patterns
4. Document everything so all AI agents build consistent UI
5. Show me examples so I can approve the direction

## What to Create

### 1. Design Foundation

Research modern design best practices and create a cohesive system:

**Color Palette**
- Primary color (main brand/action color)
- Secondary color (supporting color)
- Neutral colors (grays for text, backgrounds, borders)
- Semantic colors (success/green, warning/yellow, error/red, info/blue)
- Background colors (page, card, input)
- Text colors (primary, secondary, muted, inverse)

Provide specific hex/RGB values. Colors should:
- Have sufficient contrast for accessibility (WCAG AA minimum)
- Work well together (use color theory, not random picks)
- Feel appropriate for the application's purpose (per plan.md)

**Typography**
- Font family (use a professional, readable system font or Google Font)
- Font sizes scale (xs, sm, base, lg, xl, 2xl, 3xl, 4xl)
- Font weights (normal, medium, semibold, bold)
- Line heights
- Heading styles (h1-h6)
- Body text styles

**Spacing Scale**
- Consistent spacing units (e.g., 4px base: 4, 8, 12, 16, 24, 32, 48, 64)
- When to use each size (tight, normal, loose spacing contexts)

**Border Radius**
- Radius scale (none, sm, md, lg, full)
- Which radius to use where (buttons, cards, inputs, avatars)

**Shadows**
- Shadow scale (sm, md, lg, xl)
- When to use shadows (elevation, focus, hover)

### 2. Component Patterns

Define the standard appearance for common components. For each, specify exact styles:

**Buttons**
- Primary (main actions)
- Secondary (supporting actions)
- Outline/Ghost (subtle actions)
- Destructive (delete, remove)
- Sizes (sm, md, lg)
- States (default, hover, active, disabled, loading)

**Form Elements**
- Text inputs
- Textareas
- Selects/dropdowns
- Checkboxes and radios
- Labels
- Help text
- Error states and messages

**Cards**
- Default card container
- Interactive/clickable cards
- Card with header/footer

**Feedback**
- Toast notifications
- Alert banners
- Empty states
- Loading states (spinners, skeletons)
- Error pages (404, 500)

**Navigation**
- Header/navbar
- Sidebar (if applicable)
- Breadcrumbs
- Tabs
- Pagination

**Data Display**
- Tables
- Lists
- Badges/tags
- Avatars
- Stats/metrics

### 3. Layout System

Define standard layouts:
- Max content width
- Page padding/margins
- Grid system (if using)
- Responsive breakpoints (mobile, tablet, desktop)
- Standard page templates (dashboard, form page, detail page, list page)

### 4. Configuration Files

Based on our tech stack, create the actual configuration:

**If using Tailwind CSS:**
- `tailwind.config.js` with custom theme (colors, fonts, spacing)
- Any custom utility classes needed

**If using CSS-in-JS or CSS Modules:**
- Design tokens file (variables)
- Global styles

**If using a component library (shadcn/ui, Material UI, Chakra, etc.):**
- Theme configuration file
- Component customizations to match our design

**If using plain CSS:**
- CSS custom properties (variables) file
- Base/reset styles

### 5. Documentation

Create `docs/design-system.md` covering:

**Quick Reference**
| Element | Value |
|---------|-------|
| Primary color | #XXXX |
| Font family | [font] |
| Base spacing | Xpx |
| Border radius | Xpx |

**Color Palette**
- Visual swatches with hex values
- When to use each color

**Typography**
- Examples of each heading/text style
- When to use each

**Component Gallery**
- Visual example or description of each component pattern
- Code snippet showing how to implement

**Do's and Don'ts**
- Common mistakes to avoid
- Examples of good vs. bad usage

### 6. Example Implementation

Create a sample page or component that demonstrates the design system in action:
- Uses the color palette correctly
- Demonstrates typography scale
- Shows proper spacing
- Includes multiple component types (buttons, forms, cards)

This lets me see and approve the overall look before agents build real features.

### 7. Update Coding Standards

Add a "Styling / Design System" section to `docs/coding-standards.md`:
```markdown
## Styling / Design System

- **Use ONLY design token values** — no arbitrary hex colors, pixel values, or hardcoded spacing. All values must come from the design system configuration.
- **Reference component patterns** from `docs/design-system.md` before creating new component styles. Don't reinvent existing patterns.
- **Use the project's styling approach** (Tailwind classes, CSS modules, styled-components, etc.) as defined in the design system — don't mix approaches.
- **Test at minimum two viewports** — mobile (375px) and desktop (1280px) — for any UI work.
- **Design system config**: [path to tailwind.config.js / theme file / tokens file]

For the full design system reference including color palette, typography, spacing, and component patterns, see `docs/design-system.md`.
```

### 8. Update CLAUDE.md

Add a Design section:
```markdown
## Design System

Before building any UI, review docs/design-system.md.

### Key Rules
- Use ONLY colors from the defined palette — no arbitrary hex values
- Use ONLY spacing values from the scale — no arbitrary pixel values
- Follow component patterns exactly — don't invent new button styles
- Test at mobile (375px) and desktop (1280px) minimum

### Quick Reference
- Primary: [color]
- Background: [color]
- Font: [font]
- Border radius: [value]
- Config: [path to tailwind.config.js or theme file]
```

## Design Direction Input

Use AskUserQuestionTool to ask me:

1. **Overall Feel**: What vibe fits the application?
   - Clean and minimal (lots of white space, subtle colors)
   - Bold and modern (strong colors, prominent elements)
   - Warm and friendly (soft colors, rounded corners)
   - Professional and serious (muted colors, sharp edges)

2. **Color Preference**: Any colors I specifically want or want to avoid?
   - Show me 2-3 palette options based on my answer

3. **Reference Apps**: Any applications whose design I admire?
   - This helps calibrate the direction

4. **Dark Mode**: Do I want to support dark mode in v1?
   - Adds complexity, can defer if not essential

## What NOT to Do

- Don't invent an overly complex design system — keep it practical for the features we're building
- Don't pick trendy fonts that sacrifice readability
- Don't use colors that fail accessibility contrast checks
- Don't create dozens of component variants we won't use
- Don't configure dark mode unless I explicitly want it

## Process
- Create a Beads task for this work before starting: `bd create "docs: <document being created>" -p 0` and `bd update <id> --claim`
- When the document is complete and committed, close it: `bd close <id>`
- If this work surfaces implementation tasks (bugs, missing infrastructure), create separate Beads tasks for those — don't try to do them now
- Research modern design systems (Tailwind defaults, shadcn/ui, Radix, Linear, Vercel) for inspiration
- Ask me design direction questions early, before making choices
- Present a sample visual (via the example implementation) for approval before documenting everything
- Configure the actual theme files — not just documentation
- Verify the configuration works by running the dev server and viewing the example page
- Commit all design system files to the repo

## After This Step

When this step is complete, tell the user:

---
**Phase 3 in progress** — `docs/design-system.md` created with theme configuration.

**Next:** Run `/scaffold:git-workflow` — Configure git workflow for parallel agents.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
