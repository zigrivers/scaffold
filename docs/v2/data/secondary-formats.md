# Secondary Format Schemas

**Phase**: 4 — Data Schemas
**Depends on**: [domain-models/05-platform-adapters.md](../domain-models/05-platform-adapters.md), [domain-models/10-claude-md-management.md](../domain-models/10-claude-md-management.md), [adrs/ADR-017-tracking-comments-artifact-provenance.md](../adrs/ADR-017-tracking-comments-artifact-provenance.md), [adrs/ADR-026-claude-md-section-registry.md](../adrs/ADR-026-claude-md-section-registry.md), [adrs/ADR-041-meta-prompt-architecture.md](../adrs/ADR-041-meta-prompt-architecture.md), [architecture/system-architecture.md](../architecture/system-architecture.md) §5, §11
**Last updated**: 2026-03-14
**Status**: draft

**Status: Partially Transformed** — Sections 2.3 (Mixin Section Delimiters) and 2.4 (Task Verb Markers) are superseded by the meta-prompt architecture ([ADR-041](../adrs/ADR-041-meta-prompt-architecture.md)). Sections 2.1 (Tracking Comments) and 2.2 (Ownership Markers) remain current. Section 2.5 (Tool-map.yml) remains current for platform adapters.

---

## Section 1: Overview

This document specifies five secondary format schemas used throughout the Scaffold v2 pipeline. These formats are "secondary" because they are embedded within other artifacts (markdown files, CLAUDE.md, YAML configs) rather than being standalone state files like `state.json` or `decisions.jsonl`. Each format is small enough that it does not warrant a dedicated data schema document, but each requires precise formal definitions for implementation agents.

The five formats are:

1. **Tracking Comments** — Provenance metadata on line 1 of every scaffold-produced artifact. Enables mode detection (fresh vs. update), v1 migration detection, and artifact origin tracing. Defined by [ADR-017](../adrs/ADR-017-tracking-comments-artifact-provenance.md); consumed by domains 03, 07, and 10.

2. **CLAUDE.md Ownership Markers** — Open/close HTML comment pairs that delimit scaffold-managed sections within CLAUDE.md. The fill/replace algorithm uses these markers to perform section-level replacement without overwriting user content. Defined by [ADR-026](../adrs/ADR-026-claude-md-section-registry.md); consumed by domain 10.

3. **~~Mixin Section Delimiters~~** — **Superseded** by meta-prompt architecture ([ADR-041](../adrs/ADR-041-meta-prompt-architecture.md)). Preserved as historical reference.

4. **~~Abstract Task Verb Markers~~** — **Superseded** by meta-prompt architecture ([ADR-041](../adrs/ADR-041-meta-prompt-architecture.md)). Preserved as historical reference.

5. **Tool-map.yml** — YAML configuration file for the Codex (and Universal) platform adapter's phrase-level tool-name mapping. Translates Claude Code tool references into platform-appropriate language during the adapter stage. Defined by [ADR-023](../adrs/ADR-023-phrase-level-tool-mapping.md); consumed by domain 05.

**Why these are grouped**: All five are line-level or section-level embedded formats (not standalone files with their own lifecycle). They share a common implementation pattern: regex-based detection, positional constraints (line 1, own line, etc.), and HTML comment syntax. Grouping them provides a single reference for the assembly engine, state manager, and adapter system.

---

## Section 2: Formal Definitions

All regular expressions in this section use PCRE syntax with named capture groups. Patterns are written to be copy-pasteable into implementation code.

### 2.1 Tracking Comment

**v2 format** (current):

```pcre
^<!-- scaffold:(?P<prompt_slug>[a-z][a-z0-9-]*) v(?P<version>\d+) (?P<date>\d{4}-\d{2}-\d{2}) (?P<methodology>[a-z][a-z0-9-]*) -->$
```

**v1 format** (legacy, no methodology suffix):

```pcre
^<!-- scaffold:(?P<prompt_slug>[a-z][a-z0-9-]*) v(?P<version>\d+) (?P<date>\d{4}-\d{2}-\d{2}) -->$
```

**Architecture invariant regex** (matches both v1 and v2; used for boolean detection only):

```pcre
^<!-- scaffold:[a-z][a-z0-9-]* v\d+ \d{4}-\d{2}-\d{2}( [a-z0-9/:.-]+){0,1} -->$
```

The invariant regex from [system-architecture.md §11](../architecture/system-architecture.md) is:

```
<!-- scaffold:[a-z][a-z0-9-]* v\d+ \d{4}-\d{2}-\d{2}.*? -->
```

This invariant regex is for detection only. Use the formal v2 regex (Section 2.1) for parsing.

### 2.2 CLAUDE.md Ownership Markers

**Open marker**:

```pcre
^<!-- scaffold:managed by (?P<owner>[a-z][a-z0-9-]*) -->$
```

**Close marker**:

```pcre
^<!-- /scaffold:managed -->$
```

The close marker is a fixed literal string. It contains no variable fields.

### 2.3 Mixin Section Delimiters

**Status: Superseded** — Axis markers and task verb markers eliminated per meta-prompt architecture (ADR-041). This section is preserved as historical reference.

```pcre
^<!-- section:(?P<section_name>[a-z][a-z0-9-]*) -->$
```

Section delimiters must appear on their own line within a mixin file. Content between two consecutive delimiters (or from a delimiter to end-of-file) constitutes the named section.

### 2.4 Abstract Task Verb Markers

**Status: Superseded** — Axis markers and task verb markers eliminated per meta-prompt architecture (ADR-041). This section is preserved as historical reference.

**Full marker with optional arguments**:

```pcre
^(?P<full_marker><!-- scaffold:task-(?P<verb>[a-z][a-z0-9-]*) *(?P<args_raw>(?:"(?:[^"\\]|\\.)*"| +[a-z][a-z0-9_-]*=[^ ]+)*) *-->)$
```

**Argument tokenization** (applied to the captured `args_raw` group):

Positional argument (double-quoted string):

```pcre
"(?P<value>(?:[^"\\]|\\.)*)"
```

Named argument (key=value pair):

```pcre
(?P<key>[a-z][a-z0-9_-]*)=(?P<val>[^ ]+)
```

