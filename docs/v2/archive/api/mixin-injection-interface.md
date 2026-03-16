# Scaffold v2 — Mixin Injection Interface

**Status: Superseded** by meta-prompt architecture (ADR-041). Mixin injection is eliminated entirely; AI adapts prompt content natively from project configuration and user instructions. This document is preserved as historical reference.

**Phase**: 5 — API Contract Specification
**Depends on**: [Domain Model 04](../domain-models/04-abstract-task-verbs.md), [Domain Model 12](../domain-models/12-mixin-injection.md), [ADR-006](../adrs/ADR-006-mixin-injection-over-templating.md), [ADR-035](../adrs/ADR-035-non-recursive-injection.md), [Architecture Section 4a](../architecture/system-architecture.md)
**Last updated**: 2026-03-14
**Status**: superseded

---

## Section 1: Pipeline Overview

The mixin injection pipeline is a **two-pass, non-recursive, build-time-only** text transformation system. It receives resolved prompt files from the Prompt Resolver and produces fully-injected prompt content that is handed to Platform Adapters. Injection never happens at runtime — `scaffold resume` consumes pre-built output without touching markers.

### Two-Pass Architecture

The pipeline processes each prompt through two ordered passes ([ADR-006](../adrs/ADR-006-mixin-injection-over-templating.md), [ADR-035](../adrs/ADR-035-non-recursive-injection.md)):

**Pass 1 — Axis Marker Replacement**: All `<!-- mixin:<axis> -->` and `<!-- mixin:<axis>:<sub-section> -->` markers in the prompt body are replaced with content loaded from `content/mixins/<axis>/<value>.md`. Pass 1 operates on the original prompt text only.

**Pass 2 — Task Verb Marker Replacement**: All `<!-- scaffold:task-<verb> [args] -->` markers are replaced with concrete task-tracking commands from the selected task-tracking mixin's verb registry. Pass 2 operates on the **entire post-Pass-1 content** — including text that was injected during Pass 1 ([ADR-037](../adrs/ADR-037-task-verb-global-scope.md)). This is why the two passes are ordered axis-first: mixin content may contain task verb markers that must be resolved in Pass 2.

**Post-Pass Unresolved Check**: After both passes complete, the pipeline scans the result for any remaining `<!-- mixin:* -->` or `<!-- scaffold:task-* -->` markers. By default, surviving markers are errors that abort the build. The `--allow-unresolved-markers` flag downgrades these to warnings ([ADR-035](../adrs/ADR-035-non-recursive-injection.md)).

### Non-Recursive Guarantee

Content injected during Pass 1 is **not** re-scanned for axis markers. Axis markers within mixin content are left unresolved and caught by the post-pass check. Content injected during Pass 2 is **not** re-scanned for further verb markers. The pipeline terminates after exactly two passes — no depth limiting or cycle detection is required because recursion is structurally impossible ([ADR-035](../adrs/ADR-035-non-recursive-injection.md)).

This is the one valid cross-boundary dependency:

```
Axis markers (Pass 1) → may inject content containing task verb markers → resolved in Pass 2
Task verb markers (Pass 2) → never inject content containing axis markers → no further pass needed
```

### Build-Time Only

Injection is a stage in `scaffold build`. The Mixin Injector sits between the Prompt Resolver and the Dependency Resolver in the build pipeline:

```
Config Loader → Prompt Resolver → Mixin Injector → Dependency Resolver → Platform Adapters
```

At runtime (`scaffold resume`, `scaffold next`, `scaffold status`), scaffold reads pre-built output files that contain no markers. No mixin injection, no verb replacement, no marker scanning occurs outside of `scaffold build` and `scaffold validate`.

---

## Section 2: Pipeline Interface

### Top-Level Interface

```typescript
interface MixinInjectionPipeline {
  /**
   * Run the full two-pass injection on a single prompt.
   *
   * Pass 1: Replace all <!-- mixin:<axis> --> and <!-- mixin:<axis>:<sub-section> -->
   *         markers with content from the corresponding mixin files.
   * Pass 2: Replace all <!-- scaffold:task-<verb> [args] --> markers with concrete
   *         commands from the verb registry. Operates on the entire post-Pass-1 content,
   *         including content that was injected during Pass 1.
   * Post:   Scan for any remaining unresolved markers. Report errors (or warnings if
   *         allowUnresolvedMarkers is set in config).
   *
   * @param input  The resolved prompt, loaded mixin files, verb registry, and config flags.
   * @returns      Injected content, replacement records, warnings, and errors.
   */
  inject(input: InjectionInput): InjectionResult;
}
```

### `InjectionInput`

