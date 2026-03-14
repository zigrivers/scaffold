# Domain Model: Mixin Injection Mechanics

**Status: Superseded** by meta-prompt architecture (ADR-041). Mixin injection is unnecessary; the AI adapts prompt content natively based on project context.

**Domain ID**: 12
**Phase**: 1 — Deep Domain Modeling
**Depends on**: [01-prompt-resolution.md](01-prompt-resolution.md) (receives resolved prompts), [04-abstract-task-verbs.md](04-abstract-task-verbs.md) (verb vocabulary for task verb replacement), [06-config-validation.md](06-config-validation.md) (config determines which mixins to use)
**Last updated**: 2026-03-14
**Status**: superseded

---

## Section 1: Domain Overview

The Mixin Injection Mechanics domain defines the text processing pipeline that transforms resolved prompt files (from domain 01) into fully-injected prompts ready for platform adapters (domain 05). This is the heart of Scaffold v2's composability — the mechanism by which a single base prompt produces different concrete output depending on which mixin values are configured in `.scaffold/config.yml`.

The injection system processes two distinct kinds of markers embedded in prompt source files as HTML comments:

1. **Axis markers** (`<!-- mixin:<axis> -->` and `<!-- mixin:<axis>:<sub-section> -->`): Replaced with content loaded from mixin files under `mixins/<axis>/<value>.md`. These inject setup instructions, workflow guidance, tool configuration, and other axis-specific prose.

2. **Task verb markers** (`<!-- scaffold:task-<verb> [args] -->`): Replaced with concrete task-tracking commands determined by the `task-tracking` mixin's verb registry. These are a special case of mixin injection with their own parsing grammar and replacement logic, defined in [domain 04](04-abstract-task-verbs.md).

**Role in the v2 architecture**: Mixin injection sits between prompt resolution and platform adaptation in the `scaffold build` pipeline:

```
config.yml → [Config Validation (06)] → [Prompt Resolution (01)] → [Mixin Injection (12)] → [Platform Adapters (05)]
```