> Named argument keys allow underscores to support task-tracking backends that use underscored field names (e.g., `--add-assignee`). This is an intentional exception to the kebab-case-only convention.

Arguments are parsed left-to-right. Positional arguments (double-quoted strings) and named arguments (`key=value`) may be interleaved, but positional arguments are indexed in order of appearance regardless of named arguments between them.

**Verb name validation** (must be one of the 13 recognized verbs):

```pcre
^(?:create|list|ready|claim|close|dep-add|dep-tree|dep-remove|dep-cycles|show|sync|update|create-and-claim)$
```

### 2.5 Tool-map.yml

JSON Schema for the tool-map.yml file:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://scaffold.dev/schemas/tool-map.v1.json",
  "title": "Scaffold Tool-Name Mapping",
  "description": "Phrase-level tool-name mapping configuration for platform adapters.",
  "type": "object",
  "required": ["patterns"],
  "additionalProperties": false,
  "properties": {
    "patterns": {
      "type": "array",
      "description": "Ordered list of match/replace patterns. At runtime, sorted by match length (longest first) regardless of file order.",
      "items": {
        "type": "object",
        "required": ["match", "replace"],
        "additionalProperties": false,
        "properties": {
          "match": {
            "type": "string",
            "minLength": 1,
            "description": "The Claude Code-specific phrase to match. Case-sensitive. Must be a non-empty string."
          },
          "replace": {
            "type": "string",
            "description": "The platform-compatible replacement phrase. May be an empty string (to remove the phrase entirely)."
          }
        }
      },
      "minItems": 0
    }
  }
}
```

> **Customization**: Tool-map.yml is shipped as built-in content only. There is no project-level or user-level override mechanism (see architecture Section 11b). Users who need different tool-name mappings should create prompt overrides that use desired tool references directly.

---

## Section 3: Field/Component Reference

### 3.1 Tracking Comment Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `prompt_slug` | string | `[a-z][a-z0-9-]*` (kebab-case, starts with letter) | Identifier of the prompt that produced this artifact. Matches the prompt's slug in the methodology manifest. |

> **Note**: The pattern permits trailing hyphens (`a-`) and consecutive hyphens (`tech--stack`). These are syntactically valid but discouraged by convention. `scaffold validate` does not flag them.

| `version` | integer | Positive integer, no leading zeros | Schema version of the artifact. Currently `1` for all v2 artifacts. Incremented when the artifact's expected structure changes. |

The version in a tracking comment is an integer counter (v1, v2, v3...) indicating how many times this prompt has produced this artifact. It is NOT the scaffold CLI version (which uses semver). The counter increments each time the prompt re-runs in update mode.
| `date` | string | ISO 8601 date `YYYY-MM-DD` | Date the artifact was produced or last updated. |
| `methodology` | string | `[a-z][a-z0-9-]*` (kebab-case) | The methodology name active when the artifact was produced (e.g., `deep`, `mvp`). **v2 only.** |

**v1 vs. v2 discrimination**: A tracking comment is v1 format if and only if it matches the v1 regex (exactly three space-separated fields after `scaffold:` before `-->`). The absence of the methodology field is the distinguishing signal. The v2 format has exactly four space-separated fields (slug, version, date, methodology). Mixin summary was eliminated by the meta-prompt architecture ([ADR-041](../adrs/ADR-041-meta-prompt-architecture.md)).

### 3.2 CLAUDE.md Ownership Marker Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `owner` | string | `[a-z][a-z0-9-]*` (kebab-case prompt slug) | The prompt slug that owns the managed section. Must match a prompt in the resolved pipeline. |

**Structural rules**:

| Rule | Description |
|------|-------------|
| Pairing | Every open marker must have exactly one corresponding close marker below it in the file. |
| No nesting | A managed section must not contain another open marker. If detected, emit error `CMD_NESTED_MARKERS`. |
| Uniqueness | Each `owner` value should appear at most once in CLAUDE.md. Duplicate owners produce warning `CMD_DUPLICATE_OWNER`. |
| Line position | Both open and close markers must appear on their own line (no inline content before or after on the same line). |
| Scope | Content between the open marker line and the close marker line (exclusive of both marker lines) is the managed content. |

### Code Fence Handling

Ownership markers appearing inside markdown fenced code blocks (`` ``` `` or `~~~`) MUST be ignored by the parser. Code blocks frequently contain example marker syntax in documentation. This matches the behavior of section extraction for the `reads` field (see frontmatter-schema.md Section 5), which also ignores headings inside code fences.

When scanning CLAUDE.md for ownership markers:
1. Track whether the current line is inside a code fence
2. A line starting with `` ``` `` or `~~~` toggles the fence state
3. Lines inside a fence are never matched as markers

### 3.3 Mixin Section Delimiter Fields

**Status: Superseded** — Mixin section delimiters eliminated per meta-prompt architecture (ADR-041). This section is preserved as historical reference.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `section_name` | string | `[a-z][a-z0-9-]*` (kebab-case, starts with letter) | The name of the section being delimited. Referenced by sub-section targeting markers in prompts. |

**Structural rules**:

| Rule | Description |
|------|-------------|
| Own line | Each delimiter must occupy its own line. No content before or after on the same line. |
| Section extent | A section extends from the delimiter line (exclusive) to the next delimiter line (exclusive) or end-of-file. |
| Preamble | Content before the first section delimiter is the "preamble." It is included in full-content injection but is not addressable as a named section. |
| Default behavior | If a mixin file has no section delimiters, the entire file content is the preamble, and `fullContent` equals the preamble. Sub-section markers targeting such a file produce `INJ_SECTION_NOT_FOUND`. |
| Duplicate names | Duplicate section names within a mixin file produce warning `INJ_DUPLICATE_SECTION_NAME`. Last occurrence wins. |

### 3.4 Abstract Task Verb Marker Fields

**Status: Superseded** — Abstract task verb markers eliminated per meta-prompt architecture (ADR-041). This section is preserved as historical reference.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `verb` | `VerbName` | One of 13 recognized verbs (see Section 2.4) | The task operation to perform. |
| `args_raw` | string | Sequence of positional and named arguments | The raw argument string after the verb, before parsing. |

**Argument fields** (parsed from `args_raw`):

| Argument Type | Syntax | Storage | Example |
|---------------|--------|---------|---------|
| Positional | `"double-quoted string"` | `VerbArguments.positional[N]` (0-indexed, in order of appearance) | `"Fix login bug"` |
| Named | `key=value` | `VerbArguments.named[key]` | `priority=1` |

**Escape sequences within positional arguments**:

| Sequence | Meaning |
|----------|---------|
| `\"` | Literal double quote |
| `\\` | Literal backslash |