```typescript
interface InjectionInput {
  /**
   * The resolved prompt from the Prompt Resolver (domain 01).
   * Provides the prompt slug, file path, and parsed frontmatter.
   * See [frontmatter-schema](../data/frontmatter-schema.md) for the file-level definition.
   */
  prompt: ResolvedPrompt;

  /**
   * The raw markdown body of the prompt file, with YAML frontmatter already stripped.
   * This is the content that will have markers replaced.
   */
  rawContent: string;

  /**
   * Loaded mixin files for all axes declared in config.yml.
   * Keyed by axis name (e.g., 'task-tracking', 'tdd', 'git-workflow').
   * Each value is the fully parsed mixin file including sections and preamble.
   * See [config-yml-schema](../data/config-yml-schema.md) for the `mixins` configuration block.
   */
  mixinFiles: Map<string, MixinFile>;

  /**
   * The verb registry for the selected task-tracking mixin.
   * Provides concrete replacement templates for all 13 abstract task verbs.
   */
  verbRegistry: VerbRegistry;

  /**
   * When true, surviving unresolved markers after both passes are reported
   * as warnings instead of errors. Corresponds to the --allow-unresolved-markers
   * build flag. Default: false.
   */
  allowUnresolvedMarkers: boolean;
}
```

### `InjectionResult`

```typescript
interface InjectionResult {
  /** The prompt slug (same as input). */
  slug: string;

  /**
   * The fully-injected prompt content after both passes complete.
   * All axis markers and task verb markers have been replaced.
   * Ready for consumption by Platform Adapters (domain 05).
   * Adapters receive this string as their input — they never see raw markers.
   */
  injectedContent: string;

  /** The resolved prompt record passed through unchanged from input.
   * See [frontmatter-schema](../data/frontmatter-schema.md) for prompt frontmatter fields.
   */
  prompt: ResolvedPrompt;

  /**
   * Every marker that was successfully replaced, in document order.
   * Includes axis markers (both full-content and sub-section) and task verb markers.
   * Used for build diagnostics, verbose output, and validate reporting.
   */
  replacedMarkers: ReplacedMarker[];

  /**
   * Non-fatal issues that occurred during injection.
   * Does not prevent injection from succeeding.
   * Examples: empty mixin file, verb degradation, duplicate section names.
   */
  warnings: InjectionWarning[];

  /**
   * Fatal issues that occurred during injection.
   * When allowUnresolvedMarkers is false, unresolved markers are errors.
   * When allowUnresolvedMarkers is true, unresolved markers are downgraded to warnings.
   * INJ_SECTION_NOT_FOUND is always an error — it cannot be downgraded.
   */
  errors: InjectionError[];

  /**
   * Whether injection succeeded.
   * true  = no errors (warnings may be present)
   * false = one or more errors remain after flag evaluation
   */
  success: boolean;
}
```

### Supporting Types

```typescript
/**
 * Record of a marker that was successfully replaced during injection.
 */
interface ReplacedMarker {
  /** The original marker (axis or task-verb) that was replaced. */
  marker: InjectionMarker;

  /** The text that replaced the marker. */
  replacement: string;

  /** Where the replacement content came from. */
  source: ReplacementSource;
}

interface ReplacementSource {
  /** The type of replacement performed. */
  kind: 'axis-full' | 'axis-subsection' | 'task-verb';

  /** For axis replacements: absolute path to the mixin file. */
  mixinFilePath?: string;

  /** For axis-subsection: the section name within the mixin file. */
  sectionName?: string;

  /** For task-verb: the task-tracking mixin name (e.g., 'beads'). */
  verbMixin?: string;
}

/**
 * Union type for all markers the injection system processes.
 */
type InjectionMarker = AxisMarker | TaskVerbMarker;
```

---

## Section 3: Marker Format Contracts

All markers are HTML comments. The injection system recognizes exactly two marker families. All other HTML comments — including `<!-- scaffold:managed by ... -->`, `<!-- scaffold:<slug> v... -->`, and `<!-- section:<name> -->` — pass through the injection pipeline unchanged.

### 3.1 Axis Markers

Axis markers appear in prompt files and are replaced during Pass 1.

#### Full-Content Axis Marker

Injects the entire content of the mixin file (preamble plus all named sections, with delimiter lines stripped, joined by double newlines).

**Regex (PCRE)**:

```pcre
^<!--\s*mixin:(?P<axis>[a-z][a-z0-9-]*)\s*-->$
```

| Capture Group | Semantics |
|---------------|-----------|
| `axis` | The mixin axis name. Must match a key in `config.yml` `mixins` (e.g., `task-tracking`, `tdd`, `git-workflow`, `agent-mode`, `interaction-style`). |

**Where it appears**: Prompt body (base prompts, methodology overrides, methodology extensions, custom prompts). Never inside mixin files (axis markers in mixin content are a recursion attempt and are detected as unresolved markers, producing `INJ_UNRESOLVED_AXIS_MARKER`).

**Replacement**: `MixinFile.fullContent` — the mixin's preamble concatenated with all named section contents, with section delimiter lines stripped. If the mixin file has no section delimiters, `fullContent` equals the entire file content.

