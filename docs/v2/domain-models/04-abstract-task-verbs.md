# Domain Model: Abstract Task Verb System

**Domain ID**: 04
**Phase**: 1 — Deep Domain Modeling
**Depends on**: None — first-pass modeling (consumed by [12-mixin-injection.md](12-mixin-injection.md) during build)
**Last updated**: 2026-03-12
**Status**: draft

---

## Section 1: Domain Overview

The Abstract Task Verb System defines an HTML comment–based markup language embedded in base prompts that decouples prompt content from any specific task-tracking tool. Each verb (e.g., `<!-- scaffold:task-create "Title" priority=1 -->`) represents a task-tracking operation with tool-agnostic semantics. During `scaffold build`, the mixin injection system replaces each verb marker with the concrete command(s) for the selected task-tracking backend (Beads, GitHub Issues, or manual TODO.md). The output is a prompt where agents see only tool-specific instructions — the abstract markers never reach the execution environment.

**Role in the v2 architecture**: This domain defines the **vocabulary and argument grammar** that base prompt authors use when writing task-tracking instructions. The mixin injection system ([domain 12](12-mixin-injection.md)) performs the actual text replacement. Platform adapters ([domain 05](05-platform-adapters.md)) may further transform the concrete commands (e.g., tool-name mapping for Codex). Config validation ([domain 06](06-config-validation.md)) ensures the selected `task-tracking` mixin value is valid.

**Central design challenge**: Task-tracking tools have fundamentally different data models. Beads has structured priorities, dependency graphs, and atomic claim operations. GitHub Issues has labels, assignees, and cross-reference syntax. TODO.md has none of these natively. The abstract verb system must provide a useful common denominator without either (a) crippling the rich backends by restricting to the weakest, or (b) producing incoherent instructions for weaker backends where operations don't map cleanly.

---

## Section 2: Glossary

**abstract task verb** — An HTML comment marker in a base prompt that represents a task-tracking operation in a tool-agnostic way. Format: `<!-- scaffold:task-<verb> [args] -->`. Replaced at build time with concrete commands.

**verb** — The operation name within a task verb marker (e.g., `create`, `close`, `list`). Determines the semantic operation.

**verb marker** — The full HTML comment including the `scaffold:task-` prefix, verb, arguments, and closing `-->`. The atomic unit that gets replaced during mixin injection.

**concrete replacement** — The tool-specific text that replaces a verb marker after mixin injection. May be a shell command, prose instruction, or a combination.

**task-tracking mixin** — The mixin file selected for the `task-tracking` axis in `config.yml`. One of: `beads`, `github-issues`, or `none`. Contains the replacement templates for all verbs.

**verb argument** — A parameter within a verb marker. Arguments use a simple grammar: positional strings in quotes, named parameters as `key=value`.

**replacement template** — A string in the mixin file that maps a verb to its concrete replacement. May contain argument placeholders (`$TITLE`, `$ID`, `$PRIORITY`, etc.) that are interpolated from the verb marker's arguments.

**abstraction leak** — A case where the abstract verb doesn't cleanly map to a specific backend, producing semantically incorrect, incomplete, or awkward output.

**compound verb** — A single verb marker whose concrete replacement expands to multiple commands or multi-line instructions (e.g., `task-create` with the `none` mixin expands to multiple lines of TODO.md editing instructions).

**TODO.md** — The file-based task tracking format used by the `none` mixin. A structured markdown file with task entries, statuses, and lightweight dependency notation.

**verb vocabulary** — The complete set of recognized verb names. Any `<!-- scaffold:task-<name> -->` marker where `<name>` is not in the vocabulary is an error.

---

## Section 3: Entity Model

```typescript
/**
 * A single abstract task verb marker parsed from prompt content.
 * Produced by scanning prompt text for <!-- scaffold:task-* --> patterns.
 */
interface TaskVerbMarker {
  /**
   * The full original text of the HTML comment, including delimiters.
   * Used for replacement: the injection system does a literal string
   * replace of this value with the concrete replacement.
   * Example: '<!-- scaffold:task-create "Fix login bug" priority=1 -->'
   */
  rawText: string;

  /** The verb name (without the 'task-' prefix). e.g., 'create', 'close' */
  verb: VerbName;

  /**
   * Parsed arguments from the marker.
   * Positional args are stored under numeric keys ("0", "1", ...).
   * Named args are stored under their key name.
   */
  args: VerbArguments;

  /**
   * The zero-indexed character offset of this marker in the prompt content.
   * Used for error reporting and ordering.
   */
  offset: number;

  /** The line number (1-based) where this marker appears. For error reporting. */
  line: number;
}

/**
 * All recognized verb names.
 * The spec defines 8; analysis of v1 prompts reveals 5 additional
 * operations needed for full coverage.
 */
type VerbName =
  // --- Spec-defined (8) ---
  | 'create'     // Create a new task
  | 'list'       // List all tasks
  | 'ready'      // Show unblocked tasks ready for work
  | 'claim'      // Claim a task (assign to current agent)
  | 'close'      // Mark a task complete
  | 'dep-add'    // Add a dependency between tasks
  | 'show'       // Show details of a single task
  | 'sync'       // Force sync/persist task state
  // --- Additional verbs identified from v1 prompt analysis ---
  | 'dep-tree'   // Visualize dependency graph
  | 'dep-remove' // Remove a dependency between tasks
  | 'dep-cycles' // Check for circular dependencies
  | 'update'     // Update task fields (status, description)
  | 'create-and-claim'; // Atomic create + claim (common v1 pattern)

/**
 * Parsed arguments for a verb marker.
 * Combines positional and named arguments.
 */
interface VerbArguments {
  /** Positional arguments indexed from 0. Values are always strings. */
  positional: string[];

  /**
   * Named arguments as key-value pairs.
   * Values are always strings (parsing to number/boolean is the
   * replacement template's responsibility).
   */
  named: Record<string, string>;
}

/**
 * The argument schema for a specific verb.
 * Defines what arguments the verb accepts and their constraints.
 */
interface VerbArgumentSchema {
  /** The verb this schema applies to */
  verb: VerbName;

  /** Positional argument definitions, in order */
  positionalArgs: PositionalArgDef[];

  /** Named argument definitions */
  namedArgs: NamedArgDef[];
}

interface PositionalArgDef {
  /** Argument name (used in replacement templates as $NAME) */
  name: string;

  /** Whether this argument must be provided */
  required: boolean;

  /** Human-readable description for error messages */
  description: string;

  /** Default value if omitted. Null means no default (must be provided if required). */
  default: string | null;
}

interface NamedArgDef {
  /** Argument key (e.g., 'priority', 'status') */
  key: string;

  /** Whether this argument must be provided */
  required: boolean;

  /** Human-readable description */
  description: string;

  /** Default value if omitted */
  default: string | null;

  /** Valid values, if enumerable. Null means freeform. */
  validValues: string[] | null;
}

/**
 * A replacement template for one verb in one mixin.
 * Stored in the mixin file's verb replacement section.
 */
interface VerbReplacementTemplate {
  /** The verb this template handles */
  verb: VerbName;

  /**
   * The template string with placeholders.
   * Placeholders use $NAME syntax matching argument names.
   * Example: 'bd create "$TITLE" -p $PRIORITY'
   *
   * May be multi-line for complex replacements (e.g., TODO.md operations).
   * May be null if this verb is unsupported by the mixin — see
   * `unsupportedBehavior` for what happens.
   */
  template: string | null;

  /**
   * What to do when the verb is unsupported (template is null).
   * - 'omit': Remove the marker entirely, leaving no text
   * - 'comment': Replace with a prose comment explaining the limitation
   * - 'degrade': Replace with a degraded alternative
   */
  unsupportedBehavior?: 'omit' | 'comment' | 'degrade';

  /**
   * If unsupportedBehavior is 'comment' or 'degrade', the text to insert.
   */
  unsupportedText?: string;

  /**
   * Whether the replacement is a shell command (rendered in backtick code),
   * a prose instruction (rendered as plain text), or a code block.
   */
  format: 'inline-code' | 'prose' | 'code-block';
}

/**
 * Complete verb replacement registry for one task-tracking mixin.
 * Each mixin file declares replacements for all verbs.
 */
interface MixinVerbRegistry {
  /** The mixin name (e.g., 'beads', 'github-issues', 'none') */
  mixin: string;

  /** Map from verb name to its replacement template */
  templates: Record<VerbName, VerbReplacementTemplate>;
}

/**
 * The TODO.md file format used by the 'none' mixin.
 * Defines the structure that prose instructions reference.
 */
interface TodoMdFormat {
  /**
   * File path relative to project root.
   * Always 'TODO.md'.
   */
  path: 'TODO.md';

  /**
   * ID format: sequential integers prefixed with 'T-'.
   * Example: T-001, T-002, T-003.
   * Assigned manually by the agent, incrementing from the highest
   * existing ID in the file.
   */
  idFormat: 'T-NNN';

  /**
   * Priority representation: [P0], [P1], [P2], [P3] inline tags.
   */
  priorityFormat: '[PN]';

  /**
   * Status representation: checkbox state + inline tag.
   * - [ ] [open] — not started
   * - [ ] [in-progress] — claimed, work underway
   * - [x] [done] — completed
   * - [ ] [blocked] — blocked by dependency
   */
  statusFormat: 'checkbox + tag';

  /**
   * Dependency representation: 'blocked-by: T-NNN' on the line
   * following the task entry.
   */
  dependencyFormat: 'blocked-by: T-NNN';
}

/**
 * Validation result for a single verb marker.
 */
interface VerbValidationResult {
  /** The marker that was validated */
  marker: TaskVerbMarker;

  /** Whether validation passed */
  valid: boolean;

  /** Errors found (empty if valid) */
  errors: VerbValidationError[];

  /** Warnings (non-fatal) */
  warnings: VerbValidationWarning[];
}

interface VerbValidationError {
  code: string;
  message: string;
}

interface VerbValidationWarning {
  code: string;
  message: string;
}
```