All other characters within double quotes are literal. No other escape sequences are defined.

**Verb argument schemas** (which arguments each verb accepts):

| Verb | Required Positional | Optional Positional | Named Parameters |
|------|-------------------|-------------------|-----------------|
| `create` | `$TITLE` | -- | `priority=$PRIORITY` |
| `list` | -- | -- | -- |
| `ready` | -- | -- | -- |
| `claim` | `$ID` | -- | -- |
| `close` | `$ID` | -- | -- |
| `dep-add` | `$CHILD`, `$PARENT` | -- | -- |
| `dep-tree` | `$ID` | -- | -- |
| `dep-remove` | `$CHILD`, `$PARENT` | -- | -- |
| `dep-cycles` | -- | -- | -- |
| `show` | `$ID` | -- | -- |
| `sync` | -- | -- | -- |
| `update` | `$ID` | -- | `status=$STATUS`, `$FIELDS` (freeform key=value pairs) |

> `$FIELDS` is a space-separated list of `key=value` pairs specifying which fields to update. Valid field names are backend-specific and not enumerated by scaffold (they pass through to the concrete command). Maximum: 5 key=value pairs per marker. Example: `<!-- scaffold:task-update ID status=in-progress assignee=agent-1 -->`

| `create-and-claim` | `$TITLE` | -- | `priority=$PRIORITY` |

### 3.5 Tool-map.yml Fields

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `patterns` | array | May be empty | Ordered list of match/replace pattern entries. |
| `patterns[].match` | string | Non-empty, case-sensitive | The phrase to find in prompt content. Must be a non-empty string. |
| `patterns[].replace` | string | May be empty | The replacement phrase. An empty string removes the matched phrase. |

**Runtime behavior fields** (not stored in the file; computed at build time):

| Property | Description |
|----------|-------------|
| Sort order | Patterns are sorted by `match` string length descending (longest first) before application, regardless of file order. |
| Match semantics | Case-sensitive literal string matching. No regex, no globbing. |
| Application pass | Single-pass. Each character position in the content is matched at most once. Replacement text is never re-scanned. |
| Deduplication | If two entries have the same `match` string, the first occurrence is used and `TOOL_MAP_DUPLICATE_PATTERN` warning is emitted. |

---

## Section 4: Cross-Schema References

This section maps every cross-reference between the five formats and other Scaffold v2 schemas.

### 4.1 Tracking Comments

| Referenced By | Context | Reference Type |
|---------------|---------|----------------|
| `state.json` (domain 03) | Dual completion detection reads tracking comments to confirm scaffold provenance | Read: line 1 of `produces` targets |
| `scaffold adopt` (domain 07) | Scans for v1/v2 tracking comments to map existing artifacts to prompts | Read: line 1 of all markdown files in project tree |
| CLAUDE.md management (domain 10) | Tracking comment on CLAUDE.md itself records overall provenance | Read/Write: line 1 of CLAUDE.md |
| Prompt frontmatter `produces` field (domain 08) | Each file path in `produces` is expected to have a tracking comment after prompt execution | Write: CLI writes tracking comment when prompt completes |
| Ownership markers (this document, Section 3.2) | Tracking comments and ownership markers coexist in CLAUDE.md. Tracking comment is on line 1; ownership markers delimit sections within the body. | Coexistence: non-overlapping concerns |

### 4.2 CLAUDE.md Ownership Markers

| Referenced By | Context | Reference Type |
|---------------|---------|----------------|
| Section registry (domain 10) | `ReservedSection.owner` determines which prompt slug appears in ownership markers | Data source: prompt slug |
| Fill/replace algorithm (domain 10, Section 4) | Finds open marker, replaces everything until close marker | Read/Write: markers delimit replacement scope |
| `scaffold validate` (domain 09) | Validates marker pairing, no nesting, owner matches registry | Read: structural validation |
| Platform adapters (domain 05) | Codex adapter produces equivalent section management in AGENTS.md | Pattern reuse (not direct reference) |

### 4.3 Mixin Section Delimiters

| Referenced By | Context | Reference Type |
|---------------|---------|----------------|
| Axis markers in prompts (domain 12) | `<!-- mixin:<axis>:<sub-section> -->` references a section name defined by these delimiters | Name reference: prompt marker targets delimiter-defined section |
| `MixinFile.sections` (domain 12, Section 3) | Parsing mixin files extracts sections keyed by delimiter names | Parse target |
| `InjectionContext` (domain 12) | Injection engine loads and parses mixin files, resolving section delimiters | Read: during build Pass 1 |

### 4.4 Abstract Task Verb Markers

| Referenced By | Context | Reference Type |
|---------------|---------|----------------|
| `MixinVerbRegistry` (domain 04) | Each verb maps to a `VerbReplacementTemplate` in the task-tracking mixin | Resolution target: verb name to template |
| Injection Pass 2 (domain 12) | Verb markers are replaced globally after axis injection completes | Read/Replace: marker to concrete command |
| `VerbArgumentSchema` (domain 04, Section 3) | Defines which arguments each verb accepts; used for validation | Validation reference |
| Unresolved marker check (domain 12) | After Pass 2, remaining `<!-- scaffold:task-* -->` markers are errors unless `--allow-unresolved-markers` | Error detection |
| Platform adapters (domain 05) | Verb markers are fully resolved before adapters run. Adapters never see verb markers. | Precondition: markers absent in adapter input |

### 4.5 Tool-map.yml

| Referenced By | Context | Reference Type |
|---------------|---------|----------------|
| Codex adapter initialization (domain 05) | Loaded during `initialize()`. Missing file produces `TOOL_MAP_NOT_FOUND`. | File load |
| Universal adapter (domain 05) | Uses its own `adapters/universal/tool-map.yml` with the same schema | Parallel instance |
| Assembly Engine (domain 15) | Tool mapping is applied to assembled prompt content during platform-specific output generation | Input dependency: applied to assembled output |
| `scaffold build` (domain 09) | Build orchestrator invokes adapters which load tool-map.yml | Transitive dependency via adapter |