**Example**: `<!-- mixin:task-tracking -->` is replaced with the full content of `content/mixins/task-tracking/beads.md` (when `config.yml` specifies `task-tracking: beads`).

#### Sub-Section Axis Marker

Injects only a named section from the mixin file, trimmed of leading and trailing blank lines.

**Regex (PCRE)**:

```pcre
^<!--\s*mixin:(?P<axis>[a-z][a-z0-9-]*):(?P<sub_section>[a-z][a-z0-9-]*)\s*-->$
```

| Capture Group | Semantics |
|---------------|-----------|
| `axis` | The mixin axis name. Same constraints as full-content marker. |
| `sub_section` | The section name within the mixin file. Must match a `<!-- section:<name> -->` delimiter in the mixin file. |

**Where it appears**: Prompt body only. Same placement rules as full-content axis markers.

**Replacement**: `MixinFile.sections.get(sub_section).content` — the trimmed content of the named section.

**Error on missing section**: `INJ_SECTION_NOT_FOUND` (always fatal — cannot be downgraded by `--allow-unresolved-markers`). The error message lists all available section names in the mixin file.

**Example**: `<!-- mixin:task-tracking:close-workflow -->` injects only the `close-workflow` section of the task-tracking mixin.

#### Multiple Markers per Axis

A prompt may contain multiple markers for the same axis. Each marker is replaced independently. A full-content marker and a sub-section marker for the same axis may appear in the same prompt.

### 3.2 Task Verb Markers

Task verb markers appear in prompt bodies and in mixin content. They are replaced globally during Pass 2 — no region of the post-Pass-1 content is excluded ([ADR-037](../adrs/ADR-037-task-verb-global-scope.md)).

#### Task Verb Marker Format

**Regex (PCRE)**:

```pcre
^(?P<full_marker><!--\s*scaffold:task-(?P<verb>[a-z][a-z0-9-]*)\s*(?P<args_raw>(?:"(?:[^"\\]|\\.)*"|\s+[a-z][a-z0-9_-]*=[^\s]+)*)\s*-->)$
```

| Capture Group | Semantics |
|---------------|-----------|
| `full_marker` | The entire HTML comment including delimiters. Used as the literal string to replace. |
| `verb` | The task operation name. Must match one of the 13 recognized `VerbName` values. |
| `args_raw` | The raw argument string after the verb name, before parsing. May be empty. |

**Where it appears**: Prompt body AND mixin content. Verb markers in mixin content are resolved in Pass 2 after the mixin content has been injected into the prompt during Pass 1. Verb markers in the original prompt body are also resolved in Pass 2.

**Single-line constraint**: Each task verb marker must occupy exactly one line. Multi-line markers are not supported.

**Replacement**: The concrete command string produced by template interpolation from the verb registry entry for the selected task-tracking mixin. May be a single command, a multi-line code block, or prose (for the `none` mixin).

**Example**: `<!-- scaffold:task-create "Set up CI pipeline" priority=1 -->` becomes `` `bd create "Set up CI pipeline" -p 1` `` when `task-tracking: beads`.

#### Argument Grammar

Arguments follow the `verb` in the marker, separated by whitespace. Two argument forms are recognized:

**Positional argument** — a double-quoted string:

```pcre
"(?P<value>(?:[^"\\]|\\.)*)"
```

Positional arguments are indexed from 0 in the order they appear. Named arguments between positional arguments do not affect positional indexing.

**Named argument** — a `key=value` pair:

```pcre
(?P<key>[a-z][a-z0-9_-]*)=(?P<val>[^\s]+)
```

Named argument keys allow underscores (e.g., `add_assignee`) to accommodate backends that use underscored field names. Values extend to the next whitespace character.

**EBNF grammar**:

```ebnf
marker      = "<!--" ws "scaffold:task-" verb ws? args? ws? "-->"
verb        = ALPHA (ALPHA | "-")*
args        = arg (ws arg)*
arg         = quoted_arg | named_arg
quoted_arg  = '"' (CHAR - '"' | '\\"')* '"'
named_arg   = key "=" value
key         = ALPHA (ALPHA | DIGIT | "-" | "_")*
value       = quoted_arg | bare_value
bare_value  = (CHAR - WS)+
ws          = (SPACE | TAB)+
```

**Escape sequences within quoted strings**:

| Sequence | Meaning |
|----------|---------|
| `\"` | Literal double quote |
| `\\` | Literal backslash |

No other escape sequences are defined.

**Valid verb names** (regex for validation):

```pcre
^(?:create|list|ready|claim|close|dep-add|dep-tree|dep-remove|dep-cycles|show|sync|update|create-and-claim)$
```

### 3.3 Section Delimiters (Inside Mixin Files)