**Entity relationships:**

```
TaskVerbMarker
  ├── has → VerbName (the operation)
  ├── has → VerbArguments (parsed params)
  └── validated against → VerbArgumentSchema

VerbArgumentSchema
  ├── defines → PositionalArgDef[] (ordered)
  └── defines → NamedArgDef[] (keyed)

MixinVerbRegistry
  ├── identified by → mixin name
  └── contains → VerbReplacementTemplate per VerbName

VerbReplacementTemplate
  ├── references → VerbName
  ├── contains → template string with $NAME placeholders
  └── defines → format (inline-code | prose | code-block)

TodoMdFormat
  └── defines → file structure referenced by 'none' mixin templates
```

---

## Section 4: State Transitions

N/A — The abstract task verb system is a stateless text transformation. Verb markers in prompt source are parsed and replaced during `scaffold build`. No persistent state, no lifecycle, no transitions. The markers exist only in the source prompt files and are consumed (replaced) during a single build pass.

---

## Section 5: Core Algorithms

### Algorithm 1: Verb Marker Parsing

Scans prompt content for all `<!-- scaffold:task-* -->` markers and parses them into structured `TaskVerbMarker` objects.

**Input**: `string` (raw prompt content)
**Output**: `TaskVerbMarker[]`

```
FUNCTION parseVerbMarkers(content: string): TaskVerbMarker[]

  // Regex pattern for scaffold task verb markers
  // Captures: full match, verb name, argument string
  PATTERN ← /<!--\s*scaffold:task-([a-z-]+)\s*(.*?)\s*-->/g

  markers ← []
  FOR EACH match IN PATTERN.matchAll(content)
    rawText ← match[0]
    verb ← match[1]
    argString ← match[2]
    offset ← match.index
    line ← countNewlinesBefore(content, offset) + 1

    args ← parseArguments(argString)

    markers.append({
      rawText,
      verb,
      args,
      offset,
      line
    })

  RETURN markers
```

**Complexity**: O(N) where N is the length of the prompt content. Single regex pass.

### Algorithm 2: Argument Parsing

Parses the argument string from within a verb marker into positional and named arguments.

**Input**: `string` (the argument portion of the marker)
**Output**: `VerbArguments`

```
FUNCTION parseArguments(argString: string): VerbArguments

  positional ← []
  named ← {}
  remaining ← argString.trim()

  WHILE remaining IS NOT empty
    // Skip whitespace
    remaining ← remaining.trimStart()

    IF remaining starts with '"'
      // Quoted positional argument
      // Find matching close quote (supports \" escaping)
      endQuote ← findUnescapedQuote(remaining, startFrom=1)
      IF endQuote == -1
        THROW VERB_UNCLOSED_QUOTE at current position
      value ← remaining[1..endQuote]  // Unescape \" → "
      positional.append(unescapeQuotes(value))
      remaining ← remaining[endQuote+1..]

    ELSE IF remaining matches /^([a-z][a-z0-9-]*)=(.+?)(\s|$)/
      // Named argument: key=value
      key ← match[1]
      valueStr ← match[2]
      // Value may be quoted or unquoted
      IF valueStr starts with '"'
        endQuote ← findUnescapedQuote(remaining, startFrom=keyLength+1+1)
        value ← unescape(remaining[keyLength+2..endQuote])
        remaining ← remaining[endQuote+1..]
      ELSE
        // Unquoted: read until next whitespace
        value ← valueStr
        remaining ← remaining[keyLength+1+valueStr.length..]
      named[key] ← value

    ELSE
      // Unquoted positional argument (single token, no spaces)
      token ← remaining.split(/\s/)[0]
      positional.append(token)
      remaining ← remaining[token.length..]

  RETURN { positional, named }
```

**Grammar (EBNF)**:

```ebnf
marker      = "<!--" ws "scaffold:task-" verb ws? args? ws? "-->"
verb        = ALPHA (ALPHA | "-")*
args        = arg (ws arg)*
arg         = quoted_arg | named_arg | bare_arg
quoted_arg  = '"' (CHAR - '"' | '\\"')* '"'
named_arg   = key "=" value
key         = ALPHA (ALPHA | DIGIT | "-")*
value       = quoted_arg | bare_value
bare_value  = (CHAR - WS)+
bare_arg    = (CHAR - WS - "=")+
ws          = (SPACE | TAB)+
```

**Edge cases**:
- Empty argument string: valid, produces `{ positional: [], named: {} }`
- Quotes containing spaces: correctly handled (e.g., `"Fix login bug"` → single positional arg)
- Named arg with quoted value: `priority="1"` → `named.priority = "1"`
- Escaped quotes in values: `"Title with \"quotes\""` → `Title with "quotes"`
- No newlines within markers: markers must be single-line (HTML comment convention)

**Complexity**: O(A) where A is the length of the argument string.

### Algorithm 3: Verb Replacement

Replaces all verb markers in prompt content with their concrete mixin-specific text.