### 4.6 Cross-Format Interactions

| File | Format 1 | Format 2 | Interaction |
|------|----------|----------|-------------|
| CLAUDE.md | Tracking comment (line 1) | Ownership markers (body) | Non-overlapping. Tracking comment occupies line 1 only. Ownership markers appear in the document body under `##` headings. The fill/replace algorithm never touches line 1. |

(The original mixin file interaction between section delimiters and task verb markers is superseded — [ADR-041](../adrs/ADR-041-meta-prompt-architecture.md).)

---

## Section 5: Version History and Migration

### 5.1 Versioning Strategy

Four of the five formats in this document (tracking comments, ownership markers, mixin section delimiters, and task verb markers) are **inline embedded formats** — they exist as HTML comments within other files. They do not carry their own version fields (with one exception: tracking comments include a version field, but that version refers to the *artifact schema*, not the *comment format*).

Tool-map.yml also has no explicit version field. Its schema is implicitly versioned through the CLI version that ships it.

### 5.2 Per-Format Version History

**Tracking Comments**:

| Era | Format | Detection Signal |
|-----|--------|-----------------|
| v1 (scaffold v1.x) | `<!-- scaffold:<slug> v<ver> <date> -->` | 3 space-separated fields after `scaffold:`, no methodology or mixin suffix |
| v2 (scaffold v2.0+) | `<!-- scaffold:<slug> v<ver> <date> <methodology> -->` | 4 space-separated fields after `scaffold:`, methodology present (mixin summary eliminated by [ADR-041](../adrs/ADR-041-meta-prompt-architecture.md)) |

Migration: The CLI must recognize both formats. v1 tracking comments trigger v1-migration mode in domain 07. No automated rewriting of v1 comments to v2 format occurs — v2 tracking comments are written when a prompt re-runs in update mode and produces new artifacts. The `scaffold adopt` command reads v1 comments but does NOT write tracking comments (read-only operation per [ADR-017](../adrs/ADR-017-tracking-comments-artifact-provenance.md)).

**CLAUDE.md Ownership Markers**: No prior version. Introduced in v2. No migration needed.

**Mixin Section Delimiters**: No prior version. Introduced in v2. No migration needed.

**Abstract Task Verb Markers**: No prior version. v1 used hardcoded `bd` commands in prompts. v2 introduces abstract markers as a replacement. No migration of v1 prompt content is needed because v1 prompts are not carried forward — they are replaced by v2 base prompts with embedded verb markers.

**Tool-map.yml**: No prior version. Introduced in v2. Ships as a built-in data file with the CLI package.

### 5.3 Future Format Changes

If any of these formats change in a future version:

- **Tracking comments**: The `version` field in the comment tracks artifact schema version, not comment format version. A comment format change would require a new invariant regex and a detection mechanism to distinguish the old and new comment formats (similar to v1/v2 discrimination).
- **Ownership markers**: A format change would require updating the fill/replace algorithm in domain 10 and all validation regexes. The close marker's fixed literal form makes it particularly brittle to change.
- **Section delimiters**: Superseded by [ADR-041](../adrs/ADR-041-meta-prompt-architecture.md). No future changes expected.
- **Verb markers**: Superseded by [ADR-041](../adrs/ADR-041-meta-prompt-architecture.md). No future changes expected.
- **Tool-map.yml**: A schema change would require a JSON Schema version bump and migration logic in the adapter loader.

---

## Section 6: Serialization Details

### 6.1 Tracking Comments

| Property | Value |
|----------|-------|
| Encoding | UTF-8 |
| Position | Line 1 of the file, column 1. No BOM, no blank lines before it. |
| Line terminator | LF (`\n`) or CRLF (`\r\n`). The comment itself does not include the line terminator. |
| Whitespace | Exactly one space between each field. No tabs. No trailing whitespace before `-->`. |
| Delimiter | Standard HTML comment delimiters: `<!--` (open), `-->` (close). Exactly one space after `<!--` and one space before `-->`. |
| Field separator | Single space (U+0020) between all fields. |
| Escaping | None. Field values must not contain spaces, `>`, or `-`. These constraints are enforced by the character class restrictions in the regex. |
| Completeness | All fields are mandatory. A tracking comment with missing fields is malformed and should be treated as "no tracking comment present" for mode detection. |

**Serialization template** (v2):

```
<!-- scaffold:{prompt_slug} v{version} {date} {methodology} -->
```

The v2 tracking comment has exactly four space-separated fields after `scaffold:`: the step slug, the version counter, the date, and the methodology name. (The original v2 design included a fifth `{mixin_summary}` field, but mixin axes were eliminated by the meta-prompt architecture — [ADR-041](../adrs/ADR-041-meta-prompt-architecture.md).)

### 6.2 CLAUDE.md Ownership Markers

| Property | Value |
|----------|-------|
| Encoding | UTF-8 (same as containing CLAUDE.md file) |
| Position | Own line within the CLAUDE.md body. Typically immediately after a `##` heading line. |
| Line terminator | Inherits from the file. |
| Whitespace | Exactly one space between each word in the marker. No leading or trailing whitespace on the line. |
| Delimiter | Standard HTML comment delimiters. |

**Serialization templates**:

```
<!-- scaffold:managed by {owner} -->
```

```
<!-- /scaffold:managed -->
```

The close marker is invariant (no variable fields).

### 6.3 Mixin Section Delimiters

| Property | Value |
|----------|-------|
| Encoding | UTF-8 (same as containing mixin file) |
| Position | Own line within a mixin `.md` file. |
| Line terminator | Inherits from the file. |
| Whitespace | Exactly one space after `<!--` and before `-->`. No leading or trailing whitespace on the line. |
| Delimiter | Standard HTML comment delimiters. |

**Serialization template**:

```
<!-- section:{section_name} -->
```

### 6.4 Abstract Task Verb Markers