Section delimiters appear only inside mixin files. They are not injection markers — the injection engine parses them when loading mixin files, before injection begins. They do not appear in prompt files and are never passed through to output.

**Regex (PCRE)**:

```pcre
^<!--\s*section:(?P<section_name>[a-z][a-z0-9-]*)\s*-->$
```

| Capture Group | Semantics |
|---------------|-----------|
| `section_name` | The name of the section being opened. Must be unique within the mixin file (duplicates produce `INJ_DUPLICATE_SECTION_NAME` warning; last definition wins). |

**Structural rules**:

- Each delimiter must occupy its own line.
- A section extends from the delimiter line (exclusive) to the next delimiter line (exclusive) or end-of-file.
- Content before the first delimiter is the "preamble." It is included in full-content injection but cannot be targeted by a sub-section marker.
- If a mixin file has no section delimiters, the entire file content is the preamble, and `fullContent` equals the preamble.

---

## Section 4: Mixin File Contract

A mixin file is a plain markdown file located at `content/mixins/<axis>/<value>.md`. It is loaded once at the start of the injection pipeline and reused for every prompt that references the axis.

### Required Structure

- **Plain markdown**: No special file format beyond standard markdown.
- **Optional YAML frontmatter**: If present, it is stripped before injection. Mixin files are not required to have frontmatter.
- **Optional section delimiters**: `<!-- section:<name> -->` lines divide the file into named sections (see Section 3.3). Without delimiters, the entire file is the preamble.
- **No axis markers**: Mixin files MUST NOT contain `<!-- mixin:<axis> -->` markers. Any such markers are unresolved after Pass 1 and produce `INJ_UNRESOLVED_AXIS_MARKER` errors. This enforces the non-recursive guarantee ([ADR-035](../adrs/ADR-035-non-recursive-injection.md)).
- **May contain task verb markers**: Mixin files MAY contain `<!-- scaffold:task-<verb> [args] -->` markers. These are resolved during Pass 2 after the mixin content has been injected into prompts.
- **No `##` or deeper headings**: Mixin files MUST NOT introduce `##`-level or deeper markdown headings. This preserves artifact-schema stability by preventing injected content from creating new sections in the host prompt's heading structure ([ADR-006](../adrs/ADR-006-mixin-injection-over-templating.md)).

### Verb Coverage Requirement (Task-Tracking Mixins Only)

The mixin file for the `task-tracking` axis has an additional constraint: it must provide a replacement entry for **all 13 verbs** in the vocabulary. An entry is either a template string or an explicit `unsupportedBehavior` declaration (`omit`, `comment`, or `degrade`). A mixin file with missing verb entries is a build-time error — the mixin is considered incomplete and cannot be used.

### Content Before First Delimiter

Content before the first `<!-- section:<name> -->` delimiter is the preamble. The preamble is:
- Included in full-content injection (`<!-- mixin:<axis> -->`)
- **Not** addressable as a named section (`<!-- mixin:<axis>:preamble -->` would produce `INJ_SECTION_NOT_FOUND`)

### `fullContent` Computation

```
fullContent = preamble + "\n\n" + section_1.content + "\n\n" + section_2.content + ...
```

Section delimiter lines are stripped. Empty sections are omitted from the join. If the mixin has no sections, `fullContent = preamble`.

---

## Section 5: Verb Registry Contract

The verb registry is the lookup table that maps abstract verb names to concrete replacement templates for a specific task-tracking mixin. One registry exists per task-tracking mixin value.

### Interface

```typescript
interface VerbRegistry {
  /**
   * The task-tracking mixin this registry belongs to.
   * One of: 'beads', 'github-issues', 'none'.
   */
  readonly mixin: string;

  /** The complete set of registered verb names (all 13 must be present). */
  readonly verbs: ReadonlySet<VerbName>;

  /**
   * Look up the concrete replacement for a verb + argument combination.
   *
   * @param verb   The abstract verb name.
   * @param args   Parsed argument object from the marker.
   * @returns      A VerbReplacement — either the interpolated concrete text,
   *               a degradation comment, or an omit directive.
   * @throws       If verb is not in the vocabulary (INJ_UNRESOLVED_VERB_MARKER).
   */
  resolve(verb: VerbName, args: VerbArguments): VerbReplacement;
}
```

### `VerbName`

The complete vocabulary of 13 recognized verbs:

```typescript
type VerbName =
  | 'create'           // Create a new task
  | 'list'             // List all tasks
  | 'ready'            // Show unblocked tasks ready for work
  | 'claim'            // Claim/assign a task to the current agent
  | 'close'            // Mark a task complete
  | 'dep-add'          // Add a dependency between tasks
  | 'dep-tree'         // Visualize the dependency graph
  | 'dep-remove'       // Remove a dependency between tasks
  | 'dep-cycles'       // Check for circular dependencies
  | 'show'             // Show details of a single task
  | 'sync'             // Force sync/persist task state
  | 'update'           // Update task fields (status, description)
  | 'create-and-claim'; // Atomic create + claim (common pattern)
```