Config validation ensures mixin axis/value combinations are valid. Prompt resolution produces a list of `ResolvedPrompt` records with file paths. Mixin injection reads each prompt file, performs all marker replacements, and produces fully-injected content. Platform adapters then transform the injected content into platform-specific outputs (commands/*.md, AGENTS.md, etc.).

**Central design challenge**: Mixin injection must be a single-pass, non-recursive text transformation that handles two different marker syntaxes (axis markers and task verb markers) with clear ordering semantics, robust error detection for unresolved markers, and sub-section targeting for fine-grained mixin content selection — all while keeping the mechanism simple enough that prompt authors can reason about what their output will look like.

---

## Section 2: Glossary

**axis** — A dimension of configurability in the mixin system. Each axis represents an independent concern (e.g., `task-tracking`, `tdd`, `git-workflow`, `agent-mode`, `interaction-style`). The user selects one value per axis in `config.yml`.

**axis marker** — An HTML comment in a prompt file that marks where axis-specific content should be injected. Two forms: `<!-- mixin:<axis> -->` (inject full mixin content) and `<!-- mixin:<axis>:<sub-section> -->` (inject a specific named sub-section).

**build pipeline** — The sequence of transformations in `scaffold build`: config validation → prompt resolution → mixin injection → platform adaptation. Mixin injection is stage 3 of 4.

**compound replacement** — A task verb replacement that expands to multiple lines of instructions (e.g., the `none` mixin's `task-create` verb expands to multi-line TODO.md editing prose).

**full-content injection** — Replacing an axis marker with the entire content of the mixin file (excluding section delimiters and frontmatter). Used when the marker has no sub-section specifier.

**injection context** — The complete set of inputs needed to process one prompt: the prompt's raw content, the mixin file contents for all configured axes, and the task verb registry for the selected task-tracking mixin.

**injection pass** — A single stage in the injection pipeline. The system performs two ordered passes: axis marker replacement first, then task verb replacement.

**marker** — A generic term for any HTML comment in a prompt file that the injection system recognizes and replaces. Includes both axis markers and task verb markers.

**marker leakage** — When an unresolved marker passes through the injection pipeline and appears in the final output. This is an error condition because agents encountering raw markers would skip or misinterpret them.

**mixin file** — A markdown file under `mixins/<axis>/<value>.md` containing the content to inject for one axis-value combination. May contain named sub-sections delimited by `<!-- section:<name> -->` markers.

**mixin insertion point** — Synonym for axis marker. The location in a prompt file where mixin content will be inserted.

**section delimiter** — An HTML comment (`<!-- section:<name> -->`) within a mixin file that marks the boundary between named sub-sections. Used by the sub-section targeting mechanism.

**sub-section** — A named portion of a mixin file, delimited by `<!-- section:<name> -->` markers. Allows prompts to inject only the relevant portion of a mixin rather than its entire content.

**sub-section targeting** — The mechanism by which a prompt requests a specific named sub-section from a mixin file using the `<!-- mixin:<axis>:<sub-section> -->` syntax.

**task verb marker** — An HTML comment using the `<!-- scaffold:task-<verb> [args] -->` syntax. Replaced with concrete task-tracking commands based on the selected task-tracking mixin's verb registry. Defined in [domain 04](04-abstract-task-verbs.md).

**unresolved marker** — A marker that remains in the prompt content after injection. By default, unresolved markers cause a build error. The `--allow-unresolved-markers` flag downgrades this to a warning.

**verb registry** — A `MixinVerbRegistry` (defined in [domain 04](04-abstract-task-verbs.md)) that maps verb names to replacement templates for a specific task-tracking mixin.

---

## Section 3: Entity Model

```typescript
// ─── Marker Types ───────────────────────────────────────────────

/**
 * Base interface for all markers found in prompt content.
 * Both axis markers and task verb markers share these location fields.
 */
interface MarkerBase {
  /** The full original text of the HTML comment, including <!-- and --> */
  rawText: string;

  /** Zero-indexed character offset within the prompt content */
  offset: number;

  /** Line number (1-based) where the marker appears */
  line: number;
}

/**
 * An axis mixin marker parsed from prompt content.
 * Two forms:
 *   <!-- mixin:<axis> -->              → inject full mixin content
 *   <!-- mixin:<axis>:<sub-section> --> → inject a specific sub-section
 */
interface AxisMarker extends MarkerBase {
  kind: 'axis';

  /** The axis name (e.g., 'task-tracking', 'tdd', 'git-workflow') */
  axis: string;

  /**
   * The sub-section name, if present.
   * null means inject the full mixin content.
   * e.g., 'close-workflow' from <!-- mixin:task-tracking:close-workflow -->
   */
  subSection: string | null;
}

/**
 * A task verb marker parsed from prompt content.
 * Re-exports the TaskVerbMarker interface from domain 04.
 * See 04-abstract-task-verbs.md Section 3 for full definition.
 */
interface TaskVerbMarker extends MarkerBase {
  kind: 'task-verb';

  /** The verb name without the 'task-' prefix (e.g., 'create', 'close') */
  verb: VerbName;

  /** Parsed positional and named arguments */
  args: VerbArguments;
}

/**
 * Union type for all markers the injection system processes.
 */
type InjectionMarker = AxisMarker | TaskVerbMarker;


// ─── Mixin File Model ───────────────────────────────────────────

/**
 * A parsed mixin file loaded from mixins/<axis>/<value>.md.
 * Contains the full content and any named sub-sections.
 */
interface MixinFile {
  /** The axis this mixin belongs to (e.g., 'task-tracking') */
  axis: string;

  /** The value/option name (e.g., 'beads', 'github-issues', 'none') */
  value: string;

  /** Absolute file path to the mixin file */
  filePath: string;

  /**
   * The full raw content of the mixin file (after any YAML frontmatter
   * is stripped). Used for full-content injection when no sub-section
   * is specified.
   */
  fullContent: string;

  /**
   * Named sub-sections extracted from the mixin content.
   * Keyed by section name (from <!-- section:<name> --> delimiters).
   * Empty map if the mixin has no section delimiters.
   */
  sections: Map<string, MixinSection>;

  /**
   * Content that appears before the first section delimiter.
   * This is the "preamble" — injected when using the full-content
   * marker AND included as part of fullContent.
   */
  preamble: string;
}

/**
 * A named sub-section within a mixin file.
 * Delimited by <!-- section:<name> --> markers.
 */
interface MixinSection {
  /** The section name (e.g., 'close-workflow', 'setup') */
  name: string;

  /**
   * The content of this section, trimmed of the section delimiter line
   * and leading/trailing blank lines.
   */
  content: string;

  /** Line number (1-based) where the section starts in the mixin file */
  startLine: number;

  /** Line number (1-based) where the section ends (exclusive) */
  endLine: number;
}


// ─── Injection Context & Results ─────────────────────────────────

/**
 * The complete input context for processing one prompt.
 * Assembled by the injection pipeline coordinator.
 */
interface InjectionContext {
  /** The resolved prompt record from domain 01 */
  prompt: ResolvedPrompt;

  /** The raw content of the prompt file (read from prompt.filePath) */
  rawContent: string;

  /**
   * Loaded mixin files for all configured axes.
   * Keyed by axis name. Each entry is the parsed mixin file
   * for the value selected in config.yml.
   */
  mixinFiles: Map<string, MixinFile>;

  /**
   * The verb registry for the selected task-tracking mixin.
   * Loaded from the task-tracking mixin's verb definitions.
   * See domain 04 MixinVerbRegistry.
   */
  verbRegistry: MixinVerbRegistry;

  /**
   * Whether to allow unresolved markers (--allow-unresolved-markers flag).
   * When true, unresolved markers produce warnings instead of errors.
   */
  allowUnresolvedMarkers: boolean;
}

/**
 * The output of processing a single prompt through the injection pipeline.
 */
interface InjectionResult {
  /** The prompt slug (same as input) */
  slug: string;

  /**
   * The fully-injected prompt content.
   * All axis markers and task verb markers have been replaced.
   * Ready for platform adapter consumption.
   */
  injectedContent: string;

  /** The resolved prompt record (passed through unchanged) */
  prompt: ResolvedPrompt;

  /** Markers that were successfully replaced */
  replacedMarkers: ReplacedMarker[];

  /** Warnings produced during injection (non-fatal) */
  warnings: InjectionWarning[];

  /** Errors produced during injection (fatal unless --allow-unresolved-markers) */
  errors: InjectionError[];

  /** Whether injection succeeded (no errors, or all errors downgraded to warnings) */
  success: boolean;
}

/**
 * Record of a marker that was successfully replaced.
 * Used for diagnostics, debugging, and verbose output.
 */
interface ReplacedMarker {
  /** The original marker that was replaced */
  marker: InjectionMarker;

  /** What the marker was replaced with */
  replacement: string;

  /** Source of the replacement content */
  source: ReplacementSource;
}

/**
 * Where replacement content came from.
 */
interface ReplacementSource {
  /** The type of replacement */
  kind: 'axis-full' | 'axis-subsection' | 'task-verb';

  /** For axis replacements: the mixin file path */
  mixinFilePath?: string;

  /** For axis-subsection: the section name within the mixin file */
  sectionName?: string;

  /** For task-verb: the verb registry mixin name */
  verbMixin?: string;
}

/**
 * The aggregate output of the injection pipeline for all prompts.
 */
interface InjectionPipelineResult {
  /** Results for each prompt, in the same order as the input */
  results: InjectionResult[];

  /** Whether all prompts were injected successfully */
  success: boolean;

  /** Aggregate warnings across all prompts */
  warnings: InjectionWarning[];

  /** Aggregate errors across all prompts */
  errors: InjectionError[];

  /** Summary statistics */
  stats: InjectionStats;
}

/**
 * Summary statistics for the injection pipeline run.
 */
interface InjectionStats {
  /** Total prompts processed */
  totalPrompts: number;

  /** Prompts that had at least one marker */
  promptsWithMarkers: number;

  /** Prompts with no markers at all */
  promptsWithoutMarkers: number;

  /** Total markers replaced across all prompts */
  totalMarkersReplaced: number;

  /** Breakdown by marker kind */
  axisMarkersReplaced: number;
  taskVerbMarkersReplaced: number;

  /** Number of unresolved markers (0 if successful) */
  unresolvedMarkers: number;
}


// ─── Errors and Warnings ─────────────────────────────────────────

/**
 * Warning produced during injection.
 */
interface InjectionWarning {
  /** Machine-readable warning code */
  code: InjectionWarningCode;

  /** Human-readable warning message */
  message: string;

  /** The prompt slug where this warning occurred */
  promptSlug: string;

  /** Line number in the prompt file (if applicable) */
  line?: number;

  /** The marker that caused the warning (if applicable) */
  marker?: InjectionMarker;
}

type InjectionWarningCode =
  | 'INJ_AXIS_NOT_REFERENCED'      // Configured axis has no marker in this prompt
  | 'INJ_UNRESOLVED_DOWNGRADED'    // Unresolved marker downgraded to warning by flag
  | 'INJ_EMPTY_SECTION'            // Mixin section exists but is empty
  | 'INJ_VERB_DEGRADED'            // Task verb replaced with degraded alternative
  | 'INJ_EMPTY_MIXIN_FILE'         // Mixin file exists but has no content
  | 'INJ_DUPLICATE_SECTION_NAME';  // Mixin file has duplicate section names

/**
 * Error produced during injection.
 */
interface InjectionError {
  /** Machine-readable error code */
  code: InjectionErrorCode;

  /** Human-readable error message */
  message: string;

  /** The prompt slug where this error occurred */
  promptSlug: string;

  /** Line number in the prompt file (if applicable) */
  line?: number;

  /** The marker that caused the error (if applicable) */
  marker?: InjectionMarker;
}

type InjectionErrorCode =
  | 'INJ_UNRESOLVED_AXIS_MARKER'   // Axis marker has no configured mixin
  | 'INJ_UNRESOLVED_VERB_MARKER'   // Task verb has no replacement template
  | 'INJ_SECTION_NOT_FOUND'        // Requested sub-section doesn't exist in mixin file
  | 'INJ_MIXIN_FILE_NOT_FOUND'     // Mixin file path doesn't exist (shouldn't happen after config validation)
  | 'INJ_MIXIN_FILE_READ_ERROR'    // I/O error reading mixin file
  | 'INJ_INVALID_MARKER_SYNTAX'    // Malformed marker that looks like a mixin/scaffold marker but can't be parsed
  | 'INJ_VERB_UNSUPPORTED';        // Task verb has no template and no fallback behavior
```

### Entity Relationship Diagram

```
ResolutionResult (from domain 01)
  ├── prompts: ResolvedPrompt[]
  │     ├── slug
  │     ├── filePath ─────────────→ prompt file on disk
  │     └── frontmatter
  └── mixins: Record<axis, value> ─→ mixins/<axis>/<value>.md on disk

InjectionContext (assembled per prompt)
  ├── prompt: ResolvedPrompt
  ├── rawContent: string (read from filePath)
  ├── mixinFiles: Map<axis, MixinFile>
  │     └── MixinFile
  │           ├── fullContent: string
  │           ├── preamble: string
  │           └── sections: Map<name, MixinSection>
  └── verbRegistry: MixinVerbRegistry (from domain 04)
        └── templates: Record<VerbName, VerbReplacementTemplate>

InjectionPipelineResult (aggregate output)
  ├── results: InjectionResult[]
  │     ├── slug
  │     ├── injectedContent: string ──→ consumed by platform adapters (domain 05)
  │     ├── replacedMarkers: ReplacedMarker[]
  │     ├── warnings: InjectionWarning[]
  │     └── errors: InjectionError[]
  ├── stats: InjectionStats
  └── success: boolean
```

---

## Section 4: State Transitions

Mixin injection is a stateless text transformation — it has no persistent state, no lifecycle, and no transitions between runs. Each invocation of `scaffold build` runs the injection pipeline from scratch. However, the **injection pipeline itself** has a well-defined sequence of stages that each prompt passes through:

### Injection Pipeline Stages (per prompt)

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐
│ 1. Load     │ ──→ │ 2. Parse Markers │ ──→ │ 3. Replace Axis    │
│    Content  │     │                  │     │    Markers         │
└─────────────┘     └──────────────────┘     └────────────────────┘
                                                       │
                                                       ▼
┌─────────────┐     ┌──────────────────┐     ┌────────────────────┐
│ 6. Produce  │ ←── │ 5. Detect        │ ←── │ 4. Replace Task    │
│    Result   │     │    Unresolved    │     │    Verb Markers    │
└─────────────┘     └──────────────────┘     └────────────────────┘
```

**Stage 1 — Load Content**: Read the prompt file from disk using the `filePath` from the `ResolvedPrompt`. Strip any YAML frontmatter (already parsed during resolution). The remaining markdown body is the raw content.

**Stage 2 — Parse Markers**: Scan the raw content for all markers matching the axis marker pattern (`<!-- mixin:... -->`) and the task verb marker pattern (`<!-- scaffold:task-... -->`). Produce a flat list of `InjectionMarker` records with their positions.

**Stage 3 — Replace Axis Markers**: For each `AxisMarker`, look up the configured mixin file for that axis. For full-content markers, replace with the mixin's `fullContent`. For sub-section markers, replace with the matching `MixinSection.content`. Process markers from last-to-first (reverse document order) to preserve offsets.

**Stage 4 — Replace Task Verb Markers**: For each `TaskVerbMarker`, look up the replacement template in the `MixinVerbRegistry`. Interpolate arguments and replace the marker with the concrete command. Uses the parsing and replacement algorithms from [domain 04](04-abstract-task-verbs.md). Process in reverse document order.

**Stage 5 — Detect Unresolved Markers**: Scan the result content for any remaining markers matching `<!-- mixin:` or `<!-- scaffold:task-`. Any matches are unresolved markers. If `--allow-unresolved-markers` is set, emit warnings. Otherwise, emit errors.

**Stage 6 — Produce Result**: Assemble the `InjectionResult` with the injected content, replacement records, warnings, and errors.

### Stage Ordering Rationale

Axis markers are replaced **before** task verb markers. This ordering is intentional:

- Mixin content injected at axis markers may itself contain task verb markers. For example, a `<!-- mixin:task-tracking -->` marker might inject prose that includes `<!-- scaffold:task-create "Setup tracking" priority=0 -->`.
- By replacing axis markers first, any task verb markers within injected mixin content are visible to stage 4 and get replaced correctly.
- Task verb markers do NOT inject content that contains axis markers (verb replacements are short concrete commands, not markdown with mixin references). So the reverse order would not work.

This makes the system two-pass but not recursive. After both passes, no markers should remain.

---

## Section 5: Core Algorithms

### Algorithm 1: Marker Parsing

Scans prompt content for all injection markers and returns them as a structured list.

**Input**: `string` (raw prompt content)
**Output**: `InjectionMarker[]`

```
FUNCTION parseAllMarkers(content: string): InjectionMarker[]
  markers ← []

  // --- Pass 1: Axis markers ---
  // Pattern: <!-- mixin:<axis> --> or <!-- mixin:<axis>:<sub-section> -->
  axisPattern ← /<!--\s*mixin:([a-z][a-z0-9-]*)(?::([a-z][a-z0-9-]*))?\s*-->/g
  FOR EACH match OF axisPattern.exec(content)
    marker ← {
      kind: 'axis',
      rawText: match[0],
      axis: match[1],
      subSection: match[2] OR null,
      offset: match.index,
      line: countNewlinesBefore(content, match.index) + 1
    }
    markers.push(marker)
  END FOR

  // --- Pass 2: Task verb markers ---
  // Delegates to domain 04's parseVerbMarkers() function
  // Pattern: <!-- scaffold:task-<verb> [args] -->
  verbMarkers ← parseVerbMarkers(content)    // from domain 04
  FOR EACH vm OF verbMarkers
    markers.push({ ...vm, kind: 'task-verb' })
  END FOR

  // Sort by offset ascending (document order)
  SORT markers BY marker.offset ASC

  RETURN markers
END FUNCTION
```

### Marker Syntax Grammar

The formal grammar for all markers recognized by the injection system:

```
axis-marker     ::= "<!--" WS "mixin:" axis-name (":" section-name)? WS "-->"
task-verb-marker ::= "<!--" WS "scaffold:task-" verb-name (WS verb-args)? WS "-->"

axis-name    ::= LOWER (LOWER | DIGIT | "-")*
section-name ::= LOWER (LOWER | DIGIT | "-")*
verb-name    ::= see domain 04 VerbName type
verb-args    ::= see domain 04 argument grammar

WS     ::= [ \t]*
LOWER  ::= [a-z]
DIGIT  ::= [0-9]
```

Marker names must start with a lowercase letter and contain only lowercase letters, digits, and hyphens. This prevents collision with arbitrary HTML comments and provides a predictable namespace.

**No other marker forms exist.** The only two prefixes the injection system recognizes are `mixin:` (for axis markers) and `scaffold:task-` (for task verb markers). Other HTML comments — including `<!-- scaffold:managed -->`, `<!-- scaffold:<prompt-name> v... -->`, and `<!-- section:<name> -->` — are NOT injection markers and are passed through unchanged. The `<!-- section:<name> -->` delimiter is only meaningful inside mixin files, not in prompt files.

### Algorithm 2: Mixin File Loading and Section Parsing

Loads a mixin file from disk and parses it into full content and named sub-sections.

**Input**: `string` (file path), `string` (axis name), `string` (value name)
**Output**: `MixinFile`

```
FUNCTION loadMixinFile(filePath: string, axis: string, value: string): MixinFile
  raw ← readFile(filePath)

  // Strip YAML frontmatter if present (--- ... ---)
  IF raw starts with "---\n"
    endOfFrontmatter ← indexOf("---\n", starting after first "---\n")
    IF endOfFrontmatter found
      raw ← raw.substring(endOfFrontmatter + 4)
    END IF
  END IF

  // Parse section delimiters
  sectionPattern ← /^<!--\s*section:([a-z][a-z0-9-]*)\s*-->$/gm
  sectionDelimiters ← []
  FOR EACH match OF sectionPattern.exec(raw)
    sectionDelimiters.push({
      name: match[1],
      offset: match.index,
      line: countNewlinesBefore(raw, match.index) + 1
    })
  END FOR

  // Build sections map
  sections ← new Map()
  preamble ← ""

  IF sectionDelimiters is empty
    // No sections — fullContent is the entire file content
    preamble ← raw.trim()
  ELSE
    // Content before first delimiter is the preamble
    preamble ← raw.substring(0, sectionDelimiters[0].offset).trim()

    FOR i FROM 0 TO sectionDelimiters.length - 1
      delimiter ← sectionDelimiters[i]
      delimiterLineEnd ← indexOf("\n", delimiter.offset) + 1

      IF i < sectionDelimiters.length - 1
        nextDelimiter ← sectionDelimiters[i + 1]
        sectionContent ← raw.substring(delimiterLineEnd, nextDelimiter.offset).trim()
        endLine ← nextDelimiter.line
      ELSE
        sectionContent ← raw.substring(delimiterLineEnd).trim()
        endLine ← countTotalLines(raw) + 1
      END IF

      IF sections.has(delimiter.name)
        EMIT warning INJ_DUPLICATE_SECTION_NAME for delimiter.name
        // Last definition wins
      END IF

      sections.set(delimiter.name, {
        name: delimiter.name,
        content: sectionContent,
        startLine: delimiter.line,
        endLine: endLine
      })
    END FOR
  END IF

  // Build fullContent: preamble + all section contents (excluding delimiters)
  fullContentParts ← [preamble]
  FOR EACH section OF sections.values()
    IF section.content is not empty
      fullContentParts.push(section.content)
    END IF
  END FOR
  fullContent ← fullContentParts.join("\n\n")

  RETURN {
    axis, value, filePath,
    fullContent, sections, preamble
  }
END FUNCTION
```

### Algorithm 3: Axis Marker Replacement

Replaces all axis markers in prompt content with content from the corresponding mixin files.

**Input**: `string` (content), `AxisMarker[]` (sorted by offset), `Map<string, MixinFile>` (loaded mixin files)
**Output**: `{ content: string, replaced: ReplacedMarker[], warnings: InjectionWarning[], errors: InjectionError[] }`

```
FUNCTION replaceAxisMarkers(
  content: string,
  markers: AxisMarker[],
  mixinFiles: Map<string, MixinFile>
): { content, replaced, warnings, errors }

  replaced ← []
  warnings ← []
  errors ← []

  // Process in REVERSE document order to preserve character offsets
  FOR EACH marker OF markers.reversed()
    mixin ← mixinFiles.get(marker.axis)

    IF mixin is undefined
      // Axis not configured — this is an unresolved marker
      errors.push({
        code: 'INJ_UNRESOLVED_AXIS_MARKER',
        message: `Axis "${marker.axis}" is not configured in config.yml. ` +
                 `Add "mixins.${marker.axis}: <value>" to .scaffold/config.yml ` +
                 `or remove this marker.`,
        promptSlug: currentPromptSlug,
        line: marker.line,
        marker: marker
      })
      CONTINUE  // Leave marker in place; detection stage will catch it
    END IF

    IF marker.subSection is null
      // Full-content injection
      replacement ← mixin.fullContent

      IF replacement is empty
        warnings.push({
          code: 'INJ_EMPTY_MIXIN_FILE',
          message: `Mixin file "${mixin.filePath}" has no content to inject.`,
          promptSlug: currentPromptSlug,
          line: marker.line,
          marker: marker
        })
      END IF

      content ← content.substring(0, marker.offset)
              + replacement
              + content.substring(marker.offset + marker.rawText.length)

      replaced.push({
        marker, replacement,
        source: { kind: 'axis-full', mixinFilePath: mixin.filePath }
      })

    ELSE
      // Sub-section injection
      section ← mixin.sections.get(marker.subSection)

      IF section is undefined
        errors.push({
          code: 'INJ_SECTION_NOT_FOUND',
          message: `Sub-section "${marker.subSection}" not found in mixin file ` +
                   `"${mixin.filePath}". Available sections: ` +
                   `${Array.from(mixin.sections.keys()).join(', ') || '(none)'}`,
          promptSlug: currentPromptSlug,
          line: marker.line,
          marker: marker
        })
        CONTINUE
      END IF

      replacement ← section.content

      IF replacement is empty
        warnings.push({
          code: 'INJ_EMPTY_SECTION',
          message: `Section "${marker.subSection}" in "${mixin.filePath}" is empty.`,
          promptSlug: currentPromptSlug,
          line: marker.line,
          marker: marker
        })
      END IF

      content ← content.substring(0, marker.offset)
              + replacement
              + content.substring(marker.offset + marker.rawText.length)

      replaced.push({
        marker, replacement,
        source: {
          kind: 'axis-subsection',
          mixinFilePath: mixin.filePath,
          sectionName: marker.subSection
        }
      })
    END IF
  END FOR

  RETURN { content, replaced, warnings, errors }
END FUNCTION
```

### Algorithm 4: Task Verb Replacement

Replaces all task verb markers with concrete commands from the verb registry. This algorithm delegates to the `replaceVerbMarkers()` function defined in [domain 04](04-abstract-task-verbs.md), Section 5 Algorithm 3.

**Input**: `string` (content after axis replacement), `MixinVerbRegistry` (from selected task-tracking mixin)
**Output**: `{ content: string, replaced: ReplacedMarker[], warnings: InjectionWarning[], errors: InjectionError[] }`

```
FUNCTION replaceTaskVerbMarkers(
  content: string,
  registry: MixinVerbRegistry
): { content, replaced, warnings, errors }

  replaced ← []
  warnings ← []
  errors ← []

  // Delegate to domain 04's replacement engine
  result ← replaceVerbMarkers(content, registry)

  content ← result.content

  // Convert domain 04's replacement records to our format
  FOR EACH r OF result.replacements
    replaced.push({
      marker: { ...r.marker, kind: 'task-verb' },
      replacement: r.replacement,
      source: { kind: 'task-verb', verbMixin: registry.mixin }
    })
  END FOR

  // Convert domain 04's warnings (e.g., verb degradation)
  FOR EACH w OF result.warnings
    warnings.push({
      code: 'INJ_VERB_DEGRADED',
      message: w.message,
      promptSlug: currentPromptSlug,
      line: w.line,
      marker: w.marker
    })
  END FOR

  // Convert domain 04's errors (e.g., unsupported verbs)
  FOR EACH e OF result.errors
    errors.push({
      code: mapVerbErrorCode(e.code),
      message: e.message,
      promptSlug: currentPromptSlug,
      line: e.line,
      marker: e.marker
    })
  END FOR

  RETURN { content, replaced, warnings, errors }
END FUNCTION

// Maps domain 04 error codes to domain 12 codes
FUNCTION mapVerbErrorCode(code: string): InjectionErrorCode
  SWITCH code
    CASE 'VERB_NO_TEMPLATE': RETURN 'INJ_UNRESOLVED_VERB_MARKER'
    CASE 'VERB_UNSUPPORTED': RETURN 'INJ_VERB_UNSUPPORTED'
    DEFAULT: RETURN 'INJ_UNRESOLVED_VERB_MARKER'
  END SWITCH
END FUNCTION
```

### Algorithm 5: Unresolved Marker Detection

Post-injection scan that checks for any markers that were not replaced.

**Input**: `string` (content after both replacement passes), `boolean` (allowUnresolvedMarkers flag)
**Output**: `{ warnings: InjectionWarning[], errors: InjectionError[] }`

```
FUNCTION detectUnresolvedMarkers(
  content: string,
  allowUnresolved: boolean,
  promptSlug: string
): { warnings, errors }

  warnings ← []
  errors ← []

  // Scan for remaining axis markers
  axisPattern ← /<!--\s*mixin:[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?\s*-->/g
  FOR EACH match OF axisPattern.exec(content)
    line ← countNewlinesBefore(content, match.index) + 1
    entry ← {
      code: 'INJ_UNRESOLVED_AXIS_MARKER',
      message: `Unresolved mixin marker "${match[0]}" at line ${line} in ` +
               `prompt "${promptSlug}". The axis is not configured or the ` +
               `mixin has no matching section.`,
      promptSlug,
      line
    }
    IF allowUnresolved
      warnings.push({ ...entry, code: 'INJ_UNRESOLVED_DOWNGRADED' })
    ELSE
      errors.push(entry)
    END IF
  END FOR

  // Scan for remaining task verb markers
  verbPattern ← /<!--\s*scaffold:task-[a-z][a-z0-9-]*\s.*?-->/g
  FOR EACH match OF verbPattern.exec(content)
    line ← countNewlinesBefore(content, match.index) + 1
    entry ← {
      code: 'INJ_UNRESOLVED_VERB_MARKER',
      message: `Unresolved task verb marker "${match[0]}" at line ${line} in ` +
               `prompt "${promptSlug}".`,
      promptSlug,
      line
    }
    IF allowUnresolved
      warnings.push({ ...entry, code: 'INJ_UNRESOLVED_DOWNGRADED' })
    ELSE
      errors.push(entry)
    END IF
  END FOR

  RETURN { warnings, errors }
END FUNCTION
```

### Algorithm 6: Complete Injection Pipeline

The top-level orchestrator that processes all resolved prompts through the injection pipeline.

**Input**: `ResolutionResult` (from domain 01), `ScaffoldConfig` (from domain 06), `BuildOptions`
**Output**: `InjectionPipelineResult`

```
FUNCTION runInjectionPipeline(
  resolution: ResolutionResult,
  config: ScaffoldConfig,
  options: { allowUnresolvedMarkers: boolean }
): InjectionPipelineResult

  // --- Phase A: Load all mixin files once ---
  mixinFiles ← new Map()
  FOR EACH [axis, value] OF Object.entries(resolution.mixins)
    filePath ← resolveMixinPath(axis, value)  // mixins/<axis>/<value>.md
    IF NOT fileExists(filePath)
      RETURN earlyErrorResult('INJ_MIXIN_FILE_NOT_FOUND', filePath)
    END IF
    mixinFiles.set(axis, loadMixinFile(filePath, axis, value))
  END FOR

  // --- Phase B: Load task verb registry ---
  taskTrackingValue ← resolution.mixins['task-tracking']
  verbRegistry ← loadVerbRegistry(taskTrackingValue)  // from domain 04

  // --- Phase C: Process each prompt ---
  results ← []
  allWarnings ← []
  allErrors ← []
  stats ← initStats()

  FOR EACH prompt OF resolution.prompts
    // Stage 1: Load content
    rawContent ← readFile(prompt.filePath)
    rawContent ← stripFrontmatter(rawContent)

    // Stage 2: Parse all markers
    markers ← parseAllMarkers(rawContent)

    axisMarkers ← markers.filter(m → m.kind === 'axis')
    verbMarkers ← markers.filter(m → m.kind === 'task-verb')

    // Track stats
    stats.totalPrompts += 1
    IF markers.length > 0
      stats.promptsWithMarkers += 1
    ELSE
      stats.promptsWithoutMarkers += 1
    END IF

    // Stage 3: Replace axis markers
    axisResult ← replaceAxisMarkers(rawContent, axisMarkers, mixinFiles)
    content ← axisResult.content
    replaced ← axisResult.replaced
    promptWarnings ← axisResult.warnings
    promptErrors ← axisResult.errors

    // After axis replacement, re-parse for NEW task verb markers
    // (mixin content may have introduced additional verb markers)
    allCurrentVerbMarkers ← parseVerbMarkers(content)

    // Stage 4: Replace task verb markers
    verbResult ← replaceTaskVerbMarkers(content, verbRegistry)
    content ← verbResult.content
    replaced ← replaced.concat(verbResult.replaced)
    promptWarnings ← promptWarnings.concat(verbResult.warnings)
    promptErrors ← promptErrors.concat(verbResult.errors)

    // Stage 5: Detect unresolved markers
    unresolvedResult ← detectUnresolvedMarkers(
      content, options.allowUnresolvedMarkers, prompt.slug
    )
    promptWarnings ← promptWarnings.concat(unresolvedResult.warnings)
    promptErrors ← promptErrors.concat(unresolvedResult.errors)

    // Check for axes with no markers (inverse warning)
    FOR EACH [axis, _] OF mixinFiles
      IF axisMarkers.none(m → m.axis === axis)
        // Only warn if this axis logically applies to this prompt
        // (determined by heuristic — see edge cases)
        // This is a soft warning, not an error
      END IF
    END FOR

    // Stage 6: Produce result
    success ← promptErrors.length === 0
    result ← {
      slug: prompt.slug,
      injectedContent: content,
      prompt,
      replacedMarkers: replaced,
      warnings: promptWarnings,
      errors: promptErrors,
      success
    }
    results.push(result)

    // Aggregate
    allWarnings ← allWarnings.concat(promptWarnings)
    allErrors ← allErrors.concat(promptErrors)
    stats.totalMarkersReplaced += replaced.length
    stats.axisMarkersReplaced += replaced.filter(r → r.source.kind.startsWith('axis')).length
    stats.taskVerbMarkersReplaced += replaced.filter(r → r.source.kind === 'task-verb').length
    stats.unresolvedMarkers += unresolvedResult.warnings.length + unresolvedResult.errors.length
  END FOR

  RETURN {
    results,
    success: allErrors.length === 0,
    warnings: allWarnings,
    errors: allErrors,
    stats
  }
END FUNCTION
```

---

## Section 6: Error Taxonomy

### Errors (Fatal — `scaffold build` fails)

| Code | Message Template | Trigger | Recovery Guidance |
|------|-----------------|---------|-------------------|
| `INJ_UNRESOLVED_AXIS_MARKER` | `Unresolved mixin marker "<!-- mixin:{axis} -->" at line {line} in prompt "{slug}". The axis is not configured or the mixin has no matching section.` | Axis marker in prompt has no corresponding axis in `config.yml` | Add `mixins.{axis}: <value>` to `.scaffold/config.yml`, or use `--allow-unresolved-markers` for dev |
| `INJ_UNRESOLVED_VERB_MARKER` | `Unresolved task verb marker "<!-- scaffold:task-{verb} ... -->" at line {line} in prompt "{slug}".` | Task verb marker not replaced during injection | Ensure `task-tracking` mixin defines a template for this verb. Check verb name spelling. |
| `INJ_SECTION_NOT_FOUND` | `Sub-section "{section}" not found in mixin file "{path}". Available sections: {list}` | Prompt requests `<!-- mixin:axis:section -->` but the mixin file has no `<!-- section:section -->` delimiter | Add the section to the mixin file, or change the marker to use a section name that exists |
| `INJ_MIXIN_FILE_NOT_FOUND` | `Mixin file not found: "{path}". Expected at mixins/{axis}/{value}.md` | Configured mixin value doesn't have a corresponding file | Create the mixin file, or change `config.yml` to use an installed value. This error should be caught by config validation (domain 06) first. |
| `INJ_MIXIN_FILE_READ_ERROR` | `Failed to read mixin file "{path}": {ioError}` | File system I/O error | Check file permissions and disk availability |
| `INJ_INVALID_MARKER_SYNTAX` | `Malformed marker at line {line} in prompt "{slug}": "{rawText}". Expected format: <!-- mixin:<axis> --> or <!-- scaffold:task-<verb> [args] -->` | HTML comment starts with `mixin:` or `scaffold:task-` but doesn't match the grammar | Fix the marker syntax in the prompt file |
| `INJ_VERB_UNSUPPORTED` | `Task verb "{verb}" is not supported by the "{mixin}" mixin and has no fallback.` | Verb has `template: null` and no `unsupportedBehavior` defined | Add a template or fallback behavior for this verb in the mixin's verb registry |

### Warnings (Non-fatal — `scaffold build` continues)

| Code | Message Template | Trigger | Notes |
|------|-----------------|---------|-------|
| `INJ_AXIS_NOT_REFERENCED` | `Axis "{axis}" is configured but prompt "{slug}" has no markers for it.` | A configured axis has no markers in a given prompt | This is expected for many prompts — most prompts don't reference every axis. Only emitted when a heuristic suggests the axis *should* be referenced. |
| `INJ_UNRESOLVED_DOWNGRADED` | `Unresolved marker "{rawText}" at line {line} in prompt "{slug}" (downgraded from error by --allow-unresolved-markers).` | `--allow-unresolved-markers` flag is set and a marker was not replaced | Marker is left in the output as-is. Dev-only usage. |
| `INJ_EMPTY_SECTION` | `Section "{section}" in "{path}" is empty. The marker will be replaced with an empty string.` | Sub-section exists but has no content | Intentional if the section is meant to be a no-op for this mixin value |
| `INJ_VERB_DEGRADED` | `Task verb "{verb}" replaced with degraded alternative in prompt "{slug}".` | Verb template has `unsupportedBehavior: 'degrade'` | The replacement is functional but less capable than the primary behavior |
| `INJ_EMPTY_MIXIN_FILE` | `Mixin file "{path}" has no content to inject.` | Mixin file exists but is empty after stripping frontmatter | Intentional for "none" or placeholder mixins |
| `INJ_DUPLICATE_SECTION_NAME` | `Duplicate section name "{name}" in mixin file "{path}". Last definition wins.` | Two `<!-- section:X -->` delimiters with the same name in one file | Fix the mixin file to use unique section names |

### Error-to-Warning Downgrade

The `--allow-unresolved-markers` CLI flag downgrades `INJ_UNRESOLVED_AXIS_MARKER` and `INJ_UNRESOLVED_VERB_MARKER` from errors to warnings (`INJ_UNRESOLVED_DOWNGRADED`). This is intended for development only — when prompt authors are iterating on marker placement before all mixin files are written. The unresolved markers remain in the output.

All other error codes (`INJ_SECTION_NOT_FOUND`, `INJ_MIXIN_FILE_NOT_FOUND`, etc.) are always fatal regardless of the flag. These represent structural problems that `--allow-unresolved-markers` is not designed to bypass.

---

## Section 7: Integration Points

### Domain 01 → Domain 12 (Prompt Resolution → Mixin Injection)

- **Direction**: Domain 01 outputs feed domain 12 inputs
- **Data flow**: `ResolutionResult` provides the list of `ResolvedPrompt` records (with file paths to read) and the `mixins` map (which axis-value pairs are selected). Mixin injection reads prompt files from the paths in `ResolvedPrompt.filePath`.
- **Contract**: Each `ResolvedPrompt.filePath` points to an existing, readable file. The `mixins` map keys are valid axis names and values are valid option names. Domain 01 does NOT read prompt body content — only frontmatter. Domain 12 reads the full file content.
- **Assumption**: The `ResolutionResult.mixins` map has already been validated by config validation (domain 06). Every axis/value combination maps to an existing mixin file.

### Domain 04 → Domain 12 (Abstract Task Verbs → Mixin Injection)

- **Direction**: Domain 04 defines the vocabulary; domain 12 performs the replacement
- **Data flow**: Domain 12 calls `parseVerbMarkers()` and `replaceVerbMarkers()` from domain 04. Domain 12 loads the `MixinVerbRegistry` from the selected `task-tracking` mixin file.
- **Contract**: Domain 04's functions are pure string transformations — no file I/O, no side effects. Domain 12 is responsible for loading the verb registry from disk and passing it to domain 04's functions.
- **Assumption**: Task verb markers (`<!-- scaffold:task-* -->`) are a subset of the mixin marker system. They share the HTML comment syntax but have their own argument grammar and replacement logic defined in domain 04.

### Domain 12 → Domain 05 (Mixin Injection → Platform Adapters)

- **Direction**: Domain 12 outputs feed domain 05 inputs
- **Data flow**: `InjectionPipelineResult.results` provides `InjectionResult` records with `injectedContent` — the fully-injected prompt text. Platform adapters read this content and transform it into platform-specific outputs.
- **Contract**: After successful injection, `injectedContent` contains no mixin markers or task verb markers. It is valid markdown that references concrete tool commands. Platform adapters may perform additional transformations (e.g., Codex adapter's tool-name mapping) but do NOT perform any mixin injection.
- **Assumption**: Platform adapters receive fully-injected content. They do not need to know about the mixin system.

### Domain 06 → Domain 12 (Config Validation → Mixin Injection)

- **Direction**: Domain 06 validates before domain 12 runs
- **Data flow**: Config validation ensures `mixins.<axis>` values match installed mixin files and `methodology` is valid. If config validation passes, mixin injection can trust that mixin file paths are resolvable.
- **Contract**: `INJ_MIXIN_FILE_NOT_FOUND` should never occur after config validation passes. If it does, it indicates a race condition (file deleted between validation and injection) or a validation bug.
- **Assumption**: Config validation checks file existence for all configured mixin values. The injection system does not re-validate — it trusts the config.

### Domain 08 → Domain 12 (Prompt Frontmatter → Mixin Injection)

- **Direction**: Domain 08 defines the `artifact-schema` constraint that mixins must respect
- **Data flow**: Frontmatter may declare `artifact-schema` with `required-sections`. Mixin content injected into prompts must not add new heading-level sections (`##` or above) to artifacts.
- **Contract**: Mixin files inject content within existing sections only. This constraint is enforced by convention and validated by `scaffold validate`, not by the injection system itself.

### Data Flow Diagram

```
                    ┌─────────────────────┐
                    │  .scaffold/config.yml │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Config Validation   │
                    │     (Domain 06)      │
                    └──────────┬──────────┘
                               │ ScaffoldConfig
                    ┌──────────▼──────────┐
                    │  Prompt Resolution   │
                    │     (Domain 01)      │
                    └──────────┬──────────┘
                               │ ResolutionResult
                               │  ├── prompts[]: ResolvedPrompt
                               │  └── mixins: Record<axis, value>
                    ┌──────────▼──────────┐
                    │  Mixin Injection     │◄─── mixins/<axis>/<value>.md files
                    │     (Domain 12)      │◄─── MixinVerbRegistry (domain 04)
                    └──────────┬──────────┘
                               │ InjectionPipelineResult
                               │  └── results[]: InjectionResult
                               │       └── injectedContent: string
                    ┌──────────▼──────────┐
                    │  Platform Adapters   │
                    │     (Domain 05)      │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │  commands/*.md       │
                    │  AGENTS.md           │
                    │  universal/*.md      │
                    └─────────────────────┘
```

---

## Section 8: Edge Cases & Failure Modes

### MQ1: Complete injection pipeline as a sequence of stages

The injection pipeline has 6 stages per prompt, organized into a two-pass architecture:

| Stage | Input Format | Transformation | Output Format | Error Conditions |
|-------|-------------|----------------|---------------|-----------------|
| 1. Load Content | `ResolvedPrompt.filePath` | Read file, strip YAML frontmatter | Raw markdown string | `INJ_MIXIN_FILE_READ_ERROR` if file unreadable |
| 2. Parse Markers | Raw markdown string | Regex scan for `<!-- mixin:... -->` and `<!-- scaffold:task-... -->` | `InjectionMarker[]` | `INJ_INVALID_MARKER_SYNTAX` for malformed markers |
| 3. Replace Axis Markers | Raw content + `AxisMarker[]` + `MixinFile` map | Replace each axis marker with mixin file content or sub-section | Partially-injected content | `INJ_UNRESOLVED_AXIS_MARKER`, `INJ_SECTION_NOT_FOUND`, `INJ_EMPTY_MIXIN_FILE` |
| 4. Replace Task Verb Markers | Partially-injected content + `MixinVerbRegistry` | Re-parse for verb markers (including new ones from injected mixin content), replace with concrete commands | Fully-injected content | `INJ_UNRESOLVED_VERB_MARKER`, `INJ_VERB_UNSUPPORTED` |
| 5. Detect Unresolved | Fully-injected content | Regex scan for remaining `<!-- mixin:` and `<!-- scaffold:task-` patterns | Warnings or errors list | `INJ_UNRESOLVED_AXIS_MARKER` / `INJ_UNRESOLVED_VERB_MARKER` (or downgraded) |
| 6. Produce Result | All above outputs | Assemble `InjectionResult` | `InjectionResult` | None — assembly step |

Before per-prompt processing, a one-time **Phase A** loads all mixin files into memory and **Phase B** loads the task verb registry. These are shared across all prompts.

Critical ordering: Axis markers are replaced BEFORE task verb markers because mixin content may contain task verb markers. After axis replacement, the content is re-parsed for task verb markers to catch any that were introduced by injected mixin content.

### MQ2: Marker syntax grammar

The injection system recognizes exactly two marker families:

**Axis markers:**
```
<!-- mixin:<axis-name> -->
<!-- mixin:<axis-name>:<sub-section-name> -->
```

Formal regex: `<!--\s*mixin:([a-z][a-z0-9-]*)(?::([a-z][a-z0-9-]*))?\s*-->`

Constraints:
- Axis names and sub-section names must start with a lowercase letter
- May contain only lowercase letters, digits, and hyphens
- No attributes or additional parameters
- Whitespace is allowed between `<!--` and `mixin:` and between the content and `-->`
- The marker must be a complete HTML comment (both `<!--` and `-->` present)

**Task verb markers:**
```
<!-- scaffold:task-<verb> [positional-args] [named=args] -->
```

Formal regex and argument grammar: defined in [domain 04](04-abstract-task-verbs.md), Section 5 Algorithm 1.

**No other forms exist.** Specifically:
- No attributes on axis markers (e.g., `<!-- mixin:tdd strict -->` is NOT valid — the value is determined by `config.yml`, not inline)
- No conditional markers (e.g., `<!-- mixin:tdd if frontend -->` — conditionals are handled by the optional prompt system in domain 01)
- No nested markers (markers cannot contain other markers within them)

### MQ3: Sub-section targeting

Sub-section targeting allows a prompt to inject only a specific portion of a mixin file rather than its entire content.

**Mixin file with sections:**
```markdown
General setup instructions for the task-tracking system.

<!-- section:close-workflow -->
When you complete a task, run `bd close <id>` to mark it done.
Then run `bd sync` to persist the change.

<!-- section:pr-integration -->
Before creating a PR, check `bd ready` for any tasks
that may have been unblocked by your work.
```

**Section delimiter syntax:** `<!-- section:<name> -->` on its own line, where `<name>` follows the same naming rules as axis names (lowercase, letters/digits/hyphens, starts with letter).

**Section boundaries:** A section starts on the line after its delimiter and extends until the next section delimiter or end of file. Content is trimmed of leading/trailing blank lines.

**When a prompt requests a sub-section that doesn't exist:**

The injection system emits error `INJ_SECTION_NOT_FOUND` with a message listing the available sections. This is a fatal error (not downgraded by `--allow-unresolved-markers`) because it indicates a mismatch between the prompt's expectations and the mixin file's structure. The error message includes the list of available section names to help the author fix the issue.

Example:
```
Error INJ_SECTION_NOT_FOUND: Sub-section "close-workflow" not found in mixin file
"mixins/tdd/strict.md". Available sections: setup, rules, exceptions
```

**Full-content injection with sections:** When a prompt uses `<!-- mixin:task-tracking -->` (no sub-section), and the mixin file has sections, the `fullContent` property is injected — which is the concatenation of the preamble and all section contents (without the delimiter lines), joined by double newlines. This preserves the full mixin content while stripping the delimiter markup.

### MQ4: Task verb replacement ordering relative to mixin injection

Task verb replacements are a **stage within the mixin injection pipeline**, not a separate phase. The ordering is:

1. **Stage 3**: Replace axis markers (load and inject mixin file content)
2. **Stage 4**: Replace task verb markers (apply verb registry replacements)

This ordering means that **yes, a mixin's content can contain task verb markers, and they will be replaced.** This is by design. Consider a `<!-- mixin:task-tracking -->` marker that injects setup instructions including:

```markdown
Initialize task tracking:
<!-- scaffold:task-create "Setup tracking infrastructure" priority=0 -->
```

After axis replacement (stage 3), this verb marker is now part of the prompt content. During stage 4, the verb replacement engine finds it and replaces it with the concrete command (e.g., `bd create "Setup tracking infrastructure" -p 0`).

**Why this ordering works:**
- Axis markers inject content. That content may contain verb markers.
- Verb markers produce short concrete commands. Those commands never contain axis markers.
- So: axis-first, verbs-second is correct. The reverse would miss verb markers introduced by mixin content.
- Two passes are sufficient. No recursion is needed.

### MQ5: Unresolved marker error handling

After both replacement passes, the injection system performs a final scan (stage 5) for any remaining markers:

**Detection method:** Two regex scans of the output content:
1. `<!--\s*mixin:[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?\s*-->` — catches remaining axis markers
2. `<!--\s*scaffold:task-[a-z][a-z0-9-]*\s.*?-->` — catches remaining task verb markers

**Default behavior (no flag):** Each remaining marker produces a fatal error (`INJ_UNRESOLVED_AXIS_MARKER` or `INJ_UNRESOLVED_VERB_MARKER`). The build fails with exit code 5 (build error). Error messages include:
- The full marker text
- The line number
- The prompt slug
- For axis markers: which axis is missing from config.yml and how to add it
- For verb markers: which verb is missing from the registry

**With `--allow-unresolved-markers`:** Errors are downgraded to warnings (`INJ_UNRESOLVED_DOWNGRADED`). The markers are left in the output as-is. The build succeeds with a non-zero warning count. This mode is for development only — when prompt authors are iterating before all mixin infrastructure is in place.

**Why errors by default:** An unresolved marker in a prompt that an agent executes would be silently ignored (it's an HTML comment). This is worse than a build failure because the agent misses critical instructions. Fail-fast at build time is the safer default.

### MQ6: Recursive mixin injection

**Mixin injection is NOT recursive.** The system performs exactly two passes:
1. Replace axis markers with mixin file content
2. Replace task verb markers with concrete commands

**How recursion is prevented:** After both passes, the system scans for unresolved markers. If any remain, they are errors. There is no third pass that would attempt to process them.

**Can mixin content contain axis markers?** Technically yes — a mixin file's content could include `<!-- mixin:some-axis -->`. However:
- This marker would be injected into the prompt content during stage 3
- In stage 5, it would be detected as an unresolved marker
- The build would fail with `INJ_UNRESOLVED_AXIS_MARKER`

This is intentional. Recursive injection would make the system harder to reason about, could lead to infinite loops, and complicates error reporting. If a mixin needs content from another axis, the prompt should include both markers explicitly:

```markdown
<!-- mixin:task-tracking -->
...
<!-- mixin:git-workflow -->
```

Rather than having the `task-tracking` mixin embed a `<!-- mixin:git-workflow -->` marker.

**Depth limiting is not needed** because recursion does not exist. The two-pass system is deterministic and bounded.

### MQ7: Mixin injection and the prompt customization layer

**User overrides get mixin injection:** Yes. If a user overrides a base prompt via `.scaffold/prompts/tech-stack.md`, the override file goes through the same injection pipeline. The user's custom prompt can use `<!-- mixin:task-tracking -->` and `<!-- scaffold:task-create ... -->` markers, and they will be replaced.

This works because domain 01 (prompt resolution) resolves the effective file path — if a customization overrides a built-in prompt, `ResolvedPrompt.filePath` points to the custom file. The injection system reads whatever file is at that path and processes it identically.

**User-created custom prompts (extra-prompts) get injection too:** Extra prompts listed in `config.yml` under `extra-prompts` also go through injection. Their content is read from `.scaffold/prompts/<name>.md` or `~/.scaffold/prompts/<name>.md` and processed like any other prompt.

**The injection system is source-layer agnostic.** It processes a list of `ResolvedPrompt` records. It does not check `sourceLayer` — base, override, ext, project-custom, user-custom, and extra prompts all receive identical treatment.

### MQ8: Complete data flow from config to injected prompts

```
1. config.yml
   ├── methodology: "classic"
   ├── mixins: { task-tracking: "beads", tdd: "strict", ... }
   └── platforms: ["claude-code", "codex"]
          │
   ┌──────▼──────┐
   │ Config       │ → ScaffoldConfig (validated config object)
   │ Validation   │
   │ (domain 06)  │
   └──────┬──────┘
          │ ScaffoldConfig
   ┌──────▼──────┐
   │ Prompt       │ → ResolutionResult
   │ Resolution   │    ├── prompts[]: ResolvedPrompt { slug, filePath, frontmatter }
   │ (domain 01)  │    ├── mixins: { task-tracking: "beads", tdd: "strict", ... }
   └──────┬──────┘    └── excludedOptional: [...]
          │
          │ ResolutionResult
          │
   ┌──────▼──────────────────────────────────────────────────┐
   │ Mixin Injection (domain 12)                              │
   │                                                          │
   │  Phase A: Load mixin files                               │
   │    mixins/task-tracking/beads.md → MixinFile             │
   │    mixins/tdd/strict.md → MixinFile                      │
   │    mixins/git-workflow/full-pr.md → MixinFile            │
   │    mixins/agent-mode/multi.md → MixinFile                │
   │    mixins/interaction-style/claude-code.md → MixinFile   │
   │                                                          │
   │  Phase B: Load verb registry                             │
   │    beads verbs.yml → MixinVerbRegistry                   │
   │                                                          │
   │  Phase C: For each prompt:                               │
   │    read filePath → raw content                           │
   │    parseAllMarkers() → InjectionMarker[]                 │
   │    replaceAxisMarkers() → partially-injected             │
   │    re-parse for new verb markers                         │
   │    replaceTaskVerbMarkers() → fully-injected             │
   │    detectUnresolvedMarkers() → warnings/errors           │
   │    → InjectionResult { injectedContent, ... }            │
   │                                                          │
   └──────┬──────────────────────────────────────────────────┘
          │ InjectionPipelineResult
          │  └── results[]: InjectionResult { slug, injectedContent, prompt }
          │
   ┌──────▼──────┐
   │ Platform     │ → commands/*.md (Claude Code)
   │ Adapters     │   AGENTS.md (Codex)
   │ (domain 05)  │   universal/*.md (Universal)
   └─────────────┘
```

**Intermediate representations at each boundary:**

| Boundary | Data Structure | Key Fields |
|----------|---------------|------------|
| Config → Resolution | `ScaffoldConfig` | methodology, mixins, platforms, project traits |
| Resolution → Injection | `ResolutionResult` | prompts[] (with filePaths), mixins map |
| Injection → Adapters | `InjectionPipelineResult` | results[] with injectedContent per prompt |

### MQ9: Full injection example (see Section 11)

Detailed concrete examples with 3 mixin markers, 2 configurations, and before/after are provided in Section 11.

### MQ10: Testing strategy (see Section 9)

Detailed testing strategy including verification of correct output and marker leakage testing is provided in Section 9.

### Additional Edge Cases

**Prompt with no markers:** A prompt that contains no axis markers and no task verb markers passes through injection unchanged. This is valid — not every prompt uses mixins. The result has an empty `replacedMarkers` array and `success: true`. Stats track this as `promptsWithoutMarkers`.

**Same axis referenced multiple times:** A prompt may contain multiple markers for the same axis (e.g., `<!-- mixin:task-tracking -->` in one section and `<!-- mixin:task-tracking:close-workflow -->` in another). Each marker is replaced independently. Full-content markers get the full mixin content; sub-section markers get only their requested section. There is no deduplication.

**Mixin file with no sections referenced by sub-section marker:** If a prompt requests `<!-- mixin:tdd:setup -->` but the `tdd/strict.md` file has no `<!-- section:... -->` delimiters, the `sections` map is empty and `INJ_SECTION_NOT_FOUND` is emitted. The error lists "(none)" as available sections, indicating the mixin uses flat content only.

**Empty sub-section:** If a section delimiter exists but the section between it and the next delimiter (or end of file) is empty or whitespace-only, the replacement is an empty string and `INJ_EMPTY_SECTION` warning is emitted. This is valid for "no-op" sections (e.g., the `none` mixin might have an empty `close-workflow` section because there's nothing to close).

**Marker on the same line as other content:** Markers should appear on their own line for readability, but the parser handles inline markers too. The replacement inserts content at the marker's exact position, which may produce unusual formatting. Prompt authors are advised to place markers on their own line.

**Non-mixin HTML comments:** Comments like `<!-- TODO: ... -->`, `<!-- scaffold:managed -->`, and `<!-- scaffold:tech-stack v1 ... -->` are NOT injection markers. They pass through unchanged. The parser only matches `<!-- mixin:... -->` and `<!-- scaffold:task-... -->` prefixes.

**Mixin content with markdown headings:** The spec states that mixins must not inject new heading-level sections (`##` or above) to preserve artifact schema stability. This constraint is enforced by convention and by `scaffold validate`, not by the injection engine. The engine replaces markers with whatever content the mixin file contains, including headings if present.

---

## Section 9: Testing Considerations

### Unit Testing

**1. Marker parsing tests:**
- Parse axis markers: `<!-- mixin:task-tracking -->` → `{ kind: 'axis', axis: 'task-tracking', subSection: null }`
- Parse sub-section markers: `<!-- mixin:task-tracking:close-workflow -->` → `{ kind: 'axis', axis: 'task-tracking', subSection: 'close-workflow' }`
- Parse with extra whitespace: `<!--  mixin:tdd  -->` → valid
- Reject non-mixin comments: `<!-- TODO: fix this -->` → not parsed
- Reject malformed markers: `<!-- mixin: -->` (empty axis name) → `INJ_INVALID_MARKER_SYNTAX` or silently skipped
- Verify line numbers are correct for multi-line content
- Verify multiple markers in one file all parsed with correct offsets

**2. Mixin file loading tests:**
- Load file with no sections → `fullContent` is entire content, `sections` is empty
- Load file with sections → sections parsed correctly, preamble extracted
- Load file with YAML frontmatter → frontmatter stripped
- Load file with duplicate section names → warning emitted, last definition wins
- Load empty file → `fullContent` is empty, `INJ_EMPTY_MIXIN_FILE` ready to emit

**3. Axis marker replacement tests:**
- Full-content injection with single marker
- Sub-section injection with specific section
- Multiple markers for same axis (one full, one sub-section)
- Multiple markers for different axes
- Sub-section not found → `INJ_SECTION_NOT_FOUND` error
- Axis not configured → `INJ_UNRESOLVED_AXIS_MARKER` error
- Reverse-order processing preserves offsets (key correctness property)

**4. Task verb replacement tests:**
- Delegate to domain 04's test suite for verb parsing and template interpolation
- Integration: after axis injection, new verb markers from mixin content are found and replaced
- Verb with no template → `INJ_VERB_UNSUPPORTED` error
- Verb with degraded replacement → `INJ_VERB_DEGRADED` warning

**5. Unresolved marker detection tests:**
- No markers remaining → no errors
- Axis marker remaining → error (or warning with flag)
- Verb marker remaining → error (or warning with flag)
- `--allow-unresolved-markers` downgrades to warnings
- Non-mixin comments NOT flagged as unresolved

### Integration Testing

**6. Full pipeline tests:**
- Happy path: config + prompts + mixins → fully-injected output with no errors
- All markers replaced → final content contains no `<!-- mixin:` or `<!-- scaffold:task-` patterns
- Prompt with no markers → passes through unchanged
- Multiple prompts processed → correct injection per prompt
- Stats are accurate (marker counts, prompt counts)

**7. Cross-domain tests:**
- Domain 01 → Domain 12: `ResolutionResult` feeds correctly into injection pipeline
- Mixin content with task verbs: axis injection introduces verb markers, verb replacement processes them
- Domain 12 → Domain 05: `InjectionPipelineResult` has all fields needed by platform adapters

### Marker Leakage Testing

**8. Leakage verification (critical safety property):**
- After successful injection, scan output for `<!-- mixin:` → must find zero matches
- After successful injection, scan output for `<!-- scaffold:task-` → must find zero matches
- This is the core invariant: no markers escape the injection pipeline
- Parametrize across all combinations of: methodology × mixin values × prompt set
- Include prompts with no markers (should not false-positive)

**9. Edge case leakage scenarios:**
- Mixin content that itself contains axis markers → should produce error, not leak
- Malformed markers that look like mixin markers but aren't → should not be modified but also should not cause false positive in leakage scan
- Markers inside code blocks (``` fenced) → currently processed (may need a code-block-aware scanner — see Open Questions)

### Test Infrastructure

- **Minimal mocks needed:** The injection system is largely pure string transformation. Test with concrete mixin files in a fixtures directory.
- **Fixture structure:** Mirror the production layout: `fixtures/mixins/task-tracking/beads.md`, `fixtures/base/sample-prompt.md`, etc.
- **Snapshot testing:** For complex injection scenarios, use snapshot tests comparing actual output against golden files. This catches regressions in whitespace handling, section joining, and multi-marker interaction.
- **Parametrized tests:** Generate test cases from the cross product of verbs × mixins × argument combinations to ensure comprehensive coverage.

---

## Section 10: Open Questions & Recommendations

### Open Questions

1. **Should markers inside fenced code blocks be skipped?**
   Prompt authors may include example markers in code blocks for documentation purposes (e.g., showing users what a marker looks like). Currently, the parser would process these markers, replacing them — which corrupts the documentation. A code-block-aware scanner would skip markers between ``` delimiters.
   **Recommendation**: Implement code-block awareness. Scan for fenced code blocks first and mask their regions before running marker detection. This is a common pattern in markdown processors and prevents surprising behavior.

2. **Should mixin files support YAML frontmatter for metadata?**
   Currently, mixin files are treated as plain markdown with optional `<!-- section:... -->` delimiters. Adding YAML frontmatter could carry metadata like `description`, `applies-to-axes`, or `minimum-cli-version`. However, this adds complexity and the current design doesn't need it — config validation already ensures mixin files are valid.
   **Recommendation**: Defer. Strip frontmatter if present (the loading algorithm already does this), but don't define a schema for it until a concrete need arises.

3. **Should `scaffold validate` check mixin content constraints (no `##` headings, etc.)?**
   The spec states mixins must not add new heading-level sections to artifacts. This is currently enforced by convention. Should `scaffold validate` scan mixin files and error if they contain `##` headings?
   **Recommendation**: Yes, add this as a validation rule in domain 06. Mixin files should not contain `##` or higher-level headings. `###` and below are acceptable for structuring mixin content within a section.

4. **Should the injection system produce a "dry-run" diff showing what would change?**
   A `scaffold build --dry-run` might want to show a diff of each prompt before/after injection, letting prompt authors preview the effect of their mixin selections.
   **Recommendation**: Yes, this is valuable for prompt development. The `InjectionPipelineResult` already captures `replacedMarkers`, which can be rendered as a diff. Add a `--dry-run` output mode that shows marker → replacement pairs without writing output files.

### Recommendations

1. **ADR candidate: Verb registry in YAML vs. embedded in markdown.** Domain 04's open question 1 recommends a separate `verbs.yml` per mixin to cleanly separate prose content (injected at axis markers) from verb replacement templates (applied globally). This domain concurs — the injection system benefits from a clear separation between the two mixin roles:
   - Role A: Prose content files (`mixins/<axis>/<value>.md`) — injected at `<!-- mixin:<axis> -->` markers
   - Role B: Verb registry files (`mixins/task-tracking/<value>/verbs.yml`) — applied at `<!-- scaffold:task-* -->` markers

2. **Implement the fullContent property as preamble + sections concatenation.** When a prompt uses a full-content marker and the mixin has sections, the injected content should be all sections joined, not just the preamble. This ensures no content is lost when mixing full and sub-section usage of the same axis.

3. **Emit `INJ_AXIS_NOT_REFERENCED` warnings selectively.** Not every prompt should reference every configured axis. Only warn when a prompt's slug or frontmatter metadata suggests the axis is relevant (e.g., a prompt named `git-workflow` should probably reference the `git-workflow` axis). This heuristic prevents noisy warnings for prompts like `create-prd` that legitimately have no mixin markers.

4. **Consider a `scaffold inject --prompt <slug>` command** for debugging individual prompts through the injection pipeline. This would read one prompt, apply injection, and display the result without running the full build.

5. **Preserve source maps.** Track which line ranges in the injected output came from which mixin file. This aids debugging when agents encounter confusing instructions — the source map can tell the user "this instruction came from mixins/task-tracking/beads.md lines 15-23."

6. **Validate marker placement during `scaffold validate`.** Check that markers appear on their own lines, not embedded within paragraphs. While the parser handles inline markers, they produce harder-to-read output.

---

## Section 11: Concrete Examples

### Example 1: Happy Path — Git Workflow Prompt with 2 Axis Markers + 1 Task Verb

**Base prompt (`base/git-workflow.md`):**

```markdown
---
description: Configure git workflow for parallel agents
depends-on:
  - dev-env-setup
produces:
  - docs/git-workflow.md
phase: 3
---

# Git Workflow Setup

Set up the git workflow for this project, including branching strategy,
commit conventions, and PR process.

## Task Tracking Integration

<!-- mixin:task-tracking -->

## Branch Naming Convention

Name branches using the task tracking format:

<!-- scaffold:task-create "Setup branch naming conventions" priority=1 -->

After creating the tracking task, configure the branch naming pattern
in your git hooks.

## Closing Tasks After Merge

When a PR is merged, close the associated task:

<!-- mixin:task-tracking:close-workflow -->

## Agent Execution Model

<!-- mixin:agent-mode -->
```

**Mixin file (`mixins/task-tracking/beads.md`):**

```markdown
Scaffold uses Beads (`@beads/bd`) for task tracking. All tasks are tracked
in the `.beads/` directory with SQLite-backed storage.

### Key Commands

| Command | Purpose |
|---------|---------|
| `bd create "Title" -p N` | Create task with priority |
| `bd ready` | Show unblocked tasks |
| `bd close <id>` | Close completed task |

### Commit Format

All commits must include a Beads task ID: `[BD-<id>] type(scope): description`

<!-- section:close-workflow -->
When a PR is merged, close the associated task:

```bash
bd close <id>
bd sync
```

Then check for newly unblocked tasks:

```bash
bd ready
```

<!-- section:pr-integration -->
Before creating a PR, verify all related tasks are claimed:

```bash
bd list --status in_progress
```
```

**Mixin file (`mixins/agent-mode/multi.md`):**

```markdown
This project uses parallel agent execution in separate git worktrees.

### Worktree Setup

Each agent operates in its own worktree created by:

```bash
scripts/setup-agent-worktree.sh <agent-name>
```

### Agent Identity

Set `BD_ACTOR` for task attribution:

```bash
export BD_ACTOR="agent-1"
```

### Task Claiming

Always claim tasks before starting work to prevent conflicts:

<!-- scaffold:task-claim ID -->
```

**Config (`config.yml`):**
```yaml
mixins:
  task-tracking: beads
  agent-mode: multi
```

**Verb registry for beads:**
```yaml
templates:
  create:
    template: '`bd create "$TITLE" -p $PRIORITY`'
    format: inline-code
  claim:
    template: '`bd update $ID --claim`'
    format: inline-code
  close:
    template: '`bd close $ID`'
    format: inline-code
```

**Result after injection:**

```markdown
# Git Workflow Setup

Set up the git workflow for this project, including branching strategy,
commit conventions, and PR process.

## Task Tracking Integration

Scaffold uses Beads (`@beads/bd`) for task tracking. All tasks are tracked
in the `.beads/` directory with SQLite-backed storage.

### Key Commands

| Command | Purpose |
|---------|---------|
| `bd create "Title" -p N` | Create task with priority |
| `bd ready` | Show unblocked tasks |
| `bd close <id>` | Close completed task |

### Commit Format

All commits must include a Beads task ID: `[BD-<id>] type(scope): description`

## Branch Naming Convention

Name branches using the task tracking format:

`bd create "Setup branch naming conventions" -p 1`

After creating the tracking task, configure the branch naming pattern
in your git hooks.

## Closing Tasks After Merge

When a PR is merged, close the associated task:

When a PR is merged, close the associated task:

```bash
bd close <id>
bd sync
```

Then check for newly unblocked tasks:

```bash
bd ready
```

## Agent Execution Model

This project uses parallel agent execution in separate git worktrees.

### Worktree Setup

Each agent operates in its own worktree created by:

```bash
scripts/setup-agent-worktree.sh <agent-name>
```

### Agent Identity

Set `BD_ACTOR` for task attribution:

```bash
export BD_ACTOR="agent-1"
```

### Task Claiming

Always claim tasks before starting work to prevent conflicts:

`bd update ID --claim`
```

**Injection stats:**
- Axis markers replaced: 3 (task-tracking full, task-tracking:close-workflow, agent-mode full)
- Task verb markers replaced: 2 (task-create in original prompt, task-claim from injected agent-mode content)
- Unresolved markers: 0

Note: The `task-claim` marker inside the `agent-mode/multi.md` mixin content was found and replaced during stage 4 (task verb replacement) after stage 3 (axis replacement) injected the mixin content. This demonstrates the cross-content verb replacement behavior.

### Example 2: Same Prompt with Different Mixin Configuration (GitHub Issues)

Using the same `base/git-workflow.md` prompt as Example 1, but with:

**Config (`config.yml`):**
```yaml
mixins:
  task-tracking: github-issues
  agent-mode: single
```

**Mixin file (`mixins/task-tracking/github-issues.md`):**

```markdown
This project uses GitHub Issues for task tracking. All tasks are managed
through the `gh` CLI and the GitHub web interface.

### Key Commands

| Command | Purpose |
|---------|---------|
| `gh issue create --title "Title"` | Create issue |
| `gh issue list --label "ready"` | Show ready issues |
| `gh issue close <number>` | Close issue |

### Commit Format

All commits should reference an issue: `fixes #<number>` or `refs #<number>`

<!-- section:close-workflow -->
When a PR is merged, the associated issue closes automatically if the
PR body includes `fixes #<number>`. Otherwise, close manually:

```bash
gh issue close <number>
```

<!-- section:pr-integration -->
Link issues to PRs using the GitHub UI or by including `refs #<number>`
in the PR description.
```

**Mixin file (`mixins/agent-mode/single.md`):**

```markdown
This project uses a single-agent execution model. One Claude Code session
works through tasks sequentially.

### Execution Loop

1. Check for ready tasks: <!-- scaffold:task-ready -->
2. Claim the next task
3. Write failing tests, implement, verify
4. Create PR and close task
```

**Verb registry for github-issues:**
```yaml
templates:
  create:
    template: '`gh issue create --title "$TITLE" --label "priority:$PRIORITY"`'
    format: inline-code
  claim:
    template: '`gh issue edit $ID --add-assignee @me`'
    format: inline-code
  ready:
    template: '`gh issue list --label "ready"`'
    format: inline-code
```

**Result after injection:**

```markdown
# Git Workflow Setup

Set up the git workflow for this project, including branching strategy,
commit conventions, and PR process.

## Task Tracking Integration

This project uses GitHub Issues for task tracking. All tasks are managed
through the `gh` CLI and the GitHub web interface.

### Key Commands

| Command | Purpose |
|---------|---------|
| `gh issue create --title "Title"` | Create issue |
| `gh issue list --label "ready"` | Show ready issues |
| `gh issue close <number>` | Close issue |

### Commit Format

All commits should reference an issue: `fixes #<number>` or `refs #<number>`

## Branch Naming Convention

Name branches using the task tracking format:

`gh issue create --title "Setup branch naming conventions" --label "priority:1"`

After creating the tracking task, configure the branch naming pattern
in your git hooks.

## Closing Tasks After Merge

When a PR is merged, close the associated task:

When a PR is merged, the associated issue closes automatically if the
PR body includes `fixes #<number>`. Otherwise, close manually:

```bash
gh issue close <number>
```

## Agent Execution Model

This project uses a single-agent execution model. One Claude Code session
works through tasks sequentially.

### Execution Loop

1. Check for ready tasks: `gh issue list --label "ready"`
2. Claim the next task
3. Write failing tests, implement, verify
4. Create PR and close task
```

**Key differences from Example 1:**
- Task tracking references `gh` CLI instead of `bd`
- Agent mode content describes single-agent loop instead of worktrees
- The `task-ready` verb inside `agent-mode/single.md` was replaced with the GitHub Issues equivalent
- Same base prompt, completely different concrete output — demonstrating the composability value

### Example 3: Error Scenario — Circular Marker and Missing Section

**Prompt (`base/coding-standards.md`):**

```markdown
---
description: Create coding standards for the tech stack
---

## TDD Integration

<!-- mixin:tdd:enforcement-rules -->

## Commit Verification

<!-- mixin:nonexistent-axis -->
```

**Mixin file (`mixins/tdd/strict.md`):**

```markdown
Test-first always. No implementation code without a failing test.

<!-- section:exceptions -->
Exceptions: prompt text, documentation, config file edits.
```

**Config (`config.yml`):**
```yaml
mixins:
  tdd: strict
  # Note: no "nonexistent-axis" configured
```

**Injection result:**

```
Error INJ_SECTION_NOT_FOUND: Sub-section "enforcement-rules" not found in mixin
file "mixins/tdd/strict.md". Available sections: exceptions

Error INJ_UNRESOLVED_AXIS_MARKER: Axis "nonexistent-axis" is not configured in
config.yml. Add "mixins.nonexistent-axis: <value>" to .scaffold/config.yml or
remove this marker.
  At line 9 in prompt "coding-standards"

Build failed with 2 errors.
```

**Behavior:**
- The `<!-- mixin:tdd:enforcement-rules -->` marker fails because the `strict.md` mixin only has an `exceptions` section, not an `enforcement-rules` section. The error message lists available sections.
- The `<!-- mixin:nonexistent-axis -->` marker fails because no axis named `nonexistent-axis` exists in the config. Normally this would be caught by config validation first, but if the axis was never declared in any mixin (it's purely a prompt-side error), the injection system catches it.
- Both errors are fatal. The build exits with code 5.

### Example 4: Mixin with Verb Markers Inside (Cross-Content Replacement)

This example demonstrates the critical cross-content scenario where mixin content introduces new task verb markers.

**Prompt (`ext/beads-setup.md`):**

```markdown
---
description: Initialize Beads task tracking
---

# Initialize Task Tracking

## Setup

<!-- mixin:task-tracking -->

## First Task

Create the bootstrap task:

<!-- scaffold:task-create "Bootstrap project infrastructure" priority=0 -->
```

**Mixin file (`mixins/task-tracking/beads.md` — relevant portion):**

```markdown
Install Beads and initialize the project:

```bash
npm install -g @beads/bd
bd init --quiet
```

After initialization, create a setup task:

<!-- scaffold:task-create "Setup tracking infrastructure" priority=0 -->

Then claim it:

<!-- scaffold:task-claim LAST_ID -->
```

**After stage 3 (axis replacement):**

```markdown
# Initialize Task Tracking

## Setup

Install Beads and initialize the project:

```bash
npm install -g @beads/bd
bd init --quiet
```

After initialization, create a setup task:

<!-- scaffold:task-create "Setup tracking infrastructure" priority=0 -->

Then claim it:

<!-- scaffold:task-claim LAST_ID -->

## First Task

Create the bootstrap task:

<!-- scaffold:task-create "Bootstrap project infrastructure" priority=0 -->
```

Note: Three task verb markers are now present — two from the injected mixin content and one from the original prompt.

**After stage 4 (verb replacement — re-parsed):**

```markdown
# Initialize Task Tracking

## Setup

Install Beads and initialize the project:

```bash
npm install -g @beads/bd
bd init --quiet
```

After initialization, create a setup task:

`bd create "Setup tracking infrastructure" -p 0`

Then claim it:

`bd update LAST_ID --claim`

## First Task

Create the bootstrap task:

`bd create "Bootstrap project infrastructure" -p 0`
```

All three verb markers were replaced in stage 4 — including the two that were introduced by the mixin content in stage 3.

### Example 5: Empty/No-op Mixin (task-tracking: none)

**Prompt with task tracking markers, using the `none` mixin:**

**Config:**
```yaml
mixins:
  task-tracking: none
```

**Mixin file (`mixins/task-tracking/none.md`):**

```markdown
This project does not use automated task tracking.
Track tasks manually in `TODO.md` at the project root.

<!-- section:close-workflow -->
When a task is complete, strike through the entry in `TODO.md`:

Change `- [ ] [open] T-NNN: Title` to `- [x] [done] T-NNN: Title`
```

**Verb registry for none:**
```yaml
templates:
  create:
    template: |
      Add to `TODO.md`:
      ```
      - [ ] [open] [P$PRIORITY] T-NNN: $TITLE
      ```
      (Assign the next available T-NNN number.)
    format: prose
  ready:
    template: 'Review `TODO.md` for tasks marked `[open]` with no `blocked-by` entries.'
    format: prose
  close:
    template: 'In `TODO.md`, change `- [ ] [open]` to `- [x] [done]` for task `$ID`.'
    format: prose
```

**Result:** All markers are replaced with prose instructions for manual TODO.md management. The output is valid, complete, and agent-executable — just with different (manual) tooling.

---

*This document is the authoritative reference for mixin injection mechanics in Scaffold v2. All cross-references use relative file paths within `docs/v2/domain-models/`. For the complete pipeline context, see the [v2 spec](../reference/scaffold-v2-spec.md).*