| Property | Value |
|----------|-------|
| Encoding | UTF-8 (same as containing prompt/mixin file) |
| Position | Own line within a prompt or mixin content file. |
| Line constraint | Single-line only. No multi-line markers. Each marker occupies exactly one line. |
| Line terminator | Inherits from the file. |
| Whitespace | One space after `<!--`. At least one space before `-->`. Arguments separated by whitespace (one or more spaces). |
| Delimiter | Standard HTML comment delimiters. |

**Serialization template**:

```
<!-- scaffold:task-{verb} {args} -->
```

**Argument serialization rules**:

- Positional arguments: enclosed in double quotes. Internal double quotes escaped as `\"`. Internal backslashes escaped as `\\`.
- Named arguments: `key=value` with no spaces around `=`. Value must not contain whitespace. If a value needs whitespace, it must be a positional argument instead.
- Arguments are space-separated. Multiple consecutive spaces are treated as a single separator.
- An argumentless marker has no space between the verb and `-->` except the required trailing space: `<!-- scaffold:task-list -->`.

### 6.5 Tool-map.yml

| Property | Value |
|----------|-------|
| Encoding | UTF-8 |
| Format | YAML 1.2 |
| Location | `content/adapters/codex/tool-map.yml` (Codex adapter), `content/adapters/universal/tool-map.yml` (Universal adapter) |
| YAML restrictions | No aliases, no anchors, no multi-document streams (per [ADR-014](../adrs/ADR-014-config-schema-versioning.md) general YAML policy). |
| Key quoting | `match` and `replace` values should be quoted if they contain YAML-special characters (`:`, `#`, `{`, `}`, etc.). |
| Max file size | Practical limit: ~100 patterns. No hard size constraint. |

**Serialization example**:

```yaml
patterns:
  - match: "use the Read tool"
    replace: "read the file"
  - match: "use the Edit tool"
    replace: "edit the file"
  - match: "use the Grep tool"
    replace: "search the codebase"
  - match: "use the Write tool"
    replace: "write the file"
  - match: "use the Bash tool to run"
    replace: "run"
  - match: "use AskUserQuestionTool"
    replace: "ask the user"
  - match: "spawn a review subagent"
    replace: "perform a review"
```

---

## Section 7: Validation Rules

Each format defines validation rules with unique error codes. Error codes follow the domain conventions from [ADR-040](../adrs/ADR-040-error-handling-philosophy.md): structural violations are errors (fatal), advisory issues are warnings (non-fatal).

### 7.1 Tracking Comment Validation

| Code | Severity | Condition | Message Template |
|------|----------|-----------|------------------|
| `TRK_MISSING` | warning | Line 1 of a `produces` target does not contain a tracking comment after prompt execution | `Tracking comment missing from '{path}'. Expected on line 1.` |
| `TRK_MALFORMED` | error | Line 1 matches `<!-- scaffold:` prefix but does not match the full v1 or v2 regex | `Malformed tracking comment on line 1 of '{path}': '{line_content}'. Expected format: <!-- scaffold:<slug> v<ver> <date> <methodology> <mixin-summary> -->` |
| `TRK_SLUG_MISMATCH` | warning | Tracking comment's `prompt_slug` does not match the prompt that claims to produce this artifact | `Tracking comment in '{path}' claims producer '{found_slug}' but prompt '{expected_slug}' lists it in produces.` |
| `TRK_FUTURE_DATE` | warning | Tracking comment's `date` is in the future relative to the system clock | `Tracking comment in '{path}' has future date '{date}'.` |
| `TRK_V1_DETECTED` | info | Tracking comment matches v1 format (no methodology/mixin suffix) | `V1 tracking comment detected in '{path}'. Will be updated to v2 format on next prompt re-run.` |
| `TRK_VERSION_ZERO` | error | Version field is `0` or negative | `Invalid version '{version}' in tracking comment of '{path}'. Version must be a positive integer.` |

### 7.2 CLAUDE.md Ownership Marker Validation

| Code | Severity | Condition | Message Template |
|------|----------|-----------|------------------|
| `CMD_UNPAIRED_OPEN` | error | An open marker has no corresponding close marker below it | `Unpaired ownership marker in CLAUDE.md at line {line}: '<!-- scaffold:managed by {owner} -->'. No matching close marker found.` |
| `CMD_UNPAIRED_CLOSE` | error | A close marker has no preceding open marker | `Orphaned close marker in CLAUDE.md at line {line}: '<!-- /scaffold:managed -->'. No matching open marker found above.` |
| `CMD_NESTED_MARKERS` | error | An open marker appears between another open/close pair | `Nested ownership markers in CLAUDE.md: '<!-- scaffold:managed by {inner_owner} -->' at line {inner_line} is inside section owned by '{outer_owner}' (opened at line {outer_line}).` |
| `CMD_DUPLICATE_OWNER` | warning | The same `owner` slug appears in more than one open marker | `Duplicate ownership markers for '{owner}' in CLAUDE.md at lines {line1} and {line2}. Each prompt should own at most one section.` |
| `CMD_UNKNOWN_OWNER` | warning | The `owner` slug does not match any prompt in the resolved pipeline | `Ownership marker in CLAUDE.md references unknown prompt '{owner}' at line {line}. The prompt may have been removed from the pipeline.` |
| `CMD_SECTION_NOT_FILLED` | warning | Markers are present but content between them is empty or contains only a reservation placeholder, while state.json shows the owning prompt as completed | `Section owned by '{owner}' in CLAUDE.md has not been filled, but prompt is marked completed in state.json.` |

### 7.3 Mixin Section Delimiter Validation

| Code | Severity | Condition | Message Template |
|------|----------|-----------|------------------|
| `INJ_SECTION_NOT_FOUND` | error | A prompt's sub-section marker (`<!-- mixin:<axis>:<name> -->`) references a section name not found in the target mixin file | `Section '{name}' not found in mixin '{axis}/{value}.md'. Available sections: {available_names}.` |
| `INJ_DUPLICATE_SECTION_NAME` | warning | A mixin file contains two `<!-- section:<name> -->` delimiters with the same name | `Duplicate section name '{name}' in '{axis}/{value}.md' at lines {line1} and {line2}. Last occurrence wins.` |
| `INJ_EMPTY_SECTION` | warning | A named section exists but contains no content (delimiter immediately followed by next delimiter or EOF) | `Section '{name}' in '{axis}/{value}.md' is empty (line {line}).` |
| `INJ_INVALID_SECTION_NAME` | error | Section name does not match `[a-z][a-z0-9-]*` | `Invalid section name '{name}' in '{axis}/{value}.md' at line {line}. Section names must be kebab-case starting with a letter.` |