### `VerbArguments`

```typescript
interface VerbArguments {
  /**
   * Positional arguments in order of appearance.
   * Index 0 is the first quoted string in the marker.
   */
  positional: string[];

  /**
   * Named arguments as key-value pairs.
   * All values are strings; numeric interpretation is the template's responsibility.
   */
  named: Record<string, string>;
}
```

### `VerbReplacement`

```typescript
interface VerbReplacement {
  /**
   * The concrete text to substitute for the marker.
   * null when action is 'omit'.
   */
  text: string | null;

  /**
   * How to render the replacement text in the output prompt.
   * - 'inline-code': wrapped in backticks
   * - 'code-block':  wrapped in a fenced code block
   * - 'prose':       inserted as plain text
   * - 'omit':        marker is removed entirely; text is null
   */
  action: 'inline-code' | 'code-block' | 'prose' | 'omit';

  /**
   * Whether this is a degraded replacement (the mixin does not natively support
   * the verb, and a best-effort alternative was used).
   * Degraded replacements produce INJ_VERB_DEGRADED warnings.
   */
  degraded: boolean;
}
```

### Verb Vocabulary Table

The following table defines the concrete replacement for every verb in every task-tracking mixin. Template placeholders use `$NAME` syntax corresponding to the verb's argument schema.

#### Argument Schemas

| Verb | Required Positional | Optional Positional | Named Parameters |
|------|-------------------|-------------------|-----------------|
| `create` | `$TITLE` | — | `priority=$PRIORITY` (required) |
| `list` | — | — | `status=$STATUS`, `actor=$ACTOR` |
| `ready` | — | — | — |
| `claim` | `$ID` | — | — |
| `close` | `$ID` | — | — |
| `dep-add` | `$CHILD`, `$PARENT` | — | — |
| `dep-tree` | — | `$ID` | — |
| `dep-remove` | `$CHILD`, `$PARENT` | — | — |
| `dep-cycles` | — | — | — |
| `show` | `$ID` | — | — |
| `sync` | — | — | — |
| `update` | `$ID` | — | `status=$STATUS`, plus freeform `key=value` pairs |
| `create-and-claim` | `$TITLE` | — | `priority=$PRIORITY` (required) |

#### Replacements: Beads (`task-tracking: beads`)

| Verb | Concrete Replacement | Format |
|------|---------------------|--------|
| `create` | `bd create "$TITLE" -p $PRIORITY` | inline-code |
| `list` | `bd list` (append `--status $STATUS` if `status` arg present; `--actor $ACTOR` if `actor` arg present) | inline-code |
| `ready` | `bd ready` | inline-code |
| `claim` | `bd update $ID --claim` | inline-code |
| `close` | `bd close $ID` | inline-code |
| `dep-add` | `bd dep add $CHILD $PARENT` | inline-code |
| `dep-tree` | `bd dep tree` (append `$ID` if ID arg present) | inline-code |
| `dep-remove` | `bd dep remove $CHILD $PARENT` | inline-code |
| `dep-cycles` | `bd dep cycles` | inline-code |
| `show` | `bd show $ID` | inline-code |
| `sync` | `bd sync` | inline-code |
| `update` | `bd update $ID` (append `--status $STATUS` and/or `--description "$DESCRIPTION"` if provided) | inline-code |
| `create-and-claim` | `bd create "$TITLE" -p $PRIORITY` then `bd update <id> --claim` | code-block |

#### Replacements: GitHub Issues (`task-tracking: github-issues`)

| Verb | Concrete Replacement | Format | Notes |
|------|---------------------|--------|-------|
| `create` | `gh issue create --title "$TITLE" --label "priority:$PRIORITY"` | inline-code | |
| `list` | `gh issue list` (append `--label "$STATUS"` / `--assignee $ACTOR` if present) | inline-code | |
| `ready` | `gh issue list --label "ready"` | inline-code | |
| `claim` | `gh issue edit $ID --add-assignee @me` | inline-code | |
| `close` | `gh issue close $ID` | inline-code | |
| `dep-add` | `gh issue comment $CHILD --body "blocked by #$PARENT"` | inline-code | Advisory only — no enforcement |
| `dep-tree` | Review issue cross-references to trace dependency chains | prose (degraded) | No native dependency graph |
| `dep-remove` | `gh issue comment $CHILD --body "no longer blocked by #$PARENT"` | inline-code | |
| `dep-cycles` | Review open issues for circular "blocked by" references | prose (degraded) | No native cycle detection |
| `show` | `gh issue view $ID` | inline-code | |
| `sync` | *(omitted)* | omit | GitHub is always remote; no-op |
| `update` | `gh issue edit $ID` (append `--add-label "$STATUS"` / `--body "$DESCRIPTION"` if present) | inline-code | |
| `create-and-claim` | `gh issue create --title "$TITLE" --label "priority:$PRIORITY" --assignee @me` | inline-code | |