**Input**: `string` (prompt content with markers), `MixinVerbRegistry` (selected mixin's templates)
**Output**: `string` (prompt content with concrete commands)

```
FUNCTION replaceVerbMarkers(
  content: string,
  registry: MixinVerbRegistry
): { result: string, errors: VerbError[], warnings: VerbWarning[] }

  markers ← parseVerbMarkers(content)
  errors ← []
  warnings ← []
  result ← content

  // Process markers in reverse offset order to preserve positions
  // during replacement (replacing from end to start doesn't shift
  // earlier offsets)
  markers.sortByOffsetDescending()

  FOR EACH marker IN markers
    // Step 1: Validate verb is in vocabulary
    IF marker.verb NOT IN VERB_VOCABULARY
      errors.append(VERB_UNKNOWN(marker))
      CONTINUE

    // Step 2: Look up replacement template
    template ← registry.templates[marker.verb]

    IF template IS null OR template.template IS null
      // Verb unsupported by this mixin
      SWITCH template.unsupportedBehavior
        CASE 'omit':
          replacement ← ""
        CASE 'comment':
          replacement ← template.unsupportedText
        CASE 'degrade':
          replacement ← template.unsupportedText
        DEFAULT:
          errors.append(VERB_UNSUPPORTED(marker, registry.mixin))
          CONTINUE
      warnings.append(VERB_DEGRADED(marker, registry.mixin))
    ELSE
      // Step 3: Validate arguments against schema
      schema ← VERB_SCHEMAS[marker.verb]
      validation ← validateArgs(marker.args, schema)
      IF validation HAS errors
        errors.appendAll(validation.errors)
        CONTINUE

      // Step 4: Interpolate template with arguments
      replacement ← interpolateTemplate(template.template, marker.args, schema)

      // Step 5: Apply format wrapping
      SWITCH template.format
        CASE 'inline-code':
          replacement ← "`" + replacement + "`"
        CASE 'code-block':
          replacement ← "```\n" + replacement + "\n```"
        CASE 'prose':
          // No wrapping — replacement is plain text
          replacement ← replacement

    // Step 6: Replace in content
    result ← result[0..marker.offset] + replacement + result[marker.offset + marker.rawText.length..]

  RETURN { result, errors, warnings }
```

**Complexity**: O(M × T) where M is the number of markers and T is the average template length. The reverse-order processing ensures O(M) replacements without recomputing offsets.

### Algorithm 4: Template Interpolation

Replaces `$NAME` placeholders in a template string with actual argument values.

**Input**: `string` (template), `VerbArguments`, `VerbArgumentSchema`
**Output**: `string`

```
FUNCTION interpolateTemplate(
  template: string,
  args: VerbArguments,
  schema: VerbArgumentSchema
): string

  result ← template

  // Replace positional argument placeholders
  FOR i, argDef IN schema.positionalArgs
    placeholder ← "$" + argDef.name.toUpperCase()
    value ← args.positional[i] OR argDef.default
    IF value IS null AND argDef.required
      // Should have been caught by validation, but defensive
      THROW VERB_MISSING_REQUIRED_ARG(argDef.name)
    IF value IS NOT null
      result ← result.replaceAll(placeholder, value)
    ELSE
      // Optional arg not provided, no default — remove placeholder
      result ← result.replaceAll(placeholder, "")

  // Replace named argument placeholders
  FOR argDef IN schema.namedArgs
    placeholder ← "$" + argDef.key.toUpperCase()
    value ← args.named[argDef.key] OR argDef.default
    IF value IS null AND argDef.required
      THROW VERB_MISSING_REQUIRED_ARG(argDef.key)
    IF value IS NOT null
      result ← result.replaceAll(placeholder, value)
    ELSE
      result ← result.replaceAll(placeholder, "")

  // Clean up any remaining whitespace artifacts from removed optionals
  result ← result.replaceAll(/\s{2,}/g, " ").trim()

  RETURN result
```

**Complexity**: O(P × R) where P is the number of placeholders and R is the result length.

---

## Section 6: Error Taxonomy

### Parse Errors

#### `VERB_UNKNOWN`
- **Severity**: Error
- **When**: A marker uses a verb name not in the vocabulary
- **Message**: `Unknown task verb "task-{verb}" at line {line}. Valid verbs: {list}`
- **JSON**:
  ```json
  {
    "code": "VERB_UNKNOWN",
    "verb": "task-archive",
    "line": 42,
    "file": "base/implementation-plan.md",
    "valid_verbs": ["create", "list", "ready", "claim", "close", ...]
  }
  ```
- **Recovery**: Fix the verb name in the prompt file. Check the verb vocabulary reference.

#### `VERB_UNCLOSED_QUOTE`
- **Severity**: Error
- **When**: A quoted argument in a marker has no closing quote
- **Message**: `Unclosed quote in task verb at line {line}: {rawText}`
- **JSON**:
  ```json
  {
    "code": "VERB_UNCLOSED_QUOTE",
    "line": 15,
    "file": "base/user-stories.md",
    "raw_text": "<!-- scaffold:task-create \"Fix login bug -->"
  }
  ```
- **Recovery**: Add the missing closing quote in the marker.

#### `VERB_MALFORMED_MARKER`
- **Severity**: Error
- **When**: A `<!-- scaffold:task-` prefix is found but the marker doesn't parse correctly
- **Message**: `Malformed task verb marker at line {line}: {rawText}`
- **JSON**:
  ```json
  {
    "code": "VERB_MALFORMED_MARKER",
    "line": 8,
    "file": "base/coding-standards.md",
    "raw_text": "<!-- scaffold:task- -->"
  }
  ```
- **Recovery**: Fix the marker syntax. A verb name is required after `task-`.

### Validation Errors

#### `VERB_MISSING_REQUIRED_ARG`
- **Severity**: Error
- **When**: A verb marker is missing a required argument
- **Message**: `Task verb "task-{verb}" at line {line} is missing required argument "{argName}"`
- **JSON**:
  ```json
  {
    "code": "VERB_MISSING_REQUIRED_ARG",
    "verb": "create",
    "line": 30,
    "file": "base/coding-standards.md",
    "missing_arg": "TITLE",
    "usage": "<!-- scaffold:task-create \"Title\" priority=N -->"
  }
  ```
- **Recovery**: Add the missing argument to the marker.

#### `VERB_INVALID_ARG_VALUE`
- **Severity**: Error
- **When**: A named argument has a value outside its valid set
- **Message**: `Task verb "task-{verb}" at line {line}: "{key}={value}" is invalid. Valid values: {validValues}`
- **JSON**:
  ```json
  {
    "code": "VERB_INVALID_ARG_VALUE",
    "verb": "update",
    "line": 55,
    "key": "status",
    "value": "archived",
    "valid_values": ["in_progress", "blocked", "ready"]
  }
  ```
- **Recovery**: Use one of the valid values listed in the error.

### Replacement Errors

#### `VERB_UNSUPPORTED`
- **Severity**: Error (or warning if degradation is defined)
- **When**: A verb has no replacement template and no degradation strategy in the selected mixin
- **Message**: `Task verb "task-{verb}" is not supported by the "{mixin}" mixin and has no fallback`
- **JSON**:
  ```json
  {
    "code": "VERB_UNSUPPORTED",
    "verb": "dep-cycles",
    "mixin": "none",
    "file": "base/implementation-plan.md",
    "line": 120
  }
  ```
- **Recovery**: Either remove the verb from the base prompt (move it to a methodology extension), or add a degradation entry to the mixin.

#### `VERB_TEMPLATE_INTERPOLATION_FAILED`
- **Severity**: Error
- **When**: A replacement template contains a `$PLACEHOLDER` that doesn't match any argument
- **Message**: `Template for "task-{verb}" in mixin "{mixin}" contains unresolved placeholder "${name}"`
- **JSON**:
  ```json
  {
    "code": "VERB_TEMPLATE_INTERPOLATION_FAILED",
    "verb": "create",
    "mixin": "beads",
    "unresolved_placeholder": "$LABEL",
    "template": "bd create \"$TITLE\" -p $PRIORITY --label $LABEL"
  }
  ```
- **Recovery**: Fix the template in the mixin file to match the verb's argument schema, or add the missing argument to the verb schema.

### Warnings

#### `VERB_DEGRADED`
- **Severity**: Warning
- **When**: A verb was replaced with a degraded alternative rather than a direct equivalent
- **Message**: `Task verb "task-{verb}" degraded for mixin "{mixin}": {explanation}`
- **JSON**:
  ```json
  {
    "code": "VERB_DEGRADED",
    "verb": "dep-add",
    "mixin": "none",
    "explanation": "TODO.md dependency notation is informational only — no automated enforcement"
  }
  ```
- **Recovery**: Informational. Consider whether the degraded behavior is acceptable for your project.

#### `VERB_EXTRA_ARGS_IGNORED`
- **Severity**: Warning
- **When**: A verb marker provides more arguments than the schema defines
- **Message**: `Task verb "task-{verb}" at line {line}: extra arguments ignored: {args}`
- **JSON**:
  ```json
  {
    "code": "VERB_EXTRA_ARGS_IGNORED",
    "verb": "list",
    "line": 12,
    "extra_args": ["--filter", "open"]
  }
  ```
- **Recovery**: Remove the extra arguments, or file an issue to extend the verb's argument schema.

---

## Section 7: Integration Points

### Abstract Task Verbs → Mixin Injection (Domain 12)

- **Direction**: This domain defines the vocabulary and semantics; domain 12 performs the replacement
- **Data flow**: Domain 12 calls the parsing and replacement algorithms defined here. The `MixinVerbRegistry` is loaded from the selected `task-tracking` mixin file, and the replacement engine processes each resolved prompt's content.
- **Contract**: Domain 12 invokes `parseVerbMarkers()` to find markers and `replaceVerbMarkers()` to perform substitution. This domain guarantees that replacement is a pure string transformation — no file I/O, no side effects.
- **Lifecycle stage**: Build time (`scaffold build`), during the mixin injection phase, after prompt resolution ([domain 01](01-prompt-resolution.md)) but before platform adaptation ([domain 05](05-platform-adapters.md)).
- **Assumption**: Domain 12 processes `<!-- scaffold:task-* -->` markers as a special case of its general `<!-- mixin:* -->` marker processing. Task verb markers are a subset of the mixin marker system but with their own parsing grammar and replacement logic.

### Abstract Task Verbs → Platform Adapters (Domain 05)

- **Direction**: This domain's output (concrete commands) may be further transformed by adapters
- **Data flow**: After verb replacement, the prompt contains concrete tool commands (e.g., `bd create "Title" -p 1`). The Codex adapter's tool-name mapping may further transform these if they contain platform-specific references.
- **Contract**: This domain produces concrete commands in plain text. Platform adapters treat the output as opaque text and apply their own phrase-level pattern matching. There is no structured interface between them — it's text-in, text-out.
- **Assumption**: The Codex adapter's tool-map patterns do NOT need to map task-tracking commands (e.g., `bd create` → `bd create`). Task-tracking commands are tool-agnostic at the semantic level — `bd` and `gh issue` are both CLI tools that any platform can invoke. The tool-name mapping targets AI-agent-specific tool references (`Read tool`, `AskUserQuestionTool`), not shell commands.

### Config Validation (Domain 06) → Abstract Task Verbs

- **Direction**: Domain 06 validates that the selected `task-tracking` mixin exists before this domain runs
- **Data flow**: Domain 06 ensures `config.mixins.task-tracking` matches an installed mixin file. This domain assumes the mixin file is valid and loadable.
- **Contract**: If domain 06 passes, the `MixinVerbRegistry` can be loaded from `mixins/task-tracking/<value>.md` without errors.

### Prompt Frontmatter (Domain 08) → Abstract Task Verbs

- **Direction**: No direct integration. Frontmatter does not reference task verbs.
- **Note**: The verb system operates on prompt *body* content, not frontmatter. Frontmatter fields like `produces` and `depends-on` are separate from task verb markers.

---

## Section 8: Edge Cases & Failure Modes

### Mandatory Question 1: Complete Verb Vocabulary

The spec defines 8 verbs. Analysis of 182+ `bd` command occurrences across v1 prompts reveals 5 additional operations that real prompts use frequently. The complete vocabulary:

| Verb | Positional Args | Named Args | Semantics |
|------|----------------|------------|-----------|
| `create` | `TITLE` (required) | `priority` (required, 0–3) | Create a new task with title and priority. Returns a task ID. |
| `list` | *(none)* | `status` (optional), `actor` (optional) | List tasks, optionally filtered. Returns a table/list. |
| `ready` | *(none)* | *(none)* | Show unblocked tasks ready for work. Returns filtered list. |
| `claim` | `ID` (required) | *(none)* | Claim/assign a task to the current agent. Side effect: marks as in-progress. |
| `close` | `ID` (required) | *(none)* | Mark a task as complete. |
| `dep-add` | `CHILD` (required), `PARENT` (required) | *(none)* | Declare that CHILD is blocked by PARENT. |
| `show` | `ID` (required) | *(none)* | Display full details of a single task. |
| `sync` | *(none)* | *(none)* | Force-persist task state to durable storage. |
| `dep-tree` | `ID` (optional) | *(none)* | Visualize dependency graph. If ID given, show subtree from that root. |
| `dep-remove` | `CHILD` (required), `PARENT` (required) | *(none)* | Remove a dependency between tasks. |
| `dep-cycles` | *(none)* | *(none)* | Check for circular dependencies. Returns list or "none found." |
| `update` | `ID` (required) | `status` (optional), `description` (optional) | Update task metadata. |
| `create-and-claim` | `TITLE` (required) | `priority` (required, 0–3) | Atomic create + claim in one marker. Replaces the extremely common v1 pattern of `bd create ... && bd update <id> --claim`. |

**Rationale for additions:**
- `dep-tree`: Used 11 times in v1 prompts. Critical for implementation plan review.
- `dep-remove`: Used 5 times. Required for dependency graph corrections.
- `dep-cycles`: Used 2 times. Used for debugging dependency issues.
- `update`: Used 20+ times with various flags (`--status`, `--description`, `--claim`). The `claim` case is covered by the dedicated `claim` verb, but `--status` and `--description` updates need their own verb.
- `create-and-claim`: The pattern `bd create "..." -p N` immediately followed by `bd update <id> --claim` appears 12+ times. A compound verb eliminates the awkward two-step pattern that requires the agent to capture an intermediate ID.

**Category**: (a) Handled by design.

### Mandatory Question 2: Concrete Replacements for All Verbs × All Mixins

#### Beads mixin (`task-tracking: beads`)

| Verb | Replacement | Format |
|------|-------------|--------|
| `create` | `bd create "$TITLE" -p $PRIORITY` | inline-code |
| `list` | `bd list` (+ `--status $STATUS` if status arg, `--actor $ACTOR` if actor arg) | inline-code |
| `ready` | `bd ready` | inline-code |
| `claim` | `bd update $ID --claim` | inline-code |
| `close` | `bd close $ID` | inline-code |
| `dep-add` | `bd dep add $CHILD $PARENT` | inline-code |
| `show` | `bd show $ID` | inline-code |
| `sync` | `bd sync` | inline-code |
| `dep-tree` | `bd dep tree` (+ `$ID` if ID arg) | inline-code |
| `dep-remove` | `bd dep remove $CHILD $PARENT` | inline-code |
| `dep-cycles` | `bd dep cycles` | inline-code |
| `update` | `bd update $ID` (+ `--status $STATUS` if status, `--description "$DESCRIPTION"` if description) | inline-code |
| `create-and-claim` | `bd create "$TITLE" -p $PRIORITY` then `bd update <id> --claim` | code-block |

#### GitHub Issues mixin (`task-tracking: github-issues`)

| Verb | Replacement | Format |
|------|-------------|--------|
| `create` | `gh issue create --title "$TITLE" --label "priority:$PRIORITY"` | inline-code |
| `list` | `gh issue list` (+ `--label "$STATUS"` if status, `--assignee $ACTOR` if actor) | inline-code |
| `ready` | `gh issue list --label "ready"` | inline-code |
| `claim` | `gh issue edit $ID --add-assignee @me` | inline-code |
| `close` | `gh issue close $ID` | inline-code |
| `dep-add` | `gh issue comment $CHILD --body "blocked by #$PARENT"` | inline-code |
| `show` | `gh issue view $ID` | inline-code |
| `sync` | *(no-op — GitHub is remote)* | **omit** |
| `dep-tree` | *Degraded: "Review issue cross-references to trace dependency chains"* | **prose (degraded)** |
| `dep-remove` | `gh issue comment $CHILD --body "no longer blocked by #$PARENT"` | inline-code |
| `dep-cycles` | *Degraded: "Review open issues for circular 'blocked by' references"* | **prose (degraded)** |
| `update` | `gh issue edit $ID` (+ `--add-label "$STATUS"` / `--body "$DESCRIPTION"`) | inline-code |
| `create-and-claim` | `gh issue create --title "$TITLE" --label "priority:$PRIORITY" --assignee @me` | inline-code |

**Abstraction imperfections (GitHub Issues)**:
1. **Dependencies are advisory**: `gh issue comment` with "blocked by" is a convention, not enforced. No automated blocking.
2. **`dep-tree` and `dep-cycles`**: GitHub has no native dependency graph. These are degraded to prose guidance.
3. **Priority as labels**: Priorities become labels (`priority:0`, `priority:1`), which don't sort or filter like Beads' numeric priorities.
4. **`sync` is meaningless**: GitHub is always remote. The marker is omitted entirely.

#### None mixin (`task-tracking: none`)

| Verb | Replacement | Format |
|------|-------------|--------|
| `create` | Add a new entry to `TODO.md`: `- [ ] [open] [P$PRIORITY] T-NNN: $TITLE` | prose |
| `list` | Review `TODO.md` for all task entries | prose |
| `ready` | Check `TODO.md` for tasks marked `[open]` that have no `blocked-by:` lines with unfinished blockers | prose |
| `claim` | Change `$ID`'s status tag from `[open]` to `[in-progress]` in `TODO.md` | prose |
| `close` | Change `$ID`'s checkbox to `[x]` and status to `[done]` in `TODO.md` | prose |
| `dep-add` | Add `  blocked-by: $PARENT` on the line after `$CHILD` in `TODO.md` | prose |
| `show` | Read the `$ID` entry and any indented sub-lines in `TODO.md` | prose |
| `sync` | `git add TODO.md && git commit -m "chore: update task tracking"` | inline-code |
| `dep-tree` | *Degraded: "Review `blocked-by:` annotations in `TODO.md` to trace the dependency chain"* | **prose (degraded)** |
| `dep-remove` | Remove the `blocked-by: $PARENT` line under `$CHILD` in `TODO.md` | prose |
| `dep-cycles` | *Degraded: "Manually review `blocked-by:` chains in `TODO.md` for circular references"* | **prose (degraded)** |
| `update` | Update `$ID`'s status tag to `[$STATUS]` or edit its description text in `TODO.md` | prose |
| `create-and-claim` | Add `- [ ] [in-progress] [P$PRIORITY] T-NNN: $TITLE` to `TODO.md` (created with in-progress status) | prose |

**Category**: (a) Handled by design for clean mappings; (c) accepted limitation for degraded verbs.

### Mandatory Question 3: TODO.md Format Specification

The `none` mixin uses a structured markdown file at `TODO.md` in the project root.

**File format**:

```markdown
# Tasks

## Open

- [ ] [open] [P1] T-001: Create product requirements document
- [ ] [open] [P0] T-002: Set up development environment
  blocked-by: T-001
- [ ] [blocked] [P2] T-003: Write user stories
  blocked-by: T-001

## In Progress

- [ ] [in-progress] [P1] T-004: Research tech stack options

## Done

- [x] [done] [P0] T-000: Initialize project repository
```

**ID scheme**: `T-NNN` where NNN is a zero-padded three-digit sequential integer. The agent determines the next ID by finding the highest existing ID in the file and incrementing. If the file is empty or doesn't exist, start at `T-001`.

**Priority representation**: `[P0]`, `[P1]`, `[P2]`, `[P3]` inline in the task line. Maps to:
- `[P0]` = blocking release
- `[P1]` = must-have
- `[P2]` = should-have
- `[P3]` = nice-to-have

**Status lifecycle**:
- `[open]` — Created, not yet started
- `[in-progress]` — Claimed by an agent
- `[blocked]` — Has unresolved `blocked-by:` dependency
- `[done]` — Completed (checkbox also checked: `[x]`)

**Dependency representation**: Indented `blocked-by: T-NNN` lines below the task entry. Multiple dependencies use multiple lines:
```markdown
- [ ] [blocked] [P1] T-005: Implement authentication
  blocked-by: T-002
  blocked-by: T-003
```

**"Ready" computation**: A task is "ready" when:
1. Status is `[open]` (not `[in-progress]`, `[blocked]`, or `[done]`)
2. All `blocked-by:` targets have status `[done]`
3. If no `blocked-by:` lines, the task is ready by default

This computation must be done by the agent reading TODO.md — there is no CLI to automate it. The `ready` verb's replacement is prose that instructs the agent to perform this check manually.

**Section organization**: Tasks are organized into sections (`## Open`, `## In Progress`, `## Done`). When a task changes status, the agent moves it to the appropriate section. This is a convention for human readability — the status tag is the source of truth, not the section.

**Category**: (a) Handled by design — fully specified format.

### Mandatory Question 4: Argument Syntax Grammar

The formal grammar is defined in Algorithm 2 (Section 5). Key rules:

1. **Positional arguments** can be quoted (`"Fix login bug"`) or bare tokens (`BD-123`). Quoted arguments may contain spaces, escaped quotes (`\"`), and any character except unescaped `"`. Bare tokens end at whitespace.

2. **Named arguments** use `key=value` syntax. Keys are lowercase alphanumeric with hyphens. Values follow the same rules as positional arguments (quoted or bare).

3. **No newlines** within markers. HTML comments are single-line in this system. A marker that spans multiple lines is a parse error.

4. **Whitespace** between arguments is one or more spaces/tabs. Leading/trailing whitespace inside the comment delimiters is ignored.

5. **Argument ordering**: Positional arguments come first, named arguments after. Mixing is allowed but discouraged — the parser processes left-to-right and assigns to positional slots until it encounters a `key=` pattern.

**Examples of valid markers**:
```html
<!-- scaffold:task-create "Fix login bug" priority=1 -->
<!-- scaffold:task-close BD-42 -->
<!-- scaffold:task-dep-add BD-10 BD-5 -->
<!-- scaffold:task-list status=open -->
<!-- scaffold:task-ready -->
<!-- scaffold:task-create "Title with \"quotes\"" priority=0 -->
<!-- scaffold:task-update BD-15 status=in_progress -->
```

**Examples of invalid markers**:
```html
<!-- scaffold:task-create Fix login bug priority=1 -->
                         ^^^ "Fix" and "login" and "bug" are 3 separate positional args
<!-- scaffold:task-create "Unclosed quote priority=1 -->
                         ^^^ unclosed quote → VERB_UNCLOSED_QUOTE
<!-- scaffold:task- -->
               ^^^ empty verb → VERB_MALFORMED_MARKER
```

**Category**: (a) Handled by design.

### Mandatory Question 5: Unsupported Verb Policy

When a base prompt uses a verb that a mixin doesn't cleanly support, the policy is **degradation with warnings, not errors**:

1. **Each mixin must declare a replacement for every verb in the vocabulary.** The replacement may be a concrete command, a prose instruction, or a degradation entry.

2. **Degradation entries** use `unsupportedBehavior: 'degrade'` or `unsupportedBehavior: 'comment'` with explanatory text. The build succeeds with a warning.

3. **`unsupportedBehavior: 'omit'`** removes the marker entirely. Used only for genuinely no-op operations (e.g., `sync` with GitHub Issues).

4. **The only case that is an error** is if a mixin has no entry at all for a verb — this means the mixin author forgot to handle it. The build fails with `VERB_UNSUPPORTED`.

**Rationale**: Erroring on unsupported verbs would force prompt authors to avoid any verb that the weakest backend doesn't support, collapsing the system to the lowest common denominator. Degradation lets prompts use the full vocabulary while clearly communicating limitations.

**Example**: `dep-tree` with the `none` mixin degrades to: *"Review `blocked-by:` annotations in `TODO.md` to trace the dependency chain."* The agent gets useful guidance even though there's no CLI command to run.

**Category**: (a) Handled by design.

### Mandatory Question 6: Build-Time vs. Execution-Time Replacement

Verb markers are replaced at **build time** (`scaffold build`). The agent never sees `<!-- scaffold:task-create -->` — it sees `bd create "Title" -p 1` or `Add a new entry to TODO.md: ...`.

**Implications**:

1. **Agents see concrete commands, not abstractions.** This is by design — agents should execute concrete instructions, not interpret an abstraction layer. The build system is the abstraction boundary.

2. **Agents cannot distinguish task operations from arbitrary shell commands.** A `bd create` in the prompt looks the same as any other command the prompt asks the agent to run. This is acceptable because agents don't need to distinguish — they just execute instructions.

3. **The prompt text is specific to the selected mixin.** If the user switches from `beads` to `github-issues`, they must re-run `scaffold build` to get updated prompts. Old prompt outputs with `bd` commands remain until rebuilt.

4. **No runtime flexibility.** An agent cannot choose a different task backend mid-prompt. The choice is locked at build time. This is a deliberate simplification — runtime polymorphism would add complexity for minimal benefit.

5. **Debugging is straightforward.** If an agent gets a broken command, the developer can inspect the built prompt and trace it back to the mixin template. The chain is: abstract marker → mixin template → built output.

**Category**: (a) Handled by design.

### Mandatory Question 7: Complex Prompt Paragraph — Before and After

**Source base prompt paragraph** (using 4 task verbs):

```markdown
## Process

1. Read `docs/user-stories.md` and <!-- scaffold:task-list --> output.
   For every acceptance criterion, identify which task(s) cover it.

2. For each gap found, create a task:
   <!-- scaffold:task-create-and-claim "Cover gap: acceptance criterion AC-NNN" priority=1 -->

3. Add dependencies between new and existing tasks:
   <!-- scaffold:task-dep-add NEW_TASK_ID PARENT_TASK_ID -->

4. After creating all tasks, review the dependency graph:
   <!-- scaffold:task-dep-tree -->
   Verify no two tasks in the first wave modify the same file.
```

**After replacement — Beads mixin**:

```markdown
## Process

1. Read `docs/user-stories.md` and `bd list` output.
   For every acceptance criterion, identify which task(s) cover it.

2. For each gap found, create a task:
   `bd create "Cover gap: acceptance criterion AC-NNN" -p 1` then `bd update <id> --claim`

3. Add dependencies between new and existing tasks:
   `bd dep add NEW_TASK_ID PARENT_TASK_ID`

4. After creating all tasks, review the dependency graph:
   `bd dep tree`
   Verify no two tasks in the first wave modify the same file.
```

**After replacement — GitHub Issues mixin**:

```markdown
## Process

1. Read `docs/user-stories.md` and `gh issue list` output.
   For every acceptance criterion, identify which task(s) cover it.

2. For each gap found, create a task:
   `gh issue create --title "Cover gap: acceptance criterion AC-NNN" --label "priority:1" --assignee @me`

3. Add dependencies between new and existing tasks:
   `gh issue comment NEW_TASK_ID --body "blocked by #PARENT_TASK_ID"`

4. After creating all tasks, review the dependency graph:
   Review issue cross-references to trace dependency chains
   Verify no two tasks in the first wave modify the same file.
```

**After replacement — None mixin**:

```markdown
## Process

1. Read `docs/user-stories.md` and review `TODO.md` for all task entries.
   For every acceptance criterion, identify which task(s) cover it.

2. For each gap found, create a task:
   Add `- [ ] [in-progress] [P1] T-NNN: Cover gap: acceptance criterion AC-NNN` to `TODO.md`

3. Add dependencies between new and existing tasks:
   Add `  blocked-by: PARENT_TASK_ID` on the line after `NEW_TASK_ID` in `TODO.md`

4. After creating all tasks, review the dependency graph:
   Review `blocked-by:` annotations in `TODO.md` to trace the dependency chain
   Verify no two tasks in the first wave modify the same file.
```

**Observations**: All three versions read naturally. The GitHub Issues version for `dep-tree` shifts from a command to prose, which creates a subtle tone inconsistency but is functionally correct. The None mixin version is entirely prose-based, which reads coherently.

**Category**: (a) Handled by design.

### Mandatory Question 8: Task Verbs vs. Platform Adapter Tool-Name Mapping

These are **separate systems operating at different stages**:

| Aspect | Abstract Task Verbs | Platform Adapter Tool Mapping |
|--------|--------------------|-----------------------------|
| **What it replaces** | `<!-- scaffold:task-* -->` markers | Prose phrases like "Use the Read tool" |
| **When** | Build time, during mixin injection | Build time, during adapter output generation (after mixin injection) |
| **Scope** | Task-tracking operations only | AI tool references in prose |
| **Mechanism** | Structured parsing + template interpolation | Phrase-level regex pattern matching |
| **Granularity** | Exact marker → template | Longest-match phrase replacement |
| **Target** | All prompts (via task-tracking mixin) | Codex adapter output only |

**The boundary**: Task verb replacement happens first (mixin injection phase). The output contains concrete CLI commands (`bd create`, `gh issue list`). Platform adapter tool mapping happens second and does NOT transform task-tracking CLI commands — it only transforms AI-agent-specific tool references.

**Why they don't conflict**: `bd create "Title" -p 1` is a shell command that works on any platform. It doesn't need tool mapping. Tool mapping targets agent-specific APIs like `AskUserQuestionTool`, `Read tool`, `Agent tool` — things that are Claude Code concepts, not CLI commands.

**Edge case**: If a prompt's prose mentions "use Beads to track tasks" (not a verb marker, just prose), the tool mapping would leave it alone — Beads is not a Claude Code tool. This is correct behavior.

**Category**: (a) Handled by design.

### Mandatory Question 9: Testing Strategy for Verb × Mixin Combinations

**See Section 9 for the full testing plan.** Summary:

The testing strategy is a **combinatorial verification matrix**:
- 13 verbs × 3 mixins = 39 combinations
- Each combination is tested for: (a) correct replacement text, (b) valid executable output, (c) natural prose readability

This is implemented as a parametrized test suite where each test case specifies: verb name, argument values, mixin name, expected output. The test doubles are minimal — the replacement engine is a pure string function.

For integration testing, 3 representative base prompts are built with each mixin and the outputs are compared against golden files.

**Category**: (a) Handled by design.

### Mandatory Question 10: Top 3 Abstraction Leaks and Mitigations

#### Leak 1: Dependency graphs don't exist in GitHub Issues or TODO.md

**Symptom**: `dep-tree` and `dep-cycles` have no equivalent in `github-issues` or `none` mixins. The replacement is prose guidance ("review cross-references"), which gives the agent no actionable command.

**Impact**: High. Implementation plan prompts heavily rely on dependency graph visualization to verify task ordering.

**Mitigation**: Accept degradation for `none`. For `github-issues`, add a recommended GitHub Action or script that parses "blocked by #N" comments and renders a dependency graph. This could be a companion tool shipped with scaffold: `scaffold deps --github` that scrapes issue cross-references. Flagged as future enhancement.

#### Leak 2: Task ID format varies across backends

**Symptom**: Beads uses `BD-xxx` IDs, GitHub Issues uses `#NNN` numeric IDs, TODO.md uses `T-NNN` IDs. When a prompt says "run <!-- scaffold:task-dep-add CHILD PARENT -->", the CHILD and PARENT arguments are opaque strings — but the agent needs to know the ID format to substitute real values.

**Impact**: Medium. Agents learning the prompt for the first time won't know that `CHILD` should be `BD-42` vs. `#42` vs. `T-042`.

**Mitigation**: Each mixin's replacement templates for verbs that take ID arguments should include a brief format hint the first time an ID is referenced in the prompt. The `task-tracking` mixin content (injected at `<!-- mixin:task-tracking -->` points) includes ID format documentation that appears before any verb markers. This front-loads the format knowledge. Additionally, the `create` and `create-and-claim` verb replacements should mention the returned ID format.

#### Leak 3: Compound operations have variable atomicity

**Symptom**: `create-and-claim` is atomic for GitHub Issues (single `gh issue create --assignee @me` command) but is two sequential commands for Beads (`bd create` then `bd update --claim`). The None mixin achieves atomicity by setting `[in-progress]` at creation time. An agent seeing the Beads two-step version might not realize the claim must immediately follow the create.

**Impact**: Low-medium. Race condition in multi-agent scenarios if another agent claims the task between create and claim. In practice, Beads IDs are unique and the time window is milliseconds.

**Mitigation**: The Beads mixin's `create-and-claim` template should use a code block that makes the two-step nature explicit with a comment: `# Create and immediately claim — do not run other commands between these two`. Long-term, propose a `bd create --claim` flag to Beads upstream.

**Category**: (c) Accepted limitations with documented workarounds.

### Additional Edge Cases

#### Edge Case 11: Verb marker inside a code block in the source prompt

If a prompt author accidentally places a verb marker inside a markdown code fence:

````markdown
```bash
<!-- scaffold:task-create "Example task" priority=1 -->
```
````

The parser would still find and replace it, breaking the code block's intent.

**Behavior**: The parser does NOT distinguish between markers in prose and markers in code blocks. Markers are always replaced.

**Mitigation**: Prompt authoring guidelines should state: "Never place verb markers inside code blocks. Use actual concrete examples (e.g., `bd create "Example" -p 1`) in code blocks that demonstrate commands. Verb markers belong in prose or instruction text."

**Category**: (c) Accepted limitation — documented in prompt authoring guidelines.

#### Edge Case 12: Verb marker with argument values containing `-->`

If a title contains `-->`: `<!-- scaffold:task-create "Fix --> arrow bug" priority=1 -->`

The HTML comment parser would prematurely close at the first `-->` inside the title.

**Behavior**: Malformed parse. The title would be `Fix ` and the rest would be unparsed junk.

**Mitigation**: Document that argument values must not contain `-->`. The grammar escaping only handles `\"` for quotes, not HTML comment delimiters. If this becomes a real problem, add an entity encoding: `--&gt;` → `-->` during interpolation. For now, treat as an authoring error.

**Category**: (c) Accepted limitation — documented.

#### Edge Case 13: Multiple verb markers on the same line

```markdown
Run <!-- scaffold:task-create "Task A" priority=1 --> and <!-- scaffold:task-claim $ID -->
```

**Behavior**: Both markers are parsed and replaced independently. The line becomes:
```markdown
Run `bd create "Task A" -p 1` and `bd update $ID --claim`
```

This works correctly. The parser finds all markers regardless of their position on a line.

**Category**: (a) Handled by design.

#### Edge Case 14: Verb marker that looks like a mixin marker

The `<!-- scaffold:task-* -->` namespace is disjoint from `<!-- mixin:* -->`. There is no ambiguity because task verbs use `scaffold:task-` and general mixins use `mixin:`. If someone writes `<!-- mixin:task-create -->`, it would be treated as a mixin insertion point for an axis called `task-create`, not as a task verb.

**Category**: (a) Handled by design.

---

## Section 9: Testing Considerations

### Properties to Verify

1. **Completeness**: Every verb in the vocabulary has a replacement template in every mixin.
2. **Parsability**: Every valid marker syntax is correctly parsed into `TaskVerbMarker`.
3. **Round-trip integrity**: Parsing a marker and interpolating its template produces the expected concrete output.
4. **Idempotency**: Running replacement twice on already-replaced content produces no changes (markers are consumed on first pass).
5. **No partial replacement**: A malformed marker is either fully replaced or triggers an error — never partially transformed.
6. **Output readability**: After replacement, the prompt reads as natural English prose with embedded commands.

### High-Priority Test Cases (by risk)

1. **Verb × mixin matrix (39 cases)**: Every verb with every mixin produces the expected output. This is the core correctness test.
2. **Missing required argument**: `<!-- scaffold:task-create priority=1 -->` (no title) → `VERB_MISSING_REQUIRED_ARG`.
3. **Unknown verb**: `<!-- scaffold:task-archive BD-42 -->` → `VERB_UNKNOWN`.
4. **Quoted title with spaces**: `<!-- scaffold:task-create "Fix the login flow" priority=0 -->` → title is `Fix the login flow`, not three separate tokens.
5. **Escaped quotes in title**: `<!-- scaffold:task-create "Fix the \"login\" flow" priority=0 -->` → title is `Fix the "login" flow`.
6. **Empty arguments**: `<!-- scaffold:task-ready -->` and `<!-- scaffold:task-list -->` with no args → valid, no errors.
7. **Optional arguments omitted**: `<!-- scaffold:task-list -->` without status/actor → default list command.
8. **Optional arguments provided**: `<!-- scaffold:task-list status=open -->` → filtered list command.
9. **dep-add with two positional args**: `<!-- scaffold:task-dep-add BD-10 BD-5 -->` → correct child/parent mapping.
10. **create-and-claim compound**: Beads → two commands; GitHub Issues → single command with `--assignee`; None → single entry with `[in-progress]`.
11. **None mixin prose output**: Verify all none-mixin replacements are coherent prose instructions, not garbled templates.
12. **Multiple markers in one prompt**: A prompt with 10+ markers across different verbs processes them all correctly.
13. **Marker inside code block**: Verify it's still replaced (per documented behavior).
14. **Adjacent markers**: Two markers with no text between them both replace correctly.

### Test Doubles / Mocks

- **Minimal mocks needed**: The verb replacement system is a pure function (string → string). The primary test strategy is direct invocation with concrete inputs and assertion on outputs.
- **MixinVerbRegistry mock**: A synthetic registry for testing edge cases (e.g., a registry with `unsupportedBehavior: 'omit'` for all verbs to test the omission path).
- **No file system mocks**: The replacement engine operates on in-memory strings. File loading is domain 12's responsibility.

### Property-Based Testing Opportunities

1. **Parse-then-interpolate preserves argument values**: For any valid argument string, parsing it and then interpolating a template that echoes all arguments produces the original values.
2. **Replacement count equals marker count**: The number of replacements performed equals the number of markers found by parsing.
3. **No `<!-- scaffold:task-` in output**: After replacement, no task verb markers remain in the output string (assuming all verbs are in the vocabulary and the mixin handles them).
4. **Replacement is monotonically shorter or equal**: For `omit` behavior, the output is strictly shorter. For `prose`/`inline-code`, the output length varies but the marker itself is gone.

### Integration Test Scenarios

1. **Full build with beads mixin**: Run `scaffold build` with `task-tracking: beads` and verify all output prompts contain `bd` commands, no `<!-- scaffold:task-*` markers remain.
2. **Full build with none mixin**: Same, verify all outputs contain TODO.md prose, no markers remain.
3. **Build after mixin switch**: Switch from `beads` to `github-issues`, rebuild, verify all `bd` references are replaced with `gh issue` references.
4. **Verb replacement + platform adapter**: Build with `beads` mixin for Codex adapter, verify that `bd create` commands survive tool-name mapping (they should — `bd` is not an AI tool).

---

## Section 10: Open Questions & Recommendations

### Open Questions

1. **Should verb replacements be defined in YAML within the mixin file, or as a separate registry?**
   The current design embeds replacement templates in the mixin `.md` file content. An alternative is a companion `verbs.yml` file per mixin that structurally defines the mappings, making them parseable without scraping markdown. The `.md` content would contain the prose sections injected at `<!-- mixin:task-tracking -->` points, while `verbs.yml` handles the `<!-- scaffold:task-* -->` replacements.
   **Recommendation**: Use a separate `verbs.yml` per mixin. This cleanly separates the two mixin roles: (a) prose content injected at mixin markers, and (b) verb replacement templates applied globally to the prompt. Mixing both into one `.md` file conflates two different mechanisms.

2. **Should the `create` verb return an ID placeholder that later verbs can reference?**
   The v1 pattern is: `bd create "Title" -p 1` → agent captures the ID → `bd update <id> --claim`. The abstract verb `create` has no way to express "use the ID from the preceding create." The `create-and-claim` compound verb solves the most common case, but more complex workflows (create task A, create task B, dep-add B A) still require the agent to manage IDs.
   **Recommendation**: Do not add an ID capture mechanism to the verb system. The verb system is a text replacement — it has no runtime state. The agent is responsible for capturing and reusing IDs, just as it would with any shell command. The `create-and-claim` compound handles 90% of cases.

3. **Should there be a `task-search` verb for finding tasks by keyword?**
   Beads has `bd list` with text search. GitHub Issues has `gh issue list --search`. TODO.md requires manual scanning. This isn't in the spec's 8 verbs, and v1 prompts don't commonly search by keyword.
   **Recommendation**: Defer. `list` with optional filters covers most use cases. Add `task-search` if real prompt authoring reveals a need.

4. **How should the `none` mixin handle multi-agent scenarios?**
   The spec warns that `task-tracking: none` + `agent-mode: multi` is a bad combination (agents need shared tracking). But it's allowed. With TODO.md, two agents editing the same file will create merge conflicts.
   **Recommendation**: Keep the existing warning in config validation (domain 06). Add a note in the `none` mixin's prose content: "If using multiple agents, consider switching to a shared task backend (beads or github-issues) to avoid merge conflicts in TODO.md."

### Recommendations

5. **Add a `verb-coverage` validation to `scaffold validate`** that checks every base prompt's verb markers against the selected mixin's verb registry. This catches cases where a prompt uses a verb the mixin doesn't know about before the agent encounters it at runtime.

6. **Ship a TODO.md template with the `none` mixin** that `scaffold init` creates when `task-tracking: none` is selected. Pre-populates the file header and explains the format, so agents don't have to guess the structure.

7. **ADR CANDIDATE: Whether `create-and-claim` should be in the core vocabulary or handled as a mixin-specific optimization.** The compound verb simplifies the common case but introduces a non-orthogonal verb (it combines two atomic operations). An alternative: the `create` verb accepts an optional `claim=true` named argument that mixins handle internally. Tradeoff: dedicated verb is more discoverable; named arg is more composable.

8. **ADR CANDIDATE: Verb replacement scope — global vs. mixin-section only.** Currently, verb markers are replaced across the entire prompt content. An alternative: only replace within `<!-- mixin:task-tracking -->` sections, leaving verb markers in other sections untouched. This would prevent accidental replacement in non-task-tracking contexts. However, the `scaffold:task-` prefix already namespaces the markers, making accidental collisions unlikely. Global replacement is simpler and matches the spec.

9. **Add a lint rule for prompt authors** that warns when a base prompt contains raw tool-specific commands (`bd create`, `gh issue`, etc.) instead of abstract task verb markers. This prevents bypassing the abstraction layer.

---

## Section 11: Concrete Examples

### Example 1: Happy Path — User Stories Prompt with Beads Mixin

**Scenario**: The `user-stories` base prompt contains task verb markers. Built with the `beads` mixin.

**Input — base prompt excerpt** (`base/user-stories.md`):

```markdown
## Process

1. Read `docs/plan.md` to understand all features and requirements.

2. Create a tracking task for this work:
   <!-- scaffold:task-create-and-claim "docs: create user stories" priority=0 -->

3. Write user stories following the template in Detailed Specifications below.

4. When complete, verify coverage by reviewing <!-- scaffold:task-list --> output
   against the PRD feature list.

5. Commit the document:
   ```
   git add docs/user-stories.md
   git commit -m "[task-id] docs(stories): create user stories from PRD"
   ```

6. Close the tracking task:
   <!-- scaffold:task-close TASK_ID -->
   <!-- scaffold:task-sync -->
```

**Input — MixinVerbRegistry** (beads):
```yaml
create-and-claim:
  template: |
    `bd create "$TITLE" -p $PRIORITY` then `bd update <id> --claim`
  format: prose
list:
  template: '`bd list`'
  format: prose
close:
  template: '`bd close $ID`'
  format: prose
sync:
  template: '`bd sync`'
  format: prose
```

**Step-by-step processing**:

1. Parse markers: 4 markers found at lines 5, 10, 17, 18.
2. Marker 1 (`create-and-claim`): positional=`["docs: create user stories"]`, named=`{priority: "0"}`.
3. Marker 2 (`list`): no args.
4. Marker 3 (`close`): positional=`["TASK_ID"]`.
5. Marker 4 (`sync`): no args.
6. Validate all against schemas: all pass.
7. Replace in reverse order (sync, close, list, create-and-claim).

**Output — built prompt excerpt**:

```markdown
## Process

1. Read `docs/plan.md` to understand all features and requirements.

2. Create a tracking task for this work:
   `bd create "docs: create user stories" -p 0` then `bd update <id> --claim`

3. Write user stories following the template in Detailed Specifications below.

4. When complete, verify coverage by reviewing `bd list` output
   against the PRD feature list.

5. Commit the document:
   ```
   git add docs/user-stories.md
   git commit -m "[task-id] docs(stories): create user stories from PRD"
   ```

6. Close the tracking task:
   `bd close TASK_ID`
   `bd sync`
```

The output reads naturally and contains concrete Beads commands.

### Example 2: None Mixin — Implementation Plan Review

**Scenario**: The `implementation-plan-review` prompt is a methodology extension in classic, but a hypothetical simplified version might be a base prompt with task verbs. Built with the `none` mixin to demonstrate TODO.md instructions.

**Input — prompt excerpt**:

```markdown
## Process

1. <!-- scaffold:task-list --> and compare against `docs/user-stories.md`.

2. For each gap found:
   <!-- scaffold:task-create "Cover gap: [description]" priority=1 -->

3. Add dependencies to existing tasks:
   <!-- scaffold:task-dep-add NEW_ID EXISTING_ID -->

4. Review the full dependency chain:
   <!-- scaffold:task-dep-tree -->

5. Check for circular dependencies:
   <!-- scaffold:task-dep-cycles -->
```

**Step-by-step processing**:

1. Parse: 5 markers found.
2. `list` → prose replacement.
3. `create` → prose replacement with TODO.md format.
4. `dep-add` → prose replacement.
5. `dep-tree` → **degraded** replacement (no CLI equivalent).
6. `dep-cycles` → **degraded** replacement.

**Output — built prompt excerpt**:

```markdown
## Process

1. Review `TODO.md` for all task entries and compare against `docs/user-stories.md`.

2. For each gap found:
   Add a new entry to `TODO.md`: `- [ ] [open] [P1] T-NNN: Cover gap: [description]`

3. Add dependencies to existing tasks:
   Add `  blocked-by: EXISTING_ID` on the line after `NEW_ID` in `TODO.md`

4. Review the full dependency chain:
   Review `blocked-by:` annotations in `TODO.md` to trace the dependency chain

5. Check for circular dependencies:
   Manually review `blocked-by:` chains in `TODO.md` for circular references
```

**Build warnings emitted**:
```
Warning: task verb "dep-tree" degraded for mixin "none": TODO.md has no dependency graph visualization
Warning: task verb "dep-cycles" degraded for mixin "none": TODO.md has no automated cycle detection
```

### Example 3: Error Path — Unknown Verb and Missing Argument

**Scenario**: A prompt author introduces a typo in a verb name and forgets a required argument.

**Input — prompt excerpt**:

```markdown
1. Archive old tasks:
   <!-- scaffold:task-archive status=done -->

2. Create the implementation task:
   <!-- scaffold:task-create priority=1 -->
```

**Step-by-step processing**:

1. Parse: 2 markers found.
2. Marker 1 (`archive`): verb not in vocabulary → `VERB_UNKNOWN`.
3. Marker 2 (`create`): positional args = `[]`, named = `{priority: "1"}`. Missing required positional arg `TITLE` → `VERB_MISSING_REQUIRED_ARG`.
4. Build fails with 2 errors.

**Error output (human-readable)**:

```
Error: Unknown task verb "task-archive" at line 2 in base/implementation-plan.md.
  Valid verbs: create, list, ready, claim, close, dep-add, show, sync,
  dep-tree, dep-remove, dep-cycles, update, create-and-claim

Error: Task verb "task-create" at line 5 in base/implementation-plan.md
  is missing required argument "TITLE".
  Usage: <!-- scaffold:task-create "Title" priority=N -->
```

**Error output (`--format json`)**:

```json
{
  "success": false,
  "command": "build",
  "errors": [
    {
      "code": "VERB_UNKNOWN",
      "verb": "archive",
      "line": 2,
      "file": "base/implementation-plan.md",
      "valid_verbs": ["create", "list", "ready", "claim", "close", "dep-add", "show", "sync", "dep-tree", "dep-remove", "dep-cycles", "update", "create-and-claim"]
    },
    {
      "code": "VERB_MISSING_REQUIRED_ARG",
      "verb": "create",
      "line": 5,
      "file": "base/implementation-plan.md",
      "missing_arg": "TITLE",
      "usage": "<!-- scaffold:task-create \"Title\" priority=N -->"
    }
  ],
  "exit_code": 5
}
```

### Example 4: GitHub Issues Mixin — Full Lifecycle

**Scenario**: A prompt walks through the full task lifecycle. Built with `github-issues` mixin.

**Input — prompt excerpt**:

```markdown
## Task Workflow

Before starting, check what's available:
<!-- scaffold:task-ready -->

Pick a task and claim it:
<!-- scaffold:task-claim 42 -->

If you find the task is blocked, update its status:
<!-- scaffold:task-update 42 status=blocked -->

When implementation is complete:
<!-- scaffold:task-close 42 -->

Force sync is not needed with this backend:
<!-- scaffold:task-sync -->
```

**Output — built prompt excerpt**:

```markdown
## Task Workflow

Before starting, check what's available:
`gh issue list --label "ready"`

Pick a task and claim it:
`gh issue edit 42 --add-assignee @me`

If you find the task is blocked, update its status:
`gh issue edit 42 --add-label "blocked"`

When implementation is complete:
`gh issue close 42`

Force sync is not needed with this backend:

```

Note: The `sync` verb is omitted entirely (empty replacement) since GitHub Issues are always remote. The trailing empty line is acceptable — no broken prose.