### 7.4 Abstract Task Verb Marker Validation

| Code | Severity | Condition | Message Template |
|------|----------|-----------|------------------|
| `INJ_VERB_UNKNOWN` | error | Verb name does not match any of the 13 recognized verbs | `Unknown task verb '{verb}' at line {line} in '{file}'. Recognized verbs: create, list, ready, claim, close, dep-add, dep-tree, dep-remove, dep-cycles, show, sync, update, create-and-claim.` |
| `INJ_VERB_ARG_MISSING` | error | A required positional argument is not provided | `Missing required argument '{arg_name}' for verb '{verb}' at line {line} in '{file}'.` |
| `INJ_VERB_ARG_UNEXPECTED` | warning | An extra positional or named argument is provided beyond what the verb schema accepts | `Unexpected argument '{arg}' for verb '{verb}' at line {line} in '{file}'. This argument will be ignored during replacement.` |
| `INJ_VERB_UNRESOLVED` | error | A task verb marker remains in the prompt content after Pass 2 completes (no `--allow-unresolved-markers`) | `Unresolved task verb marker at line {line}: '{raw_text}'. The task-tracking mixin may not define a replacement for verb '{verb}'.` |
| `INJ_VERB_UNRESOLVED` | warning | Same condition but `--allow-unresolved-markers` is active | `Unresolved task verb marker at line {line}: '{raw_text}'. Marker left in output due to --allow-unresolved-markers.` |
| `INJ_VERB_MALFORMED_ARG` | error | Argument parsing fails (e.g., unterminated quote, `=` with no value) | `Malformed arguments in task verb marker at line {line} in '{file}': '{raw_text}'. Check for unterminated quotes or malformed key=value pairs.` |
| `INJ_VERB_UNSUPPORTED` | warning | Verb is recognized but the selected task-tracking mixin marks it as unsupported | `Task verb '{verb}' is not supported by the '{mixin}' task-tracking mixin. Behavior: {behavior}.` |

### 7.5 Tool-map.yml Validation

| Code | Severity | Condition | Message Template |
|------|----------|-----------|------------------|
| `TOOL_MAP_NOT_FOUND` | error | The tool-map.yml file does not exist at the expected path | `Tool mapping file not found: {path}` |
| `TOOL_MAP_INVALID` | error | YAML parse error or schema validation failure | `Tool mapping file has invalid structure: {details}` |
| `TOOL_MAP_EMPTY_MATCH` | error | A pattern entry has an empty `match` string | `Empty match string in tool-map.yml at pattern index {index}. Match must be a non-empty string.` |
| `TOOL_MAP_MISSING_FIELD` | error | A pattern entry is missing the `match` or `replace` field | `Missing required field '{field}' in tool-map.yml at pattern index {index}.` |
| `TOOL_MAP_DUPLICATE_PATTERN` | warning | Two pattern entries have the same `match` string | `Duplicate match pattern '{match}' in tool-map.yml. Using first occurrence.` |
| `TOOL_MAP_NO_MATCH` | warning | A pattern in tool-map.yml never matched any content across all prompts in a build | `Pattern '{match}' in tool-map.yml never matched any content across {count} prompts.` |
| `CASCADE_RISK` | warning | A pattern's `replace` text contains another pattern's `match` text | `Pattern '{match1}' replaces with text containing pattern '{match2}'. No cascade occurs (single-pass), but this may indicate a mapping issue.` |

---

## Section 8: Examples

### 8.1 Tracking Comment Examples

**Valid v2 tracking comment**:

```html
<!-- scaffold:tech-stack v1 2026-03-12 deep -->
```

Fields: `prompt_slug=tech-stack`, `version=1`, `date=2026-03-12`, `methodology=deep`.

**Valid v1 tracking comment** (legacy):

```html
<!-- scaffold:tech-stack v1 2026-01-15 -->
```

Fields: `prompt_slug=tech-stack`, `version=1`, `date=2026-01-15`. No methodology field.

**Invalid: missing version prefix**:

```html
<!-- scaffold:tech-stack 1 2026-03-12 deep -->
```

Fails regex: version field must start with `v`.

**Invalid: spaces in prompt slug**:

```html
<!-- scaffold:tech stack v1 2026-03-12 deep -->
```

Fails regex: `prompt_slug` must be kebab-case (no spaces). The parser would misinterpret field boundaries.

**Invalid: tracking comment not on line 1**:

```markdown
# Tech Stack

<!-- scaffold:tech-stack v1 2026-03-12 deep -->
```

Even though the comment matches the regex, it is not on line 1. Mode detection treats this as "no tracking comment present" (fresh mode).

**Invalid: extra whitespace between fields**:

```html
<!--  scaffold:tech-stack  v1  2026-03-12  deep  -->
```

Fails regex: exactly one space is required between fields and after `<!--`.

### 8.2 CLAUDE.md Ownership Marker Examples

**Valid managed section**:

```markdown
## Dev Environment

<!-- scaffold:managed by dev-env-setup -->

- **Build tool**: npm scripts
- **Test**: vitest (`npm test`)
- **Lint**: ESLint + Prettier (`npm run lint`)
- See `docs/dev-setup.md` for full environment details

<!-- /scaffold:managed -->
```

**Valid empty managed section** (placeholder state):

```markdown
## Coding Standards

<!-- scaffold:managed by coding-standards -->
<!-- /scaffold:managed -->
```

**Invalid: nested markers**:

```markdown
## Dev Environment

<!-- scaffold:managed by dev-env-setup -->

Some content here.

<!-- scaffold:managed by coding-standards -->
This is not allowed.
<!-- /scaffold:managed -->

More content.

<!-- /scaffold:managed -->
```

Error: `CMD_NESTED_MARKERS`. The `coding-standards` open marker is inside the `dev-env-setup` managed section.

**Invalid: unpaired open marker**:

```markdown
## Dev Environment

<!-- scaffold:managed by dev-env-setup -->

Content without a closing marker.

## Next Section
```