#### Replacements: None / Manual (`task-tracking: none`)

The `none` mixin uses a structured `TODO.md` file in the project root. Task IDs use the `T-NNN` format (e.g., `T-001`). Priority tags are `[P0]`–`[P3]`. Status tags are `[open]`, `[in-progress]`, `[blocked]`, `[done]`. Dependencies use `blocked-by: T-NNN` lines indented under the task entry.

| Verb | Concrete Replacement | Format | Notes |
|------|---------------------|--------|-------|
| `create` | Add `- [ ] [open] [P$PRIORITY] T-NNN: $TITLE` to `TODO.md` | prose | |
| `list` | Review `TODO.md` for all task entries | prose | |
| `ready` | Check `TODO.md` for `[open]` tasks with no unfinished `blocked-by:` targets | prose | |
| `claim` | Update `$ID` status tag from `[open]` to `[in-progress]` in `TODO.md` | prose | |
| `close` | Set `$ID`'s checkbox to `[x]` and status to `[done]` in `TODO.md` | prose | |
| `dep-add` | Add `  blocked-by: $PARENT` on the line after `$CHILD` in `TODO.md` | prose | |
| `dep-tree` | Review `blocked-by:` annotations in `TODO.md` to trace the dependency chain | prose (degraded) | |
| `dep-remove` | Remove the `blocked-by: $PARENT` line under `$CHILD` in `TODO.md` | prose | |
| `dep-cycles` | Manually review `blocked-by:` chains in `TODO.md` for circular references | prose (degraded) | |
| `show` | Read the `$ID` entry and any indented sub-lines in `TODO.md` | prose | |
| `sync` | `git add TODO.md && git commit -m "chore: update task tracking"` | inline-code | |
| `update` | Update `$ID`'s status tag or description text in `TODO.md` | prose | |
| `create-and-claim` | Add `- [ ] [in-progress] [P$PRIORITY] T-NNN: $TITLE` to `TODO.md` | prose | Created already in-progress |

### Declaring Verb Entries

To create a new task-tracking mixin (e.g., for Linear, Jira, or GitHub Issues), the mixin author provides verb replacements through the replacement tables above. There is no separate configuration file or YAML frontmatter block for the verb registry — the registry is defined by the replacement table entries in this specification document and implemented in code as a `VerbRegistry` instance.

Concretely, a mixin author must:

1. **Create the mixin markdown file** at `content/mixins/task-tracking/<mixin-name>.md`. This file provides the prose content injected by axis markers (Pass 1) and may contain `<!-- scaffold:task-<verb> -->` markers that reference the author's own verb entries.

2. **Implement a `VerbRegistry`** that covers all 13 verbs in the vocabulary. For each verb, provide one of:
   - A **template string** with `$PLACEHOLDER` variables matching the verb's argument schema (see the Argument Schemas table above), plus an `action` format (`inline-code`, `code-block`, or `prose`).
   - An **`unsupportedBehavior` declaration** of `omit` (remove the marker silently), `comment` (insert an HTML comment explaining the gap), or `degrade` (insert a best-effort prose alternative, which triggers an `INJ_VERB_DEGRADED` warning).

3. **Add a replacement table** in this document following the same format as the Beads, GitHub Issues, and None tables above — one row per verb, with columns for Verb, Concrete Replacement, Format, and optional Notes.

The replacement tables in this document serve as both the specification and the reference implementation. At build time, the `VerbRegistry` for the selected `task-tracking` mixin is constructed from these definitions and used by Pass 2 of the injection pipeline. A mixin missing any of the 13 verb entries is rejected at build time with `INJ_VERB_UNSUPPORTED`.

---

## Section 6: Error Contract

The injection system follows the **accumulate-and-report** error handling philosophy at build time: all errors and warnings are gathered across all prompts before the build exits ([ADR-040](../adrs/ADR-040-error-handling-philosophy.md)). Errors produce a non-zero exit code; warnings alone do not.

The `--allow-unresolved-markers` flag downgrades `INJ_UNRESOLVED_AXIS_MARKER` and `INJ_UNRESOLVED_VERB_MARKER` to warnings. All other error codes listed below remain fatal regardless of flags.

### Error Codes

#### `INJ_MIXIN_FILE_NOT_FOUND`

| Property | Value |
|----------|-------|
| Exit code | 5 |
| Severity | Error (always fatal) |
| When | A configured mixin axis has no corresponding file at `content/mixins/<axis>/<value>.md`. This should not occur after config validation passes, but is checked defensively by the injector. |
| Message template | `Mixin file not found: content/mixins/{axis}/{value}.md. Verify that mixins.{axis}: {value} in config.yml matches an installed mixin file.` |
| Recovery | Confirm the mixin axis and value in `config.yml`. Run `scaffold list` to see installed mixin values for each axis. |