Error: `CMD_UNPAIRED_OPEN`. No `<!-- /scaffold:managed -->` found before the next section or end of file.

### 8.3 Mixin Section Delimiter Examples

**Mixin file with named sections** (`mixins/task-tracking/beads.md`):

```markdown
Beads is the task-tracking tool for this project.
All tasks are managed through the `bd` CLI.

<!-- section:setup -->

Install Beads and initialize the task database:

```bash
brew install beads
bd init
```

<!-- section:close-workflow -->

After completing a task:

```bash
bd close <id>
bd sync
```

<!-- section:pr-integration -->

Before creating a PR, ensure all tasks are synced:

```bash
bd sync
gh pr create --title "[BD-<id>] type(scope): description"
```
```

Parsed result:
- **Preamble**: "Beads is the task-tracking tool... `bd` CLI."
- **Section `setup`**: "Install Beads... `bd init`"
- **Section `close-workflow`**: "After completing... `bd sync`"
- **Section `pr-integration`**: "Before creating a PR... description\""

**Mixin file with no sections** (`mixins/tdd/strict.md`):

```markdown
This project uses strict TDD methodology.

1. Write a failing test first
2. Write the minimum code to make it pass
3. Refactor while keeping tests green
```

Parsed result:
- **Preamble**: entire file content
- **Sections**: empty map
- Sub-section targeting (e.g., `<!-- mixin:tdd:setup -->`) would produce `INJ_SECTION_NOT_FOUND`.

**Invalid: section name with uppercase**:

```markdown
<!-- section:CloseWorkflow -->
```

Error: `INJ_INVALID_SECTION_NAME`. Section names must be kebab-case starting with a lowercase letter.

### 8.4 Abstract Task Verb Marker Examples

**Valid: create with title and priority**:

```html
<!-- scaffold:task-create "Implement user authentication" priority=1 -->
```

Parsed: `verb=create`, `positional=["Implement user authentication"]`, `named={ priority: "1" }`.

**Valid: close with ID**:

```html
<!-- scaffold:task-close "$ID" -->
```

Parsed: `verb=close`, `positional=["$ID"]`, `named={}`. Note: `$ID` is literal text here; it is a placeholder in the prompt that the agent fills in at execution time.

**Valid: dep-add with two positional arguments**:

```html
<!-- scaffold:task-dep-add "$CHILD" "$PARENT" -->
```

Parsed: `verb=dep-add`, `positional=["$CHILD", "$PARENT"]`, `named={}`.

**Valid: list with no arguments**:

```html
<!-- scaffold:task-list -->
```

Parsed: `verb=list`, `positional=[]`, `named={}`.

**Valid: create-and-claim with title and priority**:

```html
<!-- scaffold:task-create-and-claim "Set up CI pipeline" priority=0 -->
```

Parsed: `verb=create-and-claim`, `positional=["Set up CI pipeline"]`, `named={ priority: "0" }`.

**Valid: escaped quote in positional argument**:

```html
<!-- scaffold:task-create "Fix \"double quote\" handling" priority=2 -->
```

Parsed: `verb=create`, `positional=["Fix \"double quote\" handling"]`, `named={ priority: "2" }`. The backslash-escaped quotes are preserved in the raw positional value; the replacement template is responsible for handling them.

**Invalid: unknown verb**:

```html
<!-- scaffold:task-assign "agent-1" -->
```

Error: `INJ_VERB_UNKNOWN`. `assign` is not one of the 13 recognized verbs.

**Invalid: multi-line marker**:

```html
<!-- scaffold:task-create
  "Implement user authentication"
  priority=1 -->
```

Error: task verb markers must be single-line. The parser operates line-by-line and will not match this across lines.

**Invalid: unterminated quote**:

```html
<!-- scaffold:task-create "Implement user authentication priority=1 -->
```

Error: `INJ_VERB_MALFORMED_ARG`. The opening `"` has no corresponding closing `"`.

**Replacement example** (Beads mixin):

Source marker:
```html
<!-- scaffold:task-create "Fix login bug" priority=1 -->
```

Verb registry template: `bd create "$TITLE" -p $PRIORITY`

Replacement output:
```
`bd create "Fix login bug" -p 1`
```

**Unsupported verb example** (GitHub Issues mixin, `dep-cycles` verb):

Source marker:
```html
<!-- scaffold:task-dep-cycles -->
```

Verb registry entry: `{ verb: "dep-cycles", template: null, unsupportedBehavior: "comment", unsupportedText: "GitHub Issues does not have built-in circular dependency detection. Manually review issue dependencies for cycles." }`

Replacement output:
```html
<!-- Task verb dep-cycles not supported by github-issues. Manually: GitHub Issues does not have built-in circular dependency detection. Manually review issue dependencies for cycles. -->
```

**Unsupported verb with `omit` behavior**:

Source marker:
```html
<!-- scaffold:task-sync -->
```

Verb registry entry: `{ verb: "sync", template: null, unsupportedBehavior: "omit" }`

Replacement output: *(marker line removed entirely; no text left in its place)*

### 8.5 Tool-map.yml Examples

**Valid tool-map.yml**:

```yaml
patterns:
  - match: "use the Read tool"
    replace: "read the file"
  - match: "use the Edit tool"
    replace: "edit the file"
  - match: "use the Grep tool"
    replace: "search the codebase"
  - match: "use the Write tool"
    replace: "write the file"
  - match: "use the Bash tool to run"
    replace: "run"
  - match: "use AskUserQuestionTool"
    replace: "ask the user"
  - match: "spawn a review subagent"
    replace: "perform a review"
```

**Application example**:

Input text:
```
First, use the Read tool to examine the existing codebase. Then use the Edit tool to modify the configuration.
```

Sorted patterns (longest first): `"use the Bash tool to run"` (25 chars), `"use AskUserQuestionTool"` (24 chars), `"spawn a review subagent"` (24 chars), `"use the Write tool"` (19 chars), `"use the Grep tool"` (18 chars), `"use the Read tool"` (18 chars), `"use the Edit tool"` (18 chars).

Output:
```
First, read the file to examine the existing codebase. Then edit the file to modify the configuration.
```

**Invalid: empty match string**:

```yaml
patterns:
  - match: ""
    replace: "something"
```

Error: `TOOL_MAP_EMPTY_MATCH`. Match must be a non-empty string.