#### `INJ_SECTION_NOT_FOUND`

| Property | Value |
|----------|-------|
| Exit code | 5 |
| Severity | Error (always fatal — NOT downgraded by `--allow-unresolved-markers`) |
| When | A sub-section marker (`<!-- mixin:<axis>:<sub-section> -->`) references a section name that does not exist in the mixin file. |
| Message template | `Sub-section "{sub_section}" not found in mixin file "{file_path}". Available sections: {comma_separated_list}. Prompt: {prompt_slug}, line {line}.` |
| Recovery | Check the sub-section name spelling in the prompt marker. The error message lists all valid section names defined in the mixin file. Update either the marker or the mixin file to agree on the section name. |

#### `INJ_UNRESOLVED_AXIS_MARKER`

| Property | Value |
|----------|-------|
| Exit code | 5 |
| Severity | Error by default; downgraded to warning with `--allow-unresolved-markers` |
| When | An axis marker (`<!-- mixin:<axis> -->` or `<!-- mixin:<axis>:<sub-section> -->`) survives after Pass 1. Causes: (a) the axis is not configured in `config.yml`, or (b) the marker was inside mixin content (recursion attempt). |
| Message template | `Unresolved axis marker "<!-- mixin:{axis} -->" at line {line} in prompt "{prompt_slug}". Either configure "mixins.{axis}" in config.yml or remove this marker. If this marker is inside a mixin file, note that axis markers in mixin content are not resolved (non-recursive injection).` |
| Recovery | Add the missing axis to `config.yml`, or remove the marker. If the marker was intentionally deferred during development, use `--allow-unresolved-markers` to proceed. |

#### `INJ_UNRESOLVED_VERB_MARKER`

| Property | Value |
|----------|-------|
| Exit code | 5 |
| Severity | Error by default; downgraded to warning with `--allow-unresolved-markers` |
| When | A task verb marker (`<!-- scaffold:task-<verb> -->`) survives after Pass 2. Causes: (a) the verb name is not in the 13-verb vocabulary, or (b) the mixin's verb registry has no entry for the verb. |
| Message template | `Unresolved task verb marker "<!-- scaffold:task-{verb} -->" at line {line} in prompt "{prompt_slug}". Verb "{verb}" has no replacement in the "{mixin}" task-tracking mixin.` |
| Recovery | Verify the verb name is spelled correctly. If the verb is not in the 13-verb vocabulary, it cannot be used — use prose instead. If the mixin is missing a verb entry, add one to the mixin's verb registry. |

#### `INJ_VERB_UNSUPPORTED`

| Property | Value |
|----------|-------|
| Exit code | 5 |
| Severity | Error |
| When | A verb marker references a known verb, but the selected task-tracking mixin has no template and no `unsupportedBehavior` declaration for that verb. Every mixin must explicitly handle all 13 verbs; this error indicates an incomplete mixin. |
| Message template | `Task verb "task-{verb}" is not supported by the "{mixin}" mixin and has no fallback behavior defined. The mixin at "{file_path}" is missing a verb registry entry for "{verb}".` |
| Recovery | Add a verb registry entry to the mixin file. Provide either a template string or an `unsupportedBehavior` of `omit`, `comment`, or `degrade`. A mixin that ships without all 13 verbs covered is considered incomplete. |

#### `INJ_INVALID_MARKER_SYNTAX`

| Property | Value |
|----------|-------|
| Exit code | 5 |
| Severity | Error (always fatal) |
| When | A `<!-- scaffold:task-` prefix is found but the marker cannot be parsed. Sub-cases: unclosed double quote in a positional argument (`VERB_UNCLOSED_QUOTE`), empty verb name after `task-` (`VERB_MALFORMED_MARKER`), or a required argument is missing (`VERB_MISSING_REQUIRED_ARG`). |
| Message template | `Malformed task verb marker at line {line} in prompt "{prompt_slug}": {raw_text}. {specific_issue}. Usage: <!-- scaffold:task-{verb} {usage_hint} -->` |
| Recovery | Fix the marker syntax at the indicated line. The error message includes the raw marker text and a usage hint showing the correct argument format for the verb. |

#### `INJ_MIXIN_FILE_READ_ERROR`

| Property | Value |
|----------|-------|
| Exit code | 5 |
| Severity | Error |
| When | A mixin file exists at the expected path but cannot be read due to filesystem issues (permissions, encoding errors, I/O failure). Distinct from `INJ_MIXIN_FILE_NOT_FOUND` where the file does not exist at all. |
| Message template | `Cannot read mixin file "{file_path}" for axis "{axis}": {system_error}. Check file permissions and encoding (UTF-8 required).` |
| Recovery | Verify the mixin file has read permissions and is valid UTF-8 encoded text. Check for filesystem-level issues (disk errors, broken symlinks). |

#### `INJ_MIXIN_CONTAINS_AXIS_MARKER`

| Property | Value |
|----------|-------|
| Exit code | 5 |
| Severity | Error (always fatal) |
| When | An axis marker is detected in injected content after Pass 1 completes. This is the unresolved marker check's result when a mixin file was found to contain `<!-- mixin:* -->` markers. Reported as a more specific error than the generic `INJ_UNRESOLVED_AXIS_MARKER` when provenance can be traced to a mixin file. |
| Message template | `Axis marker "<!-- mixin:{axis} -->" found in injected content from mixin file "{mixin_file_path}". Mixin files must not contain axis markers (non-recursive injection). Prompt: "{prompt_slug}".` |
| Recovery | Remove axis markers from the mixin file. If the mixin needs content from another axis, the base prompt must include explicit markers for both axes instead of nesting them. |

### Warning Codes

| Code | When | Downgrade Source |
|------|------|-----------------|
| `INJ_UNRESOLVED_DOWNGRADED` | An unresolved axis or verb marker was downgraded from error to warning by `--allow-unresolved-markers`. | Via escape hatch |
| `INJ_VERB_DEGRADED` | A verb was replaced with a degraded alternative (mixin's `unsupportedBehavior` is `degrade` or `comment`). | By design |
| `INJ_EMPTY_MIXIN_FILE` | A mixin file exists but has no content after stripping frontmatter. | File is valid but empty |
| `INJ_EMPTY_SECTION` | A named section in a mixin file exists but has no content. | Section is valid but empty |
| `INJ_DUPLICATE_SECTION_NAME` | A mixin file defines the same section name twice. Last definition wins. | Mixin file authoring issue |
| `INJ_AXIS_NOT_REFERENCED` | A configured mixin axis has no markers in this prompt. Informational — the prompt is valid but does not use the axis. | Informational |

---

## Section 7: Integration with Platform Adapters

The injection pipeline's output is the direct input to platform adapters. Understanding this boundary is essential for implementing both the injector and any adapter.

### The Injection-to-Adapter Handoff

After both passes complete and the unresolved marker check passes, `InjectionResult.injectedContent` contains the fully-injected prompt as a plain markdown string. This string is what platform adapters receive.

**Adapters never see raw markers.** The invariant at the adapter boundary:

```
For every prompt P in the build pipeline:
  adapter.input.injectionResult.injectedContent = injectionPipeline.inject(P).injectedContent
  AND injectionResult(P).errors is empty (or build was aborted)
```

No `<!-- mixin:* -->` markers and no `<!-- scaffold:task-* -->` markers appear in any string passed to an adapter. This is guaranteed by the build pipeline's control flow: adapters are only invoked after injection succeeds for all prompts ([Architecture Section 4a](../architecture/system-architecture.md)).

### Marker Replacement Metadata

The `InjectionResult.replacedMarkers` list is available for adapter diagnostic output and for the build summary printed by the CLI Shell. Adapters are not required to consume this data — it is advisory metadata. The Claude Code adapter and Universal adapter do not use replacement metadata. The Codex adapter may use it for verbose build output.

### Adapter Input Shape

Platform adapters receive fully-injected content through the `AdapterStepInput` type (defined in [adapter-interface.md](adapter-interface.md) Section 3). The injection pipeline contributes two key fields to that type:

- `injectionResult.injectedContent` — the fully-injected prompt markdown string with all markers replaced
- `injectionResult.replacedMarkers` — metadata about which markers were replaced (advisory)

See [adapter-interface.md](adapter-interface.md) for the complete `AdapterStepInput` definition. The injection pipeline's `InjectionResult` is passed directly as the `injectionResult` field on `AdapterStepInput`.

### Tool-Name Mapping Runs After Injection

The Codex adapter's phrase-level tool-name mapping (loaded from `content/adapters/codex/tool-map.yml`) is applied to `content` **after** injection. The mapping transforms Claude Code-specific phrases (e.g., "Read tool", "AskUserQuestionTool") into Codex-appropriate equivalents. This is a single-pass string transformation applied by the adapter, not part of the injection pipeline. Task-tracking commands produced by verb replacement (e.g., `bd create`, `gh issue create`) are not affected by tool-name mapping — they are shell commands that work on any platform.

### Adapter Responsibilities

Adapters receive fully-resolved content and are responsible for **format transformation only** — they must not modify the semantic content of the prompt. Specifically:

- Adapters may add YAML frontmatter, section headers, or navigation aids.
- Adapters may remap tool-specific language via tool-map.yml (Codex adapter only).
- Adapters MUST NOT re-scan content for injection markers or perform any marker replacement.
- Adapters MUST NOT alter the task-tracking commands produced by verb replacement.