**Invalid: missing replace field**:

```yaml
patterns:
  - match: "use the Read tool"
```

Error: `TOOL_MAP_MISSING_FIELD`. The `replace` field is required (though it may be an empty string).

**Valid: empty replace (removal)**:

```yaml
patterns:
  - match: " using the Bash tool"
    replace: ""
```

This removes the phrase entirely from the output. "Run the tests using the Bash tool" becomes "Run the tests".

---

## Section 9: Interaction with Other State Files

This section documents how the five secondary formats interact with Scaffold v2's primary state files during the build and runtime pipelines.

### 9.1 Interactions with config.yml

| Format | Interaction | Direction | When |
|--------|-------------|-----------|------|
| Tracking comments | `methodology` field in the tracking comment is populated from `config.yml`'s methodology selection. | config.yml -> tracking comment | Step completion (CLI writes tracking comment) |
| Ownership markers | The section registry that determines which sections exist (and their owners) is derived from the methodology manifest, which is selected by `config.yml`. | config.yml -> methodology manifest -> section registry -> markers | `scaffold run` (section fill) |
| ~~Section delimiters~~ | **Superseded** ([ADR-041](../adrs/ADR-041-meta-prompt-architecture.md)). | — | — |
| ~~Verb markers~~ | **Superseded** ([ADR-041](../adrs/ADR-041-meta-prompt-architecture.md)). | — | — |
| Tool-map.yml | Which tool-map.yml files are loaded depends on `config.yml`'s `platforms` selection. Codex platform loads `adapters/codex/tool-map.yml`; Universal loads `adapters/universal/tool-map.yml`. | config.yml -> platform selection -> adapter initialization | `scaffold build` (adapter stage) |

### 9.2 Interactions with state.json

| Format | Interaction | Direction | When |
|--------|-------------|-----------|------|
| Tracking comments | Dual completion detection reads tracking comments on `produces` targets to confirm scaffold provenance. A file with a valid tracking comment + matching slug is `confirmed_complete`. | state.json <- tracking comment | `scaffold run` (completion detection) |
| Tracking comments | v1 tracking comments detected during `scaffold adopt` populate `state.json` with pre-completed entries for matching v2 prompts. | state.json <- tracking comment (v1) | `scaffold adopt` |
| Ownership markers | `scaffold validate` cross-references ownership marker presence against state.json completion status. Completed prompt with unfilled section produces `CMD_SECTION_NOT_FILLED`. | state.json <-> ownership markers | `scaffold validate` |

### 9.3 Interactions with decisions.jsonl

| Format | Interaction | Direction | When |
|--------|-------------|-----------|------|
| Tracking comments | Decisions reference prompt slugs. The same slug namespace is used in tracking comments, decisions, and state.json. | Shared namespace | Always |

No other formats directly interact with decisions.jsonl.

### 9.4 Interactions with build outputs

| Format | Interaction | Direction | When |
|--------|-------------|-----------|------|
| ~~Verb markers~~ | **Superseded** ([ADR-041](../adrs/ADR-041-meta-prompt-architecture.md)). | — | — |
| ~~Section delimiters~~ | **Superseded** ([ADR-041](../adrs/ADR-041-meta-prompt-architecture.md)). | — | — |
| Tool-map.yml | Codex and Universal build outputs contain tool-mapped text. Claude Code build outputs are NOT tool-mapped (they use native tool names). | tool-map.yml -> modified text in Codex/Universal output | `scaffold build` (adapter stage) |
| Tracking comments | Build outputs for platform-specific prompts (e.g., `commands/*.md`) do NOT receive tracking comments. Tracking comments are written to *produced artifacts* (e.g., `docs/tech-stack.md`), which are created by agents during prompt execution, not by the build system. | No interaction with build outputs | N/A |

### 9.5 Interactions with CLAUDE.md

| Format | Interaction | Direction | When |
|--------|-------------|-----------|------|
| Tracking comments | CLAUDE.md has a tracking comment on line 1 (if scaffold-managed). The tracking comment records the last prompt that touched the file's structure (typically the tracking-setup prompt). | tracking comment -> line 1 of CLAUDE.md | `scaffold build` (section reservation) |
| Ownership markers | Ownership markers delimit scaffold-managed sections within CLAUDE.md's body. Multiple marker pairs exist (one per managed section). | markers -> CLAUDE.md body | `scaffold build` (reservation), prompt execution (fill) |
| ~~Verb markers~~ | **Superseded** ([ADR-041](../adrs/ADR-041-meta-prompt-architecture.md)). | — | — |
| ~~Section delimiters~~ | **Superseded** ([ADR-041](../adrs/ADR-041-meta-prompt-architecture.md)). | — | — |
| Tool-map.yml | Tool-map.yml does NOT affect CLAUDE.md. CLAUDE.md is written by the Claude Code adapter (no tool mapping) or the CLAUDE.md Manager (section fill during runtime, no adapter transformation). | No interaction | N/A |

### 9.6 Pipeline Processing Order

The active formats are processed at different stages. Understanding the processing order is critical for implementation:

```
config.yml
    |
    v
[Config Validation (domain 06)]
    |
    v
[Methodology & Depth Resolution (domain 16)]
    |
    v
[Assembly Engine (domain 15)]
    |  - Meta-prompt loaded, knowledge base gathered
    |  - 7-section assembled prompt constructed (ADR-045)
    v
[Platform Adapters (domain 05)]
    |  - Tool-map.yml loaded and applied (Codex, Universal only)
    |  - Ownership markers written to CLAUDE.md (section reservation)
    v
[Output Files Written]
    |
    v
[Runtime: Prompt Execution]
    |  - Tracking comments written to produced artifacts by CLI
    |  - Ownership marker content filled by CLAUDE.md Manager
    v
[Completion]
```

Key ordering constraints:
- Tool mapping is applied AFTER assembly is complete.
- Tracking comments are written at RUNTIME (step completion), not at build time.
- Ownership markers are created at BUILD time (reservation) and filled at RUNTIME (step execution).

(The original processing order included mixin injection Pass 1/Pass 2 and verb marker replacement, which are superseded by the meta-prompt architecture — [ADR-041](../adrs/ADR-041-meta-prompt-architecture.md).)
