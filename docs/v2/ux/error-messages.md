# Scaffold v2 — Error Message Catalog

**Phase**: 6 — UX Specification
**Depends on**: Phase 5 CLI contract (error conditions), Phase 4 data schemas (validation rules), Architecture Section 7 (error codes), [ADR-043](../adrs/ADR-043-depth-scale.md) (depth scale), [ADR-048](../adrs/ADR-048-update-mode-diff-over-regeneration.md) (update mode), [ADR-049](../adrs/ADR-049-methodology-changeable-mid-pipeline.md) (methodology changes)
**Last updated**: 2026-03-14
**Status**: draft

---

## Table of Contents

1. [Error Message Design Principles](#section-1-error-message-design-principles)
2. [Error Message Template Format](#section-2-error-message-template-format)
   - 2b. [Error Code Aliases](#section-2b-error-code-aliases)
3. [Error Catalog by Component](#section-3-error-catalog-by-component)
   - 3.1 [Init Wizard](#31-init-wizard)
   - 3.2 [Config Loader](#32-config-loader)
   - 3.3 [Field Validation](#33-field-validation)
   - 3.4 [Version Migration](#34-version-migration)
   - 3.5 [Prompt Resolver](#35-prompt-resolver)
   - 3.6 [Dependency Resolver](#36-dependency-resolver)
   - 3.7 [Assembly Engine](#37-assembly-engine)
   - 3.8 [State Manager](#38-state-manager)
   - 3.9 [Lock Manager](#39-lock-manager)
   - 3.10 [Platform Adapters](#310-platform-adapters)
   - 3.11 [Extra-Prompts Validation](#311-extra-prompts-validation)
   - 3.12 [Adopt / Project Detector](#312-adopt--project-detector)
   - 3.13 [Frontmatter Parser](#313-frontmatter-parser)
   - 3.14 [Validator](#314-validator)
   - 3.15 [Tracking Comments](#315-tracking-comments)
   - 3.16 [CLAUDE.md Ownership Markers](#316-claudemd-ownership-markers)
   - 3.17 [User Cancellation](#317-user-cancellation)
   - 3.18 [Methodology Preset Loader](#318-methodology-preset-loader)
   - 3.19 [Knowledge Base](#319-knowledge-base)
4. [Warning Message Patterns](#section-4-warning-message-patterns)
   - 4.1 [Incompatible Combination Warnings](#41-incompatible-combination-warnings)
   - 4.2 [Adopt Warnings](#42-adopt-warnings)
   - 4.3 [Other Advisory Warnings](#43-other-advisory-warnings)
5. [Fuzzy Match Suggestions](#section-5-fuzzy-match-suggestions)

---

## Section 1: Error Message Design Principles

Every error message in Scaffold v2 follows these principles:

1. **Lead with what went wrong**, not what the code did: "Config file not found" not "Failed to load config"
2. **Include the specific value that's wrong**: "Unknown methodology 'clasic'" not "Invalid methodology"
3. **Include the file and location**: "in .scaffold/config.yml (line 3)" when possible
4. **End with how to fix it**: "Valid options: deep, mvp, custom" or "Run 'scaffold init' to create one"
5. **Suggest fuzzy matches for typos**: "Did you mean 'deep'?" when Levenshtein distance ≤ 2
6. **Use consistent structure**: What happened → Where → How to fix
7. **Never blame the user**: "Unexpected value" not "You entered an invalid value"

### Icon and Color Convention

| Icon | Color | Meaning |
|------|-------|---------|
| `✗` | Red | Error — blocks operation |
| `⚠` | Yellow | Warning — advisory, does not block |
| `ℹ` | Blue | Info — stale lock cleanup, auto-recovery |

### Message Structure

All error messages follow a three-part structure:

```
<icon> <one-line summary>

  <contextual detail — file path, line number, offending value>

  <fix suggestion — command to run, valid options, or manual action>
```

Warnings use the same structure but with `⚠` icon and yellow color. Informational messages use `ℹ` and blue.

---

## Section 2: Error Message Template Format

Every error code in this catalog uses the following specification format:

```markdown
#### ERROR_CODE

**Severity**: Error | Warning | Info
**Exit code**: 0–5
**Component**: [producing component]
**Trigger**: [one-sentence condition]

**Template**:
  <icon> <summary with {variables}>
    <detail with {variables}>
    <fix suggestion>

**Variables**: {var1} — description, {var2} — description

**Example**:
  <rendered output with sample data>
```

**Variable placeholders** use `{curly braces}` in templates. In rendered examples, variables are replaced with realistic sample data.

---

## Section 2b: Error Code Aliases

The architecture error registry (system-architecture.md Section 7c) uses component-prefixed names (e.g., `CONFIG_*`) that map to the canonical error codes used in this catalog. This table provides the authoritative mapping between the two naming schemes.

| Architecture 7c Name | Canonical Error Code(s) | Notes |
|----------------------|------------------------|-------|
| `CONFIG_NOT_FOUND` | `CONFIG_MISSING` | Same semantics, different name |
| `CONFIG_INVALID_VERSION` | `FIELD_INVALID_VERSION` | Field-level validation |
| `CONFIG_INVALID_METHODOLOGY` | `FIELD_INVALID_METHODOLOGY` | Field-level validation |
| `CONFIG_INVALID_MIXIN` | *(removed)* | Mixin axes eliminated by ADR-041 |
| `CONFIG_INVALID_PLATFORM` | `FIELD_INVALID_PLATFORM` | Field-level validation |
| `CONFIG_MISSING_REQUIRED` | `FIELD_MISSING` | Generic required-field error |
| `CONFIG_EXTRA_PROMPT_NOT_FOUND` | `EXTRA_FILE_MISSING` | Extra-prompts validation |
| `CONFIG_EXTRA_PROMPT_INVALID` | `EXTRA_FRONTMATTER_MISSING`, `EXTRA_FRONTMATTER_PARSE_ERROR`, `EXTRA_FRONTMATTER_FIELD_MISSING`, `EXTRA_FRONTMATTER_FIELD_INVALID` | Splits into specific frontmatter errors |
| `CONFIG_EXTRA_SLUG_CONFLICT` | `EXTRA_SLUG_CONFLICT` | Same semantics |
| `CONFIG_MIGRATE_FAILED` | `MIGRATE_FAILED` | Version migration |
| `CONFIG_INVALID_TRAIT` | `CONFIG_INVALID_TRAIT` | No alias — canonical name matches architecture name |

---

## Section 3: Error Catalog by Component

### 3.1 Init Wizard

#### INIT_SCAFFOLD_EXISTS

**Severity**: Error
**Exit code**: 1
**Component**: Init Wizard (Domain 14)
**Trigger**: `.scaffold/config.yml` already exists and `--force` was not passed

**Template**:
```
✗ Scaffold is already configured in this project.

  Found: .scaffold/config.yml
  Methodology: {methodology}, {completed}/{total} prompts completed

  To reconfigure from scratch: scaffold init --force
  To resume the current pipeline: scaffold run
```

**Variables**: `{methodology}` — current methodology name, `{completed}` — number of completed prompts, `{total}` — total prompt count

**Example**:
```
✗ Scaffold is already configured in this project.

  Found: .scaffold/config.yml
  Methodology: deep, 8/32 steps completed

  To reconfigure from scratch: scaffold init --force
  To resume the current pipeline: scaffold run
```

---

### 3.2 Config Loader

#### CONFIG_MISSING

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader (Domain 06)
**Trigger**: `.scaffold/config.yml` does not exist

**Template**:
```
✗ Config file not found at .scaffold/config.yml

  Run 'scaffold init' to create one.
```

**Variables**: none

**Example**:
```
✗ Config file not found at .scaffold/config.yml

  Run 'scaffold init' to create one.
```

#### CONFIG_EMPTY

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader (Domain 06)
**Trigger**: Config file exists but is empty or whitespace-only

**Template**:
```
✗ Config file .scaffold/config.yml is empty.

  Run 'scaffold init' to regenerate, or add config content manually.
```

**Variables**: none

**Example**:
```
✗ Config file .scaffold/config.yml is empty.

  Run 'scaffold init' to regenerate, or add config content manually.
```

#### CONFIG_PARSE_ERROR

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader (Domain 06)
**Trigger**: YAML syntax error in config file

**Template**:
```
✗ Invalid YAML syntax in .scaffold/config.yml at line {line}

  {parseError}

  Fix the YAML syntax error, or run 'scaffold init --force' to regenerate.
```

**Variables**: `{line}` — line number of syntax error, `{parseError}` — parser error message

**Example**:
```
✗ Invalid YAML syntax in .scaffold/config.yml at line 7

  unexpected end of the stream within a flow collection (7:1)

  Fix the YAML syntax error, or run 'scaffold init --force' to regenerate.
```

#### CONFIG_NOT_OBJECT

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader (Domain 06)
**Trigger**: Parsed YAML is a scalar, array, or null rather than a mapping

**Template**:
```
✗ Config file .scaffold/config.yml must be a YAML mapping (key: value), not a {actualType}.

  The config file should start with 'version: 1' followed by key-value pairs.
  Run 'scaffold init --force' to regenerate.
```

**Variables**: `{actualType}` — detected YAML type (array, string, number, null)

**Example**:
```
✗ Config file .scaffold/config.yml must be a YAML mapping (key: value), not an array.

  The config file should start with 'version: 1' followed by key-value pairs.
  Run 'scaffold init --force' to regenerate.
```

#### CONFIG_UNKNOWN_FIELD

**Severity**: Warning
**Exit code**: 0
**Component**: Config Loader (Domain 06)
**Trigger**: Unrecognized top-level key in config

**Template**:
```
⚠ Unknown field '{field}' in .scaffold/config.yml

  {suggestion}
  Known fields: version, methodology, depth, platforms, project, instructions, extra-prompts
```

**Variables**: `{field}` — unrecognized field name, `{suggestion}` — fuzzy match suggestion or empty string

**Example**:
```
⚠ Unknown field 'methology' in .scaffold/config.yml

  Did you mean 'methodology'?
  Known fields: version, methodology, depth, platforms, project, instructions, extra-prompts
```

#### CONFIG_INVALID_TRAIT

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader (Domain 06)
**Trigger**: `project` contains an unrecognized trait name that is not in the known trait registry

**Template**:
```
✗ Unknown project trait '{trait}' in .scaffold/config.yml

  {suggestion}
  Known traits: platforms, multi-model-cli
```

**Variables**: `{trait}` — unrecognized trait name, `{suggestion}` — fuzzy match suggestion or empty string

**Example**:
```
✗ Unknown project trait 'multi-model' in .scaffold/config.yml

  Did you mean 'multi-model-cli'?
  Known traits: platforms, multi-model-cli
```

---

### 3.3 Field Validation

#### FIELD_MISSING

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader (Domain 06)
**Trigger**: Required field absent from config

**Template**:
```
✗ Required field '{field}' is missing from .scaffold/config.yml

  Add '{field}' to your config. Run 'scaffold init --force' to regenerate.
```

**Variables**: `{field}` — missing field name (version, methodology, mixins, or platforms)

**Example**:
```
✗ Required field 'methodology' is missing from .scaffold/config.yml

  Add 'methodology' to your config. Run 'scaffold init --force' to regenerate.
```

#### FIELD_WRONG_TYPE

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader (Domain 06)
**Trigger**: Field has wrong YAML type

**Template**:
```
✗ Field '{field}' must be a {expectedType}, got {actualType} in .scaffold/config.yml

  Line {line}: {field}: {rawValue}
```

**Variables**: `{field}` — field name, `{expectedType}` — expected type, `{actualType}` — actual type, `{line}` — line number, `{rawValue}` — raw value as written

**Example**:
```
✗ Field 'platforms' must be an array, got string in .scaffold/config.yml

  Line 9: platforms: claude-code
```

#### FIELD_EMPTY_VALUE

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader (Domain 06)
**Trigger**: Required field is empty string, null, or empty array

**Template**:
```
✗ Field '{field}' must not be empty in .scaffold/config.yml

  {detail}
```

**Variables**: `{field}` — field name, `{detail}` — contextual note (e.g., "platforms must have at least one entry")

**Example**:
```
✗ Field 'platforms' must not be empty in .scaffold/config.yml

  At least one platform must be specified. Valid options: claude-code, codex
```

#### FIELD_MISSING_MIXIN_AXIS (REMOVED)

> **Removed**: Mixin axes have been eliminated from the architecture. See ADR-041.

#### FIELD_INVALID_METHODOLOGY

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader (Domain 06)
**Trigger**: Methodology value does not match any installed methodology directory

**Template**:
```
✗ Unknown methodology '{value}' in .scaffold/config.yml

  {suggestion}
  Valid options: {validOptions}
  Run 'scaffold list' to see all available methodologies.
```

**Variables**: `{value}` — provided value, `{suggestion}` — fuzzy match or empty, `{validOptions}` — comma-separated valid values

**Example**:
```
✗ Unknown methodology 'deap' in .scaffold/config.yml

  Did you mean 'deep'?
  Valid options: deep, mvp, custom
  Run 'scaffold list' to see all available methodologies.
```

> **Cross-reference**: See also `RESOLUTION_METHODOLOGY_NOT_FOUND` in [Section 3.5](#35-prompt-resolver). `FIELD_INVALID_METHODOLOGY` fires during config field validation (build pipeline stage 1), while `RESOLUTION_METHODOLOGY_NOT_FOUND` fires during prompt resolution when the methodology directory itself is missing (build pipeline stage 2).

#### FIELD_INVALID_MIXIN_AXIS (REMOVED)

> **Removed**: Mixin axes have been eliminated from the architecture. See ADR-041.

#### FIELD_INVALID_MIXIN_VALUE (REMOVED)

> **Removed**: Mixin axes have been eliminated from the architecture. See ADR-041.

#### FIELD_INVALID_PLATFORM

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader (Domain 06)
**Trigger**: platforms entry does not match any registered adapter

**Template**:
```
✗ Unknown platform '{value}' in .scaffold/config.yml

  {suggestion}
  Valid options: {validOptions}
```

**Variables**: `{value}` — unrecognized platform, `{suggestion}` — fuzzy match or empty, `{validOptions}` — comma-separated valid platforms

**Example**:
```
✗ Unknown platform 'claude' in .scaffold/config.yml

  Did you mean 'claude-code'?
  Valid options: claude-code, codex
```

#### FIELD_INVALID_PROJECT_PLATFORM

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader (Domain 06)
**Trigger**: project.platforms entry is not web, mobile, or desktop

**Template**:
```
✗ Unknown project platform '{value}' in .scaffold/config.yml

  {suggestion}
  Valid options: web, mobile, desktop
```

**Variables**: `{value}` — unrecognized project platform, `{suggestion}` — fuzzy match suggestion or empty string

**Example**:
```
✗ Unknown project platform 'ios' in .scaffold/config.yml

  Valid options: web, mobile, desktop
```

#### FIELD_INVALID_VERSION

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader (Domain 06)
**Trigger**: Version field is not a positive integer

**Template**:
```
✗ Config version must be a positive integer, got '{value}' in .scaffold/config.yml

  Set 'version: 1' for the current schema version.
```

**Variables**: `{value}` — raw version value

**Example**:
```
✗ Config version must be a positive integer, got '1.0' in .scaffold/config.yml

  Set 'version: 1' for the current schema version.
```

#### FIELD_DUPLICATE_PLATFORM

**Severity**: Warning
**Exit code**: 0
**Component**: Config Loader (Domain 06)
**Trigger**: Same platform listed more than once

**Template**:
```
⚠ Duplicate platform '{value}' in .scaffold/config.yml

  Duplicates are ignored. Remove the extra entry.
```

**Variables**: `{value}` — duplicated platform name

**Example**:
```
⚠ Duplicate platform 'claude-code' in .scaffold/config.yml

  Duplicates are ignored. Remove the extra entry.
```

#### FIELD_DUPLICATE_EXTRA_PROMPT

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader (Domain 06)
**Trigger**: Same slug listed more than once in extra-prompts

**Template**:
```
✗ Duplicate extra-prompt '{value}' in .scaffold/config.yml

  Remove the duplicate entry from extra-prompts.
```

**Variables**: `{value}` — duplicated slug

**Example**:
```
✗ Duplicate extra-prompt 'security-audit' in .scaffold/config.yml

  Remove the duplicate entry from extra-prompts.
```

---

### 3.4 Version Migration

#### MIGRATE_VERSION_TOO_NEW

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader (Domain 06)
**Trigger**: Config version is newer than what the CLI supports

**Template**:
```
✗ Config version {version} is newer than this CLI supports (max: {currentVersion}).

  Update scaffold to the latest version:
    npm update -g @scaffold-cli/scaffold
```

**Variables**: `{version}` — config version number, `{currentVersion}` — CLI's maximum supported version

**Example**:
```
✗ Config version 3 is newer than this CLI supports (max: 1).

  Update scaffold to the latest version:
    npm update -g @scaffold-cli/scaffold
```

#### MIGRATE_VERSION_MISSING

**Severity**: Warning
**Exit code**: 0
**Component**: Config Loader (Domain 06)
**Trigger**: No version field in config (auto-recoverable: assumes version 0)

**Template**:
```
⚠ Config is missing the 'version' field in .scaffold/config.yml

  Assuming pre-v1 format. Attempting migration...
```

**Variables**: none

**Example**:
```
⚠ Config is missing the 'version' field in .scaffold/config.yml

  Assuming pre-v1 format. Attempting migration...
```

#### MIGRATE_FAILED

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader (Domain 06)
**Trigger**: Migration function throws or produces invalid output

**Template**:
```
✗ Failed to migrate config from version {from} to {to}.

  {error}

  Manually update your config to match the current schema.
  See: https://scaffold-cli.dev/docs/config-migration
```

**Variables**: `{from}` — source version, `{to}` — target version, `{error}` — migration error message

**Example**:
```
✗ Failed to migrate config from version 0 to 1.

  Cannot determine methodology from pre-v1 config: no prompts.md found

  Manually update your config to match the current schema.
  See: https://scaffold-cli.dev/docs/config-migration
```

---

### 3.5 Prompt Resolver

> **Note:** Domain 01 (prompt resolution) was superseded by ADR-041 (meta-prompt architecture). The resolution codes below apply to the meta-prompt loader (domain 15) which replaces the original prompt resolver. Component references to "Prompt Resolver (Domain 01)" should be read as "Meta-Prompt Loader (Domain 15)."

#### RESOLUTION_FILE_MISSING

**Severity**: Error
**Exit code**: 1
**Component**: Prompt Resolver (Domain 01)
**Trigger**: Prompt reference in manifest points to a non-existent file

**Template**:
```
✗ Prompt file not found: {path}

  Referenced by methodology manifest: {manifest}
  Prompt slug: {slug}

  Verify the file exists or remove the reference from the manifest.
```

**Variables**: `{path}` — expected file path, `{manifest}` — manifest file path, `{slug}` — prompt slug

**Example**:
```
✗ Prompt file not found: content/base/create-prd.md

  Referenced by pipeline manifest: pipeline/manifest.yml
  Prompt slug: create-prd

  Verify the file exists or remove the reference from the manifest.
```

#### RESOLUTION_EXTRA_PROMPT_MISSING

**Severity**: Error
**Exit code**: 1
**Component**: Prompt Resolver (Domain 01)
**Trigger**: Extra-prompt entry cannot be found at any resolution path during prompt resolution

**Template**:
```
✗ Extra prompt '{slug}' not found during prompt resolution.

  Searched:
    .scaffold/prompts/{slug}.md
    ~/.scaffold/prompts/{slug}.md

  Create the file at one of these paths, or remove '{slug}' from extra-prompts in config.
```

**Variables**: `{slug}` — extra-prompt slug

**Example**:
```
✗ Extra prompt 'security-audit' not found during prompt resolution.

  Searched:
    .scaffold/prompts/security-audit.md
    ~/.scaffold/prompts/security-audit.md

  Create the file at one of these paths, or remove 'security-audit' from extra-prompts in config.
```

> **Cross-reference**: See also `EXTRA_FILE_MISSING` in [Section 3.11](#311-extra-prompts-validation), which fires during config validation. `RESOLUTION_EXTRA_PROMPT_MISSING` fires during prompt resolution (build pipeline stage 2), while `EXTRA_FILE_MISSING` fires during config validation (build pipeline stage 1).

#### RESOLUTION_DUPLICATE_SLUG

**Severity**: Error
**Exit code**: 1
**Component**: Prompt Resolver (Domain 01)
**Trigger**: Two prompts resolve to the same slug

**Template**:
```
✗ Duplicate prompt slug '{slug}'.

  Source 1: {path1}
  Source 2: {path2}

  Rename one of the files to use a unique slug.
```

**Variables**: `{slug}` — conflicting slug, `{path1}` — first file path, `{path2}` — second file path

**Example**:
```
✗ Duplicate prompt slug 'tech-stack'.

  Source 1: content/base/tech-stack.md
  Source 2: .scaffold/prompts/tech-stack.md

  Rename one of the files to use a unique slug.
```

#### RESOLUTION_MANIFEST_INVALID

**Severity**: Error
**Exit code**: 1
**Component**: Prompt Resolver (Domain 01)
**Trigger**: Methodology manifest cannot be parsed or is structurally invalid

**Template**:
```
✗ Invalid methodology manifest: {manifest}

  {parseError}

  Fix the manifest YAML or choose a different methodology.
```

**Variables**: `{manifest}` — manifest file path, `{parseError}` — parser/validation error

**Example**:
```
✗ Invalid methodology manifest: pipeline/manifest.yml

  Missing required field 'phases' in manifest

  Fix the manifest YAML or choose a different methodology.
```

#### RESOLUTION_METHODOLOGY_NOT_FOUND

**Severity**: Error
**Exit code**: 1
**Component**: Prompt Resolver (Domain 01)
**Trigger**: Methodology directory does not exist

**Template**:
```
✗ Methodology directory not found: content/methodologies/{methodology}/

  {suggestion}
  Available methodologies: {available}
```

**Variables**: `{methodology}` — requested methodology, `{suggestion}` — fuzzy match or empty, `{available}` — comma-separated available methodologies

**Example**:
```
✗ Methodology directory not found: content/methodologies/deap/

  Did you mean 'deep'?
  Available methodologies: deep, mvp, custom
```

> **Cross-reference**: See also `FIELD_INVALID_METHODOLOGY` in [Section 3.3](#33-field-validation), which fires during config validation. `RESOLUTION_METHODOLOGY_NOT_FOUND` fires during prompt resolution when the methodology directory itself is missing, while `FIELD_INVALID_METHODOLOGY` fires during config field validation when the value does not match any installed methodology.

#### RESOLUTION_FRONTMATTER_PARSE_ERROR

**Severity**: Error
**Exit code**: 1
**Component**: Prompt Resolver (Domain 01)
**Trigger**: Prompt file's YAML frontmatter cannot be parsed

**Template**:
```
✗ Invalid frontmatter in {path}

  {parseError}

  Fix the YAML frontmatter between the --- delimiters.
```

**Variables**: `{path}` — prompt file path, `{parseError}` — parser error

**Example**:
```
✗ Invalid frontmatter in content/base/tech-stack.md

  Unexpected mapping at line 3, column 5

  Fix the YAML frontmatter between the --- delimiters.
```

#### RESOLUTION_EXTRA_PROMPT_INVALID_FRONTMATTER

**Severity**: Error
**Exit code**: 1
**Component**: Prompt Resolver (Domain 01)
**Trigger**: Extra-prompt file exists but has malformed frontmatter

**Template**:
```
✗ Extra prompt '{slug}' has invalid frontmatter in {path}

  {parseError}

  Fix the YAML frontmatter. At minimum, include a 'description' field.
```

**Variables**: `{slug}` — prompt slug, `{path}` — file path, `{parseError}` — specific error

**Example**:
```
✗ Extra prompt 'security-audit' has invalid frontmatter in .scaffold/prompts/security-audit.md

  Missing required field 'description'

  Fix the YAML frontmatter. At minimum, include a 'description' field.
```

#### RESOLUTION_CUSTOM_OVERRIDE_ACTIVE

**Severity**: Warning
**Exit code**: 0
**Component**: Prompt Resolver (Domain 01)
**Trigger**: A customization file in `.scaffold/prompts/` or `~/.scaffold/prompts/` overrides a built-in prompt

**Template**:
```
⚠ Custom override active for prompt '{slug}'.

  Override file: {path}
  Built-in file: {builtinPath}

  The override replaces the built-in prompt entirely.
```

**Variables**: `{slug}` — prompt slug, `{path}` — override file path, `{builtinPath}` — built-in file path

**Example**:
```
⚠ Custom override active for prompt 'tech-stack'.

  Override file: .scaffold/prompts/tech-stack.md
  Built-in file: content/base/tech-stack.md

  The override replaces the built-in prompt entirely.
```

#### RESOLUTION_UNKNOWN_TRAIT

**Severity**: Warning
**Exit code**: 0
**Component**: Prompt Resolver (Domain 01)
**Trigger**: An optional prompt's `requires` field references a trait not present in the project's trait set

**Template**:
```
⚠ Optional prompt '{slug}' requires unknown trait '{trait}'.

  The trait '{trait}' is not in the project's configuration.
  The prompt will be excluded from the pipeline.
```

**Variables**: `{slug}` — prompt slug, `{trait}` — unrecognized trait name

**Example**:
```
⚠ Optional prompt 'mobile-config' requires unknown trait 'ios'.

  The trait 'ios' is not in the project's configuration.
  The prompt will be excluded from the pipeline.
```

---

### 3.6 Dependency Resolver

#### DEP_CYCLE_DETECTED

**Severity**: Error
**Exit code**: 1
**Component**: Dependency Resolver (Domain 02)
**Trigger**: Circular dependency in prompt graph — Kahn's algorithm cannot complete

**Template**:
```
✗ Circular dependency detected in prompt pipeline.

  Cycle: {cycle}

  Break the cycle by removing a dependency from one of these prompts.
  Check 'depends-on' in prompt frontmatter and methodology manifest.
```

**Variables**: `{cycle}` — cycle path as "A → B → C → A"

**Example**:
```
✗ Circular dependency detected in prompt pipeline.

  Cycle: coding-standards → tdd → coding-standards

  Break the cycle by removing a dependency from one of these prompts.
  Check 'depends-on' in prompt frontmatter and methodology manifest.
```

#### DEP_TARGET_MISSING

**Severity**: Error
**Exit code**: 2
**Component**: Dependency Resolver (Domain 02)
**Trigger**: depends-on references a slug not in the resolved prompt set

**Template**:
```
✗ Dependency target '{target}' not found in resolved prompt set.

  Referenced by: {source}
  {suggestion}

  Remove the dependency or add the missing prompt.
```

**Variables**: `{target}` — missing dependency slug, `{source}` — referencing prompt slug, `{suggestion}` — fuzzy match or empty

**Example**:
```
✗ Dependency target 'tech-stacks' not found in resolved prompt set.

  Referenced by: coding-standards
  Did you mean 'tech-stack'?

  Remove the dependency or add the missing prompt.
```

#### DEP_SELF_REFERENCE

**Severity**: Error
**Exit code**: 1
**Component**: Dependency Resolver (Domain 02)
**Trigger**: Prompt declares a dependency on itself

**Template**:
```
✗ Prompt '{slug}' depends on itself.

  Remove the self-reference from 'depends-on' in {path}
```

**Variables**: `{slug}` — self-referencing prompt, `{path}` — frontmatter location

**Example**:
```
✗ Prompt 'tech-stack' depends on itself.

  Remove the self-reference from 'depends-on' in content/base/tech-stack.md
```

#### DEPENDENCY_MISSING_ARTIFACT

**Severity**: Error
**Exit code**: 2
**Component**: Dependency Resolver (Domain 02)
**Trigger**: Predecessor prompt's produces artifact not found on disk during runtime

**Template**:
```
✗ Missing prerequisite artifact: {artifact}

  Required by: {prompt}
  Produced by: {predecessor} (status: {status})

  Run 'scaffold run --from {predecessor}' to generate the missing artifact.
```

**Variables**: `{artifact}` — missing file path, `{prompt}` — current prompt, `{predecessor}` — producing prompt, `{status}` — predecessor status

**Example**:
```
✗ Missing prerequisite artifact: docs/tech-stack.md

  Required by: coding-standards
  Produced by: tech-stack (status: pending)

  Run 'scaffold run --from tech-stack' to generate the missing artifact.
```

#### DEPENDENCY_UNMET

**Severity**: Error
**Exit code**: 2
**Component**: Dependency Resolver (Domain 02)
**Trigger**: Prompt depends on a prompt that has not been completed or skipped

**Template**:
```
✗ Prerequisite not met for '{prompt}'.

  Requires '{dependency}' to be completed or skipped first.
  '{dependency}' is currently: {status}

  Run 'scaffold run --from {dependency}' first, or 'scaffold skip {dependency}'.
```

**Variables**: `{prompt}` — blocked prompt, `{dependency}` — unmet dependency, `{status}` — dependency status

**Example**:
```
✗ Prerequisite not met for 'coding-standards'.

  Requires 'tech-stack' to be completed or skipped first.
  'tech-stack' is currently: pending

  Run 'scaffold run --from tech-stack' first, or 'scaffold skip tech-stack'.
```

#### DEP_ON_EXCLUDED

**Severity**: Warning
**Exit code**: 0
**Component**: Dependency Resolver (Domain 02)
**Trigger**: Prompt depends on a prompt that was excluded from the resolved pipeline (e.g., by trait filtering)

**Template**:
```
⚠ Prompt '{prompt}' depends on excluded prompt '{dependency}'.

  '{dependency}' was excluded from the pipeline (filtered by traits or configuration).
  The dependency is ignored — '{prompt}' will not be blocked.
```

**Variables**: `{prompt}` — dependent prompt slug, `{dependency}` — excluded dependency slug

**Example**:
```
⚠ Prompt 'mobile-testing' depends on excluded prompt 'mobile-config'.

  'mobile-config' was excluded from the pipeline (filtered by traits or configuration).
  The dependency is ignored — 'mobile-testing' will not be blocked.
```

#### DEP_RERUN_STALE_DOWNSTREAM

**Severity**: Warning
**Exit code**: 0
**Component**: Dependency Resolver (Domain 02)
**Trigger**: Re-running a prompt may leave downstream artifacts stale

**Template**:
```
⚠ Re-running '{prompt}' may leave downstream artifacts stale.

  Dependent prompts that have already completed:
    {dependents}

  Consider re-running these prompts after '{prompt}' completes.
```

**Variables**: `{prompt}` — re-run prompt slug, `{dependents}` — newline-separated list of dependent prompt slugs

**Example**:
```
⚠ Re-running 'tech-stack' may leave downstream artifacts stale.

  Dependent prompts that have already completed:
    coding-standards
    dev-env-setup

  Consider re-running these prompts after 'tech-stack' completes.
```

#### DEP_PHASE_CONFLICT

**Severity**: Warning
**Exit code**: 0
**Component**: Dependency Resolver (Domain 02)
**Trigger**: Dependency-derived topological position is earlier than the prompt's declared phase

**Template**:
```
⚠ Phase conflict for prompt '{prompt}'.

  Declared phase: {declaredPhase}
  Dependency-derived position: {derivedPhase} (due to dependency on '{dependency}')

  The prompt will execute at the dependency-derived position.
```

**Variables**: `{prompt}` — prompt slug, `{declaredPhase}` — phase declared in frontmatter, `{derivedPhase}` — phase derived from dependencies, `{dependency}` — dependency causing the conflict

**Example**:
```
⚠ Phase conflict for prompt 'api-design'.

  Declared phase: 2
  Dependency-derived position: 3 (due to dependency on 'tech-stack')

  The prompt will execute at the dependency-derived position.
```

---

### 3.7 Assembly Engine

> **Note**: This section replaces the former Mixin Injector section (3.7). All `INJ_*` error codes from the mixin injection system have been retired. The meta-prompt architecture (ADR-041) eliminates mixin injection. The following errors cover the assembly engine that replaced it.

#### ASM_META_PROMPT_NOT_FOUND

**Severity**: Error
**Exit code**: 5
**Component**: Assembly Engine
**Trigger**: Meta-prompt file referenced by pipeline step does not exist

**Template**:
```
✗ Meta-prompt not found: pipeline/{group}/{step}.md

  Step '{step}' is defined in the pipeline but its meta-prompt file is missing.

  Verify the scaffold installation or run 'scaffold update' to repair.
```

**Variables**: `{step}` — step slug, `{group}` — pipeline group directory

**Example**:
```
✗ Meta-prompt not found: pipeline/architecture/system-architecture.md

  Step 'system-architecture' is defined in the pipeline but its meta-prompt file is missing.

  Verify the scaffold installation or run 'scaffold update' to repair.
```

#### ASM_KNOWLEDGE_BASE_NOT_FOUND

**Severity**: Error
**Exit code**: 5
**Component**: Assembly Engine
**Trigger**: Knowledge base entry referenced by meta-prompt does not exist

**Template**:
```
✗ Knowledge base entry not found: knowledge/{entry}.md

  Referenced by meta-prompt: pipeline/{group}/{step}.md
  Field: knowledge-base

  Verify the scaffold installation or run 'scaffold update' to repair.
```

**Variables**: `{entry}` — knowledge base entry name, `{step}` — step slug, `{group}` — pipeline group directory

**Example**:
```
✗ Knowledge base entry not found: knowledge/system-architecture.md

  Referenced by meta-prompt: pipeline/architecture/system-architecture.md
  Field: knowledge-base

  Verify the scaffold installation or run 'scaffold update' to repair.
```

#### ASM_ASSEMBLY_FAILED

**Severity**: Error
**Exit code**: 5
**Component**: Assembly Engine
**Trigger**: Prompt assembly failed due to internal error

**Template**:
```
✗ Failed to assemble prompt for step '{step}'.

  {detail}

  Check the meta-prompt and knowledge base files for this step.
  Run 'scaffold info {step}' to inspect the step configuration.
```

**Variables**: `{step}` — step slug, `{detail}` — error detail

**Example**:
```
✗ Failed to assemble prompt for step 'domain-modeling'.

  Meta-prompt frontmatter is missing required field 'knowledge-base'

  Check the meta-prompt and knowledge base files for this step.
  Run 'scaffold info domain-modeling' to inspect the step configuration.
```

#### ASM_INVALID_DEPTH

**Severity**: Error
**Exit code**: 1
**Component**: Assembly Engine
**Trigger**: Depth level for a step is outside valid range (1-5)

**Template**:
```
✗ Invalid depth level {depth} for step '{step}'.

  Depth must be between 1 and 5.
  Check .scaffold/config.yml depth configuration.
```

**Variables**: `{depth}` — invalid depth value, `{step}` — step slug

**Example**:
```
✗ Invalid depth level 7 for step 'create-prd'.

  Depth must be between 1 and 5.
  Check .scaffold/config.yml depth configuration.
```

#### ASM_DEPTH_CHANGED

**Severity**: Warning
**Exit code**: 0
**Component**: Assembly Engine
**Trigger**: Step is being executed at a different depth than the configured methodology default (per [ADR-043](../adrs/ADR-043-depth-scale.md))

**Template**:
```
⚠ Step '{step}' will execute at depth {actualDepth} (methodology default: {defaultDepth}).

  Depth was overridden by per-step configuration.
```

**Variables**: `{step}` — step slug, `{actualDepth}` — depth level being used, `{defaultDepth}` — methodology default depth

**Example**:
```
⚠ Step 'create-prd' will execute at depth 3 (methodology default: 5).

  Depth was overridden by per-step configuration.
```

#### ASM_DEPTH_DOWNGRADE

**Severity**: Warning
**Exit code**: 0
**Component**: Assembly Engine
**Trigger**: Re-running a step at a lower depth than the original execution (per [ADR-048](../adrs/ADR-048-update-mode-diff-over-regeneration.md))

**Template**:
```
⚠ Step '{step}' was previously completed at depth {originalDepth}.
  Re-running at depth {newDepth} (lower) — some detail may be lost.

  The update will modify the existing artifact with diff-based changes.
```

**Variables**: `{step}` — step slug, `{originalDepth}` — depth at first completion, `{newDepth}` — current depth

**Example**:
```
⚠ Step 'tech-stack' was previously completed at depth 5.
  Re-running at depth 3 (lower) — some detail may be lost.

  The update will modify the existing artifact with diff-based changes.
```

#### ASM_COMPLETED_AT_LOWER_DEPTH

**Severity**: Warning
**Exit code**: 0
**Component**: Assembly Engine
**Trigger**: A completed step's recorded depth is lower than the current methodology depth (per [ADR-049](../adrs/ADR-049-methodology-changeable-mid-pipeline.md))

**Template**:
```
⚠ Step '{step}' was completed at depth {completedDepth}, current methodology depth is {currentDepth}.

  The step's artifacts may be less detailed than expected at the current depth.
  Consider re-running: scaffold run {step}
```

**Variables**: `{step}` — step slug, `{completedDepth}` — depth at completion, `{currentDepth}` — current methodology depth

**Example**:
```
⚠ Step 'create-prd' was completed at depth 1, current methodology depth is 5.

  The step's artifacts may be less detailed than expected at the current depth.
  Consider re-running: scaffold run create-prd
```

#### ASM_METHODOLOGY_CHANGED

**Severity**: Warning
**Exit code**: 0
**Component**: Assembly Engine
**Trigger**: Methodology has changed since the last step was executed (per [ADR-049](../adrs/ADR-049-methodology-changeable-mid-pipeline.md))

**Template**:
```
⚠ Methodology changed: {previousMethodology} → {currentMethodology}

  {completedCount} completed step(s) were executed under '{previousMethodology}'.
  These steps are preserved as-is. Pending steps will be resolved under '{currentMethodology}'.
  {orphanedCount} step(s) are now orphaned (no longer in the pipeline).
```

**Variables**: `{previousMethodology}` — previous methodology, `{currentMethodology}` — current methodology, `{completedCount}` — number of completed steps under old methodology, `{orphanedCount}` — number of orphaned steps

**Example**:
```
⚠ Methodology changed: deep → mvp

  8 completed step(s) were executed under 'deep'.
  These steps are preserved as-is. Pending steps will be resolved under 'mvp'.
  3 step(s) are now orphaned (no longer in the pipeline).
```

#### ASM_INSTRUCTION_EMPTY

**Severity**: Warning
**Exit code**: 0
**Component**: Assembly Engine
**Trigger**: User instruction file exists but is empty or whitespace-only (per [ADR-047](../adrs/ADR-047-user-instruction-three-layer-precedence.md))

**Template**:
```
⚠ User instruction file is empty: {path}

  The file exists but contains no content. It will be skipped during assembly.
  Add instructions or remove the empty file.
```

**Variables**: `{path}` — instruction file path

**Example**:
```
⚠ User instruction file is empty: .scaffold/instructions/global.md

  The file exists but contains no content. It will be skipped during assembly.
  Add instructions or remove the empty file.
```

---

### 3.8 State Manager

#### STATE_PARSE_ERROR

**Severity**: Error
**Exit code**: 3
**Component**: State Manager (Domain 03)
**Trigger**: state.json contains invalid JSON

**Template**:
```
✗ Cannot parse .scaffold/state.json

  {parseError}

  If the file is corrupted, run 'scaffold reset' to reinitialize pipeline state.
  Your config (.scaffold/config.yml) will be preserved.
```

**Variables**: `{parseError}` — JSON parser error

**Example**:
```
✗ Cannot parse .scaffold/state.json

  Unexpected token '}' at position 342

  If the file is corrupted, run 'scaffold reset' to reinitialize pipeline state.
  Your config (.scaffold/config.yml) will be preserved.
```

#### STATE_VERSION_MISMATCH

**Severity**: Error
**Exit code**: 3
**Component**: State Manager (Domain 03)
**Trigger**: state.json schema version does not match CLI expectation

**Template**:
```
✗ State file version mismatch in .scaffold/state.json

  File version: {fileVersion}, expected: {expectedVersion}

  Run 'scaffold reset' to reinitialize with the current schema.
```

**Variables**: `{fileVersion}` — version in file, `{expectedVersion}` — CLI expected version

**Example**:
```
✗ State file version mismatch in .scaffold/state.json

  File version: 2, expected: 1

  Run 'scaffold reset' to reinitialize with the current schema.
```

#### STATE_CORRUPTED

**Severity**: Error
**Exit code**: 3
**Component**: State Manager (Domain 03)
**Trigger**: state.json is internally inconsistent

**Template**:
```
✗ State file is corrupted: .scaffold/state.json

  {detail}

  Run 'scaffold reset' to reinitialize pipeline state.
  Your config and produced artifacts will be preserved.
```

**Variables**: `{detail}` — specific corruption description

**Example**:
```
✗ State file is corrupted: .scaffold/state.json

  Prompt 'tech-stack' has unknown status 'done' (valid: pending, in_progress, completed, skipped)

  Run 'scaffold reset' to reinitialize pipeline state.
  Your config and produced artifacts will be preserved.
```

#### STATE_ARTIFACT_MISMATCH

**Severity**: Error
**Exit code**: 3
**Component**: State Manager (Domain 03)
**Trigger**: Prompt marked completed but required artifact is missing

**Template**:
```
✗ Artifact mismatch for prompt '{prompt}' in .scaffold/state.json

  Status: completed, but artifact missing: {artifact}

  Re-run the prompt: scaffold run --from {prompt}
```

**Variables**: `{prompt}` — prompt slug, `{artifact}` — missing artifact path

**Example**:
```
✗ Artifact mismatch for prompt 'tech-stack' in .scaffold/state.json

  Status: completed, but artifact missing: docs/tech-stack.md

  Re-run the prompt: scaffold run --from tech-stack
```

#### PSM_INVALID_TRANSITION

**Severity**: Error
**Exit code**: 3
**Component**: State Manager (Domain 03)
**Trigger**: Attempted state transition violates the state machine rules

**Template**:
```
✗ Invalid state transition for prompt '{prompt}'.

  Current status: {from}, attempted: {to}
  Valid transitions from '{from}': {validTransitions}
```

**Variables**: `{prompt}` — prompt slug, `{from}` — current status, `{to}` — attempted status, `{validTransitions}` — comma-separated valid next states

**Example**:
```
✗ Invalid state transition for prompt 'create-prd'.

  Current status: completed, attempted: pending
  Valid transitions from 'completed': in_progress (via --from re-run)
```

#### PSM_ALREADY_IN_PROGRESS

**Severity**: Error
**Exit code**: 3
**Component**: State Manager (Domain 03)
**Trigger**: Cannot start prompt because another prompt is already in_progress

**Template**:
```
✗ Cannot start '{prompt}' — another prompt is already in progress.

  In progress: '{inProgress}' (started: {startedAt})

  Complete or re-run the in-progress prompt first:
    scaffold run --from {inProgress}
```

**Variables**: `{prompt}` — requested prompt, `{inProgress}` — currently running prompt, `{startedAt}` — ISO timestamp

**Example**:
```
✗ Cannot start 'coding-standards' — another prompt is already in progress.

  In progress: 'tech-stack' (started: 2026-03-13T14:30:00Z)

  Complete or re-run the in-progress prompt first:
    scaffold run --from tech-stack
```

#### PSM_WRITE_FAILED

**Severity**: Error
**Exit code**: 3
**Component**: State Manager (Domain 03)
**Trigger**: Failed to write state.json (disk full, permissions)

**Template**:
```
✗ Failed to write .scaffold/state.json

  {ioError}

  Check disk space and file permissions for .scaffold/
```

**Variables**: `{ioError}` — system error message

**Example**:
```
✗ Failed to write .scaffold/state.json

  ENOSPC: no space left on device

  Check disk space and file permissions for .scaffold/
```

#### PSM_METHODOLOGY_MISMATCH

**Severity**: Warning
**Exit code**: 0
**Component**: State Manager (Domain 03)
**Trigger**: state.json methodology does not match config.yml methodology

**Template**:
```
⚠ Methodology changed since last build.

  State: {stateMethodology} → Config: {configMethodology}
  {orphanedCount} prompt(s) in state are no longer in the resolved pipeline.

  Run 'scaffold build' to regenerate outputs for the new methodology.
  Orphaned entries are preserved — run 'scaffold status' to see them.
```

**Variables**: `{stateMethodology}` — methodology in state, `{configMethodology}` — methodology in config, `{orphanedCount}` — number of orphaned prompts

**Example**:
```
⚠ Methodology changed since last build.

  State: deep → Config: mvp
  3 prompt(s) in state are no longer in the resolved pipeline.

  Run 'scaffold build' to regenerate outputs for the new methodology.
  Orphaned entries are preserved — run 'scaffold status' to see them.
```

> **Note**: Architecture Section 7c groups `PSM_METHODOLOGY_MISMATCH` under State Manager exit code 3, but it is a warning (exit 0) in this catalog because the system auto-recovers by preserving orphaned entries and proceeding with the new methodology.

#### PSM_CRASH_DETECTED

**Severity**: Warning
**Exit code**: 0
**Component**: State Manager (Domain 03)
**Trigger**: Previous session crashed during prompt execution (in_progress record found on startup)

**Template**:
```
⚠ Previous session appears to have crashed.

  Prompt '{prompt}' was in progress since {startedAt}.
  Actor: {actor}
  Partial artifacts: {partialCount}/{totalCount}

  Run 'scaffold run' to recover and continue.
```

**Variables**: `{prompt}` — in-progress prompt slug, `{startedAt}` — ISO timestamp, `{actor}` — actor identity, `{partialCount}` — number of partial artifacts found, `{totalCount}` — total expected artifacts

**Example**:
```
⚠ Previous session appears to have crashed.

  Prompt 'tech-stack' was in progress since 2026-03-13T14:30:00Z.
  Actor: agent-1
  Partial artifacts: 1/2

  Run 'scaffold run' to recover and continue.
```

#### PSM_SKIP_HAS_DEPENDENTS

**Severity**: Warning
**Exit code**: 0
**Component**: State Manager (Domain 03)
**Trigger**: Skipping a prompt that has dependent prompts downstream in the pipeline

**Template**:
```
⚠ Skipping '{prompt}' — {dependentCount} prompt(s) depend on it.

  Dependents: {dependents}

  These prompts may reference artifacts that '{prompt}' would have produced.
  Proceed with caution — some context may be missing.
```

**Variables**: `{prompt}` — skipped prompt slug, `{dependentCount}` — number of dependent prompts, `{dependents}` — comma-separated list of dependent prompt slugs

**Example**:
```
⚠ Skipping 'tech-stack' — 3 prompt(s) depend on it.

  Dependents: coding-standards, dev-env-setup, git-workflow

  These prompts may reference artifacts that 'tech-stack' would have produced.
  Proceed with caution — some context may be missing.
```

#### PSM_STATE_WITHOUT_ARTIFACTS

**Severity**: Warning
**Exit code**: 0
**Component**: State Manager (Domain 03)
**Trigger**: Prompt is marked completed in state.json but expected artifacts are missing from disk

**Template**:
```
⚠ Prompt '{prompt}' is marked completed but artifacts are missing.

  Missing: {missingArtifacts}

  Re-run the prompt: scaffold run --from {prompt}
```

**Variables**: `{prompt}` — prompt slug, `{missingArtifacts}` — newline-separated list of missing artifact paths

**Example**:
```
⚠ Prompt 'tech-stack' is marked completed but artifacts are missing.

  Missing: docs/tech-stack.md

  Re-run the prompt: scaffold run --from tech-stack
```

#### PSM_ARTIFACTS_WITHOUT_STATE

**Severity**: Warning
**Exit code**: 0
**Component**: State Manager (Domain 03)
**Trigger**: Artifacts exist on disk but the prompt's status is not completed

**Template**:
```
⚠ Artifacts exist for prompt '{prompt}' but status is '{status}'.

  Found: {foundArtifacts}
  Status: {status}

  Run 'scaffold validate' to verify artifact integrity.
```

**Variables**: `{prompt}` — prompt slug, `{status}` — current status, `{foundArtifacts}` — newline-separated list of found artifact paths

**Example**:
```
⚠ Artifacts exist for prompt 'tech-stack' but status is 'pending'.

  Found: docs/tech-stack.md
  Status: pending

  Run 'scaffold validate' to verify artifact integrity.
```

#### STATE_STALE_NEXT_ELIGIBLE

**Severity**: Warning
**Exit code**: 0
**Component**: State Manager (Domain 03)
**Trigger**: Cached next_eligible list is stale and does not match recomputed eligibility

**Template**:
```
⚠ Cached next_eligible list is stale in .scaffold/state.json

  Cached: {cached}
  Recomputed: {recomputed}

  The recomputed list will be used. State file will be updated on next write.
```

**Variables**: `{cached}` — comma-separated cached slugs, `{recomputed}` — comma-separated recomputed slugs

**Example**:
```
⚠ Cached next_eligible list is stale in .scaffold/state.json

  Cached: tech-stack, create-prd
  Recomputed: coding-standards, dev-env-setup

  The recomputed list will be used. State file will be updated on next write.
```

#### STATE_INCOMPLETE_COMPLETION

**Severity**: Error
**Exit code**: 3
**Component**: State Manager (Domain 03)
**Trigger**: Prompt completion attempted but required artifacts are missing or tracking comment is absent

**Template**:
```
✗ Cannot complete prompt '{prompt}' — missing requirements.

  {detail}

  Ensure all required artifacts exist before marking complete.
```

**Variables**: `{prompt}` — prompt slug, `{detail}` — specific missing requirement

**Example**:
```
✗ Cannot complete prompt 'tech-stack' — missing requirements.

  Artifact docs/tech-stack.md exists but has no tracking comment on line 1.

  Ensure all required artifacts exist before marking complete.
```

#### STATE_INCOMPLETE_SKIP

**Severity**: Error
**Exit code**: 3
**Component**: State Manager (Domain 03)
**Trigger**: Skip attempted without required metadata (e.g., missing reason)

**Template**:
```
✗ Cannot skip prompt '{prompt}' — missing required metadata.

  {detail}

  Provide a reason: scaffold skip {prompt} --reason "explanation"
```

**Variables**: `{prompt}` — prompt slug, `{detail}` — specific missing metadata

**Example**:
```
✗ Cannot skip prompt 'tech-stack' — missing required metadata.

  A skip reason is required (--reason flag).

  Provide a reason: scaffold skip tech-stack --reason "using existing tech stack doc"
```

#### STATE_MISSING_SKIP_REASON

**Severity**: Error
**Exit code**: 3
**Component**: State Manager (Domain 03)
**Trigger**: Prompt has status "skipped" in state.json but the required `reason` field is absent

**Template**:
```
✗ Skipped prompt '{prompt}' is missing a reason in .scaffold/state.json

  The 'reason' field is required when status is 'skipped'.

  Run 'scaffold skip {prompt} --reason "explanation"' to update.
```

**Variables**: `{prompt}` — prompt slug

**Example**:
```
✗ Skipped prompt 'create-prd' is missing a reason in .scaffold/state.json

  The 'reason' field is required when status is 'skipped'.

  Run 'scaffold skip create-prd --reason "using existing PRD"' to update.
```

#### STATE_PATH_FORMAT_INVALID

**Severity**: Error
**Exit code**: 3
**Component**: State Manager (Domain 03)
**Trigger**: A path in `produces` or `partial_artifacts` contains invalid characters or is not relative

**Template**:
```
✗ Invalid path format in .scaffold/state.json

  Field: {field}
  Value: {path}

  Paths must be relative to project root and use forward slashes.
```

**Variables**: `{field}` — field name (e.g., "prompts.tech-stack.produces[0]"), `{path}` — invalid path value

**Example**:
```
✗ Invalid path format in .scaffold/state.json

  Field: prompts.tech-stack.produces[0]
  Value: /absolute/path/docs/tech-stack.md

  Paths must be relative to project root and use forward slashes.
```

#### STATE_EXTRA_PROMPT_UNKNOWN_DEP

**Severity**: Warning
**Exit code**: 0
**Component**: State Manager (Domain 03)
**Trigger**: An extra prompt in state.json declares a dependency on a slug not found in the resolved prompt set

**Template**:
```
⚠ Extra prompt '{slug}' depends on unknown prompt '{dependency}'.

  The dependency target is not in the resolved pipeline.
  The dependency will be ignored.
```

**Variables**: `{slug}` — extra prompt slug, `{dependency}` — unknown dependency slug

**Example**:
```
⚠ Extra prompt 'security-audit' depends on unknown prompt 'security-baseline'.

  The dependency target is not in the resolved pipeline.
  The dependency will be ignored.
```

#### RESET_CONFIRM_REQUIRED

**Severity**: Error
**Exit code**: 1
**Component**: State Manager / Reset Command (Domain 03)
**Trigger**: `scaffold reset` invoked with `--auto` but without `--confirm-reset`

**Template**:
```
✗ Reset is destructive and cannot be undone. Use "--auto --confirm-reset" to confirm, or run interactively.

  In auto mode, reset requires explicit confirmation via the --confirm-reset flag.
  This prevents accidental pipeline resets in automated scripts.
```

**Variables**: none

**Example**:
```
✗ Reset is destructive and cannot be undone. Use "--auto --confirm-reset" to confirm, or run interactively.

  In auto mode, reset requires explicit confirmation via the --confirm-reset flag.
  This prevents accidental pipeline resets in automated scripts.
```

---

### 3.9 Lock Manager

#### LOCK_HELD

**Severity**: Error
**Exit code**: 3
**Component**: Lock Manager (Domain 13)
**Trigger**: Another process holds .scaffold/lock.json and PID is alive

**Template**:
```
✗ Pipeline is locked by another process.

  Lock holder: PID {pid} ({command})
  Acquired: {acquiredAt}
  Lock file: .scaffold/lock.json

  Wait for the other process to finish, or use --force to override.
```

**Variables**: `{pid}` — holding process ID, `{command}` — process command name, `{acquiredAt}` — ISO timestamp

**Example**:
```
✗ Pipeline is locked by another process.

  Lock holder: PID 42851 (scaffold run)
  Acquired: 2026-03-13T14:30:00Z
  Lock file: .scaffold/lock.json

  Wait for the other process to finish, or use --force to override.
```

#### LOCK_STALE_DETECTED

**Severity**: Info
**Exit code**: 0
**Component**: Lock Manager (Domain 13)
**Trigger**: Lock exists but PID is dead or recycled — auto-cleared

**Template**:
```
ℹ Stale lock detected and cleared.

  Previous holder: PID {pid} (no longer running)
  Lock file removed: .scaffold/lock.json
```

**Variables**: `{pid}` — dead process ID

**Example**:
```
ℹ Stale lock detected and cleared.

  Previous holder: PID 42851 (no longer running)
  Lock file removed: .scaffold/lock.json
```

#### LOCK_ACQUISITION_RACE

**Severity**: Error
**Exit code**: 3
**Component**: Lock Manager (Domain 13)
**Trigger**: Another process won the atomic create race (wx flag returned EEXIST)

**Template**:
```
✗ Lock acquisition failed — another process acquired the lock simultaneously.

  Retry in a moment, or use --force to override.
```

**Variables**: none

**Example**:
```
✗ Lock acquisition failed — another process acquired the lock simultaneously.

  Retry in a moment, or use --force to override.
```

---

### 3.10 Platform Adapters

#### ADAPTER_INIT_FAILED

**Severity**: Error
**Exit code**: 5
**Component**: Platform Adapters (Domain 05)
**Trigger**: Adapter failed to initialize (missing configuration or tool-map)

**Template**:
```
✗ Failed to initialize {adapter} adapter.

  {detail}

  Check adapter configuration in content/adapters/{adapterDir}/
```

**Variables**: `{adapter}` — adapter name, `{detail}` — initialization error, `{adapterDir}` — adapter directory name

**Example**:
```
✗ Failed to initialize Codex adapter.

  Missing tool-map configuration file

  Check adapter configuration in content/adapters/codex/
```

#### FRONTMATTER_GENERATION

**Severity**: Error
**Exit code**: 5
**Component**: Platform Adapters (Domain 05)
**Trigger**: Error during frontmatter generation for a prompt output

**Template**:
```
✗ Frontmatter generation failed for '{slug}' ({adapter} adapter).

  {detail}
```

**Variables**: `{slug}` — prompt slug, `{adapter}` — adapter name, `{detail}` — error detail

**Example**:
```
✗ Frontmatter generation failed for 'create-prd' (Claude Code adapter).

  Cannot serialize description field: value contains invalid YAML characters
```

#### NAVIGATION_GENERATION

**Severity**: Error
**Exit code**: 5
**Component**: Platform Adapters (Domain 05)
**Trigger**: Error during navigation section generation

**Template**:
```
✗ Navigation generation failed for '{slug}' ({adapter} adapter).

  {detail}

  Check that all predecessor prompts have valid frontmatter with 'description' fields.
  Run 'scaffold validate' to identify frontmatter issues.
```

**Variables**: `{slug}` — prompt slug, `{adapter}` — adapter name, `{detail}` — error detail

**Example**:
```
✗ Navigation generation failed for 'tech-stack' (Universal adapter).

  Predecessor 'create-prd' has no description field in resolved frontmatter

  Check that all predecessor prompts have valid frontmatter with 'description' fields.
  Run 'scaffold validate' to identify frontmatter issues.
```

#### SUMMARY_GENERATION

**Severity**: Error
**Exit code**: 5
**Component**: Platform Adapters (Domain 05)
**Trigger**: Error during pipeline summary generation

**Template**:
```
✗ Summary generation failed ({adapter} adapter).

  {detail}

  Verify that at least one prompt is resolved for the '{adapter}' platform.
  Run 'scaffold build --dry-run' to check the resolved prompt set.
```

**Variables**: `{adapter}` — adapter name, `{detail}` — error detail

**Example**:
```
✗ Summary generation failed (Codex adapter).

  Cannot build AGENTS.md: no prompts resolved for Codex platform

  Verify that at least one prompt is resolved for the 'Codex' platform.
  Run 'scaffold build --dry-run' to check the resolved prompt set.
```

#### TOOL_MAP_NOT_FOUND

**Severity**: Error
**Exit code**: 5
**Component**: Platform Adapters (Domain 05)
**Trigger**: Codex tool mapping file not found

**Template**:
```
✗ Tool mapping file not found: content/adapters/codex/tool-map.yml

  The Codex adapter requires this file for phrase-level tool-name mapping.
  Reinstall scaffold or create the file manually.
```

**Variables**: none

**Example**:
```
✗ Tool mapping file not found: content/adapters/codex/tool-map.yml

  The Codex adapter requires this file for phrase-level tool-name mapping.
  Reinstall scaffold or create the file manually.
```

#### TOOL_MAP_INVALID

**Severity**: Error
**Exit code**: 5
**Component**: Platform Adapters (Domain 05)
**Trigger**: Tool mapping file has invalid YAML structure

**Template**:
```
✗ Invalid tool mapping file: content/adapters/codex/tool-map.yml

  {parseError}

  Fix the YAML syntax in the tool-map file.
```

**Variables**: `{parseError}` — parser error

**Example**:
```
✗ Invalid tool mapping file: content/adapters/codex/tool-map.yml

  Duplicate key 'AskUserQuestionTool' at line 14

  Fix the YAML syntax in the tool-map file.
```

#### OUTPUT_WRITE_FAILED

**Severity**: Error
**Exit code**: 5
**Component**: Platform Adapters (Domain 05)
**Trigger**: Could not write output file

**Template**:
```
✗ Failed to write output file: {path}

  {ioError}

  Check disk space and permissions for the output directory.
```

**Variables**: `{path}` — output file path, `{ioError}` — system error message

**Example**:
```
✗ Failed to write output file: commands/create-prd.md

  EACCES: permission denied, open 'commands/create-prd.md'

  Check disk space and permissions for the output directory.
```

#### AGENTS_MD_ASSEMBLY

**Severity**: Error
**Exit code**: 5
**Component**: Platform Adapters (Domain 05)
**Trigger**: Failed to assemble AGENTS.md from adapter outputs

**Template**:
```
✗ Failed to assemble AGENTS.md for Codex adapter.

  {detail}

  Check that all prompts resolved for Codex have valid content.
```

**Variables**: `{detail}` — assembly error detail

**Example**:
```
✗ Failed to assemble AGENTS.md for Codex adapter.

  Section ordering conflict: prompt 'tech-stack' and 'create-prd' have the same phase and no dependency relation.

  Check that all prompts resolved for Codex have valid content.
```

#### UNKNOWN_PLATFORM

**Severity**: Error
**Exit code**: 5
**Component**: Platform Adapters (Domain 05)
**Trigger**: Platform ID in config does not match any registered adapter

**Template**:
```
✗ Unknown platform adapter '{platform}'.

  No adapter is registered for platform '{platform}'.
  Registered adapters: {registeredAdapters}
```

**Variables**: `{platform}` — unrecognized platform ID, `{registeredAdapters}` — comma-separated registered adapter names

**Example**:
```
✗ Unknown platform adapter 'cursor'.

  No adapter is registered for platform 'cursor'.
  Registered adapters: claude-code, codex, universal
```

#### CAPABILITY_UNSUPPORTED

**Severity**: Warning
**Exit code**: 0
**Component**: Platform Adapters (Domain 05)
**Trigger**: Prompt requires a capability not supported by the target platform

**Template**:
```
⚠ Prompt '{slug}' requires capability '{capability}' not supported by {adapter} adapter.

  The prompt will be generated without this capability.
```

**Variables**: `{slug}` — prompt slug, `{capability}` — unsupported capability, `{adapter}` — adapter name

**Example**:
```
⚠ Prompt 'git-workflow' requires capability 'subagent-delegation' not supported by Codex adapter.

  The prompt will be generated without this capability.
```

#### DUPLICATE_PATTERN

**Severity**: Warning
**Exit code**: 0
**Component**: Platform Adapters (Domain 05)
**Trigger**: Duplicate file patterns detected in adapter output

**Template**:
```
⚠ Duplicate file pattern detected in {adapter} adapter output.

  Pattern: {pattern}
  First: {firstFile}
  Duplicate: {duplicateFile}

  The first occurrence will be used.
```

**Variables**: `{pattern}` — duplicated pattern, `{adapter}` — adapter name, `{firstFile}` — first file, `{duplicateFile}` — duplicate file

**Example**:
```
⚠ Duplicate file pattern detected in Claude Code adapter output.

  Pattern: commands/tech-stack.md
  First: from base prompt
  Duplicate: from override prompt

  The first occurrence will be used.
```

#### EMPTY_PROMPT_CONTENT

**Severity**: Warning
**Exit code**: 0
**Component**: Platform Adapters (Domain 05)
**Trigger**: Prompt content is empty after transformation (mixin injection + adapter processing)

**Template**:
```
⚠ Prompt '{slug}' has empty content after {adapter} adapter transformation.

  The output file will be created with frontmatter only (no body content).
```

**Variables**: `{slug}` — prompt slug, `{adapter}` — adapter name

**Example**:
```
⚠ Prompt 'optional-review' has empty content after Codex adapter transformation.

  The output file will be created with frontmatter only (no body content).
```

#### MCP_NO_CLI_EQUIVALENT

**Severity**: Warning
**Exit code**: 0
**Component**: Platform Adapters (Domain 05)
**Trigger**: MCP tool reference in prompt has no CLI equivalent for the target platform

**Template**:
```
⚠ MCP tool '{tool}' has no CLI equivalent for {adapter} adapter.

  In prompt: {slug}
  The tool reference will be removed from the output.
```

**Variables**: `{tool}` — MCP tool name, `{adapter}` — adapter name, `{slug}` — prompt slug

**Example**:
```
⚠ MCP tool 'browser_snapshot' has no CLI equivalent for Codex adapter.

  In prompt: dev-env-setup
  The tool reference will be removed from the output.
```

#### TOOL_MAP_NO_MATCH

**Severity**: Warning
**Exit code**: 0
**Component**: Platform Adapters (Domain 05)
**Trigger**: A pattern in tool-map.yml never matched any content during the build

**Template**:
```
⚠ Tool-map pattern never matched: '{pattern}'

  File: content/adapters/{adapterDir}/tool-map.yml
  The pattern may be outdated or unnecessary.
```

**Variables**: `{pattern}` — unmatched pattern, `{adapterDir}` — adapter directory name

**Example**:
```
⚠ Tool-map pattern never matched: 'use the TodoWrite tool'

  File: content/adapters/codex/tool-map.yml
  The pattern may be outdated or unnecessary.
```

#### SUMMARY_TRUNCATED

**Severity**: Warning
**Exit code**: 0
**Component**: Platform Adapters (Domain 05)
**Trigger**: Condensed pipeline summary exceeded 500 tokens and was truncated

**Template**:
```
⚠ Pipeline summary truncated for {adapter} adapter.

  Original: {originalTokens} tokens
  Truncated to: 500 tokens

  Consider reducing prompt descriptions to keep the summary concise.
```

**Variables**: `{adapter}` — adapter name, `{originalTokens}` — original token count

**Example**:
```
⚠ Pipeline summary truncated for Codex adapter.

  Original: 720 tokens
  Truncated to: 500 tokens

  Consider reducing prompt descriptions to keep the summary concise.
```

#### CASCADE_RISK

**Severity**: Warning
**Exit code**: 0
**Component**: Platform Adapters (Domain 05)
**Trigger**: Tool-map pattern replaces with text that contains another pattern's match string

**Template**:
```
⚠ Tool-map cascade risk detected.

  Pattern: '{matchPattern}' → '{replaceText}'
  The replacement contains text matching pattern: '{cascadePattern}'

  This is safe (single-pass application prevents cascading) but may indicate a mistake.
```

**Variables**: `{matchPattern}` — original match pattern, `{replaceText}` — replacement text, `{cascadePattern}` — pattern that matches within the replacement

**Example**:
```
⚠ Tool-map cascade risk detected.

  Pattern: 'use the Read tool to read' → 'read the file to read'
  The replacement contains text matching pattern: 'read the file'

  This is safe (single-pass application prevents cascading) but may indicate a mistake.
```

#### TOOL_MAP_EMPTY_MATCH

**Severity**: Error
**Exit code**: 5
**Component**: Platform Adapters (Domain 05)
**Trigger**: Tool-map entry has an empty `match` field

**Template**:
```
✗ Empty match pattern in tool-map file.

  File: content/adapters/{adapterDir}/tool-map.yml
  Entry index: {index}

  Every pattern must have a non-empty 'match' field.
```

**Variables**: `{adapterDir}` — adapter directory name, `{index}` — zero-based entry index

**Example**:
```
✗ Empty match pattern in tool-map file.

  File: content/adapters/codex/tool-map.yml
  Entry index: 3

  Every pattern must have a non-empty 'match' field.
```

#### TOOL_MAP_MISSING_FIELD

**Severity**: Error
**Exit code**: 5
**Component**: Platform Adapters (Domain 05)
**Trigger**: Tool-map entry is missing a required field (`match` or `replace`)

**Template**:
```
✗ Missing required field '{field}' in tool-map entry.

  File: content/adapters/{adapterDir}/tool-map.yml
  Entry index: {index}

  Each entry must have both 'match' and 'replace' fields.
```

**Variables**: `{field}` — missing field name, `{adapterDir}` — adapter directory name, `{index}` — zero-based entry index

**Example**:
```
✗ Missing required field 'replace' in tool-map entry.

  File: content/adapters/codex/tool-map.yml
  Entry index: 5

  Each entry must have both 'match' and 'replace' fields.
```

#### TOOL_MAP_DUPLICATE_PATTERN

**Severity**: Error
**Exit code**: 5
**Component**: Platform Adapters (Domain 05)
**Trigger**: Two entries in tool-map.yml have the same `match` string

**Template**:
```
✗ Duplicate match pattern in tool-map file.

  File: content/adapters/{adapterDir}/tool-map.yml
  Pattern: '{pattern}'
  First occurrence: entry {firstIndex}
  Duplicate: entry {duplicateIndex}

  Remove the duplicate entry.
```

**Variables**: `{adapterDir}` — adapter directory name, `{pattern}` — duplicated match string, `{firstIndex}` — first entry index, `{duplicateIndex}` — duplicate entry index

**Example**:
```
✗ Duplicate match pattern in tool-map file.

  File: content/adapters/codex/tool-map.yml
  Pattern: 'use the Read tool'
  First occurrence: entry 0
  Duplicate: entry 7

  Remove the duplicate entry.
```

---

### 3.11 Extra-Prompts Validation

#### EXTRA_FILE_MISSING

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader / Prompt Resolver
**Trigger**: Extra prompt file not found in any search path during config validation

**Template**:
```
✗ Extra prompt '{slug}' not found during config validation.

  Searched:
    .scaffold/prompts/{slug}.md
    ~/.scaffold/prompts/{slug}.md

  Create the file at one of these paths, or remove '{slug}' from extra-prompts.
```

**Variables**: `{slug}` — extra-prompt slug

**Example**:
```
✗ Extra prompt 'security-audit' not found during config validation.

  Searched:
    .scaffold/prompts/security-audit.md
    ~/.scaffold/prompts/security-audit.md

  Create the file at one of these paths, or remove 'security-audit' from extra-prompts.
```

> **Cross-reference**: See also `RESOLUTION_EXTRA_PROMPT_MISSING` in [Section 3.5](#35-prompt-resolver), which fires during prompt resolution. `EXTRA_FILE_MISSING` fires during config validation (build pipeline stage 1), while `RESOLUTION_EXTRA_PROMPT_MISSING` fires during prompt resolution (build pipeline stage 2).

#### EXTRA_FRONTMATTER_MISSING

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader / Prompt Resolver
**Trigger**: Extra-prompt file has no YAML frontmatter

**Template**:
```
✗ Extra prompt '{slug}' has no YAML frontmatter.

  File: {path}

  Add frontmatter between --- delimiters with at least a 'description' field:
    ---
    description: Your prompt description
    ---
```

**Variables**: `{slug}` — prompt slug, `{path}` — file path

**Example**:
```
✗ Extra prompt 'security-audit' has no YAML frontmatter.

  File: .scaffold/prompts/security-audit.md

  Add frontmatter between --- delimiters with at least a 'description' field:
    ---
    description: Your prompt description
    ---
```

#### EXTRA_FRONTMATTER_PARSE_ERROR

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader / Prompt Resolver
**Trigger**: Frontmatter YAML is invalid

**Template**:
```
✗ Extra prompt '{slug}' has invalid frontmatter YAML.

  File: {path}
  {parseError}

  Fix the YAML syntax between the --- delimiters.
```

**Variables**: `{slug}` — prompt slug, `{path}` — file path, `{parseError}` — parser error

**Example**:
```
✗ Extra prompt 'security-audit' has invalid frontmatter YAML.

  File: .scaffold/prompts/security-audit.md
  Unexpected end of stream at line 3

  Fix the YAML syntax between the --- delimiters.
```

#### EXTRA_FRONTMATTER_FIELD_MISSING

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader / Prompt Resolver
**Trigger**: Required frontmatter field missing

**Template**:
```
✗ Extra prompt '{slug}' is missing required frontmatter field '{fieldName}'.

  File: {path}

  Add '{fieldName}' to the frontmatter.
```

**Variables**: `{slug}` — prompt slug, `{fieldName}` — missing field, `{path}` — file path

**Example**:
```
✗ Extra prompt 'security-audit' is missing required frontmatter field 'description'.

  File: .scaffold/prompts/security-audit.md

  Add 'description' to the frontmatter.
```

#### EXTRA_FRONTMATTER_FIELD_INVALID

**Severity**: Error or Warning (depends on field)
**Exit code**: 1 (error) or 0 (warning)
**Component**: Config Loader / Prompt Resolver
**Trigger**: Frontmatter field has invalid value

**Template**:
```
✗ Extra prompt '{slug}' has invalid value for field '{fieldName}'.

  File: {path}
  {detail}
```

**Variables**: `{slug}` — prompt slug, `{fieldName}` — field name, `{path}` — file path, `{detail}` — validation detail

**Example**:
```
✗ Extra prompt 'security-audit' has invalid value for field 'phase'.

  File: .scaffold/prompts/security-audit.md
  Phase must be a positive integer, got 'late'
```

#### EXTRA_SLUG_CONFLICT

**Severity**: Error
**Exit code**: 1
**Component**: Config Loader / Prompt Resolver
**Trigger**: Extra-prompt slug conflicts with a built-in prompt name

**Template**:
```
✗ Extra prompt '{slug}' conflicts with built-in prompt '{slug}'.

  Choose a different name for your custom prompt.
  Rename the file and update extra-prompts in config.
```

**Variables**: `{slug}` — conflicting slug

**Example**:
```
✗ Extra prompt 'tech-stack' conflicts with built-in prompt 'tech-stack'.

  Choose a different name for your custom prompt.
  Rename the file and update extra-prompts in config.
```

---

### 3.12 Adopt / Project Detector

#### ADOPT_SCAFFOLD_EXISTS

**Severity**: Error
**Exit code**: 1
**Component**: Project Detector (Domain 07)
**Trigger**: .scaffold/ directory already exists when running scaffold adopt

**Template**:
```
✗ Cannot adopt — .scaffold/ already exists.

  This project is already configured with Scaffold.
  Run 'scaffold run' to continue, or 'scaffold init --force' to reconfigure.
```

**Variables**: none

**Example**:
```
✗ Cannot adopt — .scaffold/ already exists.

  This project is already configured with Scaffold.
  Run 'scaffold run' to continue, or 'scaffold init --force' to reconfigure.
```

#### ADOPT_NO_METHODOLOGY

**Severity**: Error
**Exit code**: 1
**Component**: Project Detector (Domain 07)
**Trigger**: No methodology selected (required for scanning)

**Template**:
```
✗ Cannot adopt — no methodology specified.

  Run 'scaffold init' instead, which includes methodology selection.
  Or specify: scaffold adopt --methodology deep
```

**Variables**: none

**Example**:
```
✗ Cannot adopt — no methodology specified.

  Run 'scaffold init' instead, which includes methodology selection.
  Or specify: scaffold adopt --methodology deep
```

#### ADOPT_NO_SIGNALS

**Severity**: Error
**Exit code**: 1
**Component**: Project Detector (Domain 07)
**Trigger**: No existing code or artifacts detected — project appears to be greenfield

**Template**:
```
✗ No existing code or artifacts detected.

  scaffold adopt is for existing projects. This directory appears empty.
  Run 'scaffold init' for a new project instead.
```

**Variables**: none

**Example**:
```
✗ No existing code or artifacts detected.

  scaffold adopt is for existing projects. This directory appears empty.
  Run 'scaffold init' for a new project instead.
```

#### ADOPT_SCAN_FAILED

**Severity**: Error
**Exit code**: 1
**Component**: Project Detector (Domain 07)
**Trigger**: File system error during scanning

**Template**:
```
✗ Adopt scan failed.

  {ioError}

  Check file permissions for the project directory.
```

**Variables**: `{ioError}` — system error message

**Example**:
```
✗ Adopt scan failed.

  EACCES: permission denied, scandir 'src/'

  Check file permissions for the project directory.
```

#### ADOPT_STATE_WRITE_FAILED

**Severity**: Error
**Exit code**: 1
**Component**: Project Detector (Domain 07)
**Trigger**: Could not write state.json after adoption

**Template**:
```
✗ Failed to write .scaffold/state.json during adoption.

  {ioError}

  Check disk space and permissions for .scaffold/
```

**Variables**: `{ioError}` — system error message

**Example**:
```
✗ Failed to write .scaffold/state.json during adoption.

  ENOSPC: no space left on device

  Check disk space and permissions for .scaffold/
```

#### ADOPT_CONFIG_WRITE_FAILED

**Severity**: Error
**Exit code**: 1
**Component**: Project Detector (Domain 07)
**Trigger**: Could not write config.yml during adoption

**Template**:
```
✗ Failed to write .scaffold/config.yml during adoption.

  {ioError}

  Check disk space and permissions for .scaffold/
```

**Variables**: `{ioError}` — system error message

**Example**:
```
✗ Failed to write .scaffold/config.yml during adoption.

  EACCES: permission denied, open '.scaffold/config.yml'

  Check disk space and permissions for .scaffold/
```

#### ADOPT_CONFIRMATION_DECLINED

**Severity**: Info
**Exit code**: 4
**Component**: Project Detector (Domain 07)
**Trigger**: User declined adoption confirmation

**Template**:
```
Adoption cancelled. No files were modified.
```

**Variables**: none

**Example**:
```
Adoption cancelled. No files were modified.
```

---

### 3.13 Frontmatter Parser

#### FRONTMATTER_MISSING

**Severity**: Error
**Exit code**: 5
**Component**: Frontmatter Parser (Domain 08)
**Trigger**: Prompt file has no YAML frontmatter (`---` delimiters absent)

**Template**:
```
✗ No YAML frontmatter found in {path}

  Prompt files must begin with frontmatter between --- delimiters:
    ---
    description: Your prompt description
    ---

  Add frontmatter to the file.
```

**Variables**: `{path}` — prompt file path

**Example**:
```
✗ No YAML frontmatter found in content/base/tech-stack.md

  Prompt files must begin with frontmatter between --- delimiters:
    ---
    description: Your prompt description
    ---

  Add frontmatter to the file.
```

#### FRONTMATTER_UNCLOSED

**Severity**: Error
**Exit code**: 5
**Component**: Frontmatter Parser (Domain 08)
**Trigger**: Opening `---` found but no closing `---` delimiter

**Template**:
```
✗ Unclosed frontmatter in {path}

  Opening '---' found at line 1, but no closing '---' was found.

  Add a closing '---' after the frontmatter fields.
```

**Variables**: `{path}` — prompt file path

**Example**:
```
✗ Unclosed frontmatter in content/base/tech-stack.md

  Opening '---' found at line 1, but no closing '---' was found.

  Add a closing '---' after the frontmatter fields.
```

#### FRONTMATTER_YAML_ERROR

**Severity**: Error
**Exit code**: 5
**Component**: Frontmatter Parser (Domain 08)
**Trigger**: Malformed YAML between frontmatter delimiters

**Template**:
```
✗ Invalid YAML in frontmatter of {path}

  {parseError}

  Fix the YAML syntax between the --- delimiters.
```

**Variables**: `{path}` — prompt file path, `{parseError}` — YAML parser error

**Example**:
```
✗ Invalid YAML in frontmatter of content/base/tech-stack.md

  Unexpected mapping at line 3, column 5

  Fix the YAML syntax between the --- delimiters.
```

#### FRONTMATTER_DESCRIPTION_MISSING

**Severity**: Error
**Exit code**: 5
**Component**: Frontmatter Parser (Domain 08)
**Trigger**: Required `description` field absent from frontmatter

**Template**:
```
✗ Missing required field 'description' in frontmatter of {path}

  Every prompt must have a 'description' field in its frontmatter.

  Add: description: Your prompt description
```

**Variables**: `{path}` — prompt file path

**Example**:
```
✗ Missing required field 'description' in frontmatter of content/base/tech-stack.md

  Every prompt must have a 'description' field in its frontmatter.

  Add: description: Your prompt description
```

#### FRONTMATTER_INVALID_FIELD

**Severity**: Error
**Exit code**: 5
**Component**: Frontmatter Parser (Domain 08)
**Trigger**: Frontmatter field has an invalid value (wrong type, out of range, etc.)

**Template**:
```
✗ Invalid frontmatter field '{field}' in {path}

  {detail}
```

**Variables**: `{field}` — field name, `{path}` — prompt file path, `{detail}` — validation error detail

**Example**:
```
✗ Invalid frontmatter field 'phase' in content/base/tech-stack.md

  Phase must be a positive integer, got 'early'
```

#### FRONTMATTER_PRODUCES_MISSING

**Severity**: Error
**Exit code**: 5
**Component**: Frontmatter Parser (Domain 08)
**Trigger**: Built-in prompt has no `produces` field in frontmatter

**Template**:
```
✗ Missing required field 'produces' in frontmatter of {path}

  Built-in prompts must declare their output artifacts in the 'produces' field.

  Add: produces: ["docs/your-artifact.md"]
```

**Variables**: `{path}` — prompt file path

**Example**:
```
✗ Missing required field 'produces' in frontmatter of content/base/tech-stack.md

  Built-in prompts must declare their output artifacts in the 'produces' field.

  Add: produces: ["docs/tech-stack.md"]
```

#### FRONTMATTER_DEPENDS_INVALID_SLUG

**Severity**: Error
**Exit code**: 5
**Component**: Frontmatter Parser (Domain 08)
**Trigger**: `depends-on` entry is not a valid kebab-case prompt slug

**Template**:
```
✗ Invalid slug in 'depends-on' of {path}

  Value: '{slug}'
  Slugs must be kebab-case: lowercase letters, digits, and hyphens (e.g., 'tech-stack').
```

**Variables**: `{path}` — prompt file path, `{slug}` — invalid slug value

**Example**:
```
✗ Invalid slug in 'depends-on' of content/base/coding-standards.md

  Value: 'Tech Stack'
  Slugs must be kebab-case: lowercase letters, digits, and hyphens (e.g., 'tech-stack').
```

#### FRONTMATTER_UNKNOWN_FIELD

**Severity**: Warning
**Exit code**: 0
**Component**: Frontmatter Parser (Domain 08)
**Trigger**: Unrecognized field name in prompt frontmatter

**Template**:
```
⚠ Unknown field '{field}' in frontmatter of {path}

  {suggestion}
  Known fields: description, depends-on, produces, phase, requires, reads, artifact-schema
```

**Variables**: `{field}` — unrecognized field name, `{path}` — prompt file path, `{suggestion}` — fuzzy match suggestion or empty string

**Example**:
```
⚠ Unknown field 'dependson' in frontmatter of content/base/coding-standards.md

  Did you mean 'depends-on'?
  Known fields: description, depends-on, produces, phase, requires, reads, artifact-schema
```

---

### 3.14 Validator

#### VALIDATE_ARTIFACT_MISSING_SECTION

**Severity**: Error
**Exit code**: 5
**Component**: Validator (Domain 09)
**Trigger**: Artifact is missing a required section from its artifact-schema definition

**Template**:
```
✗ Artifact {path} is missing required section '{section}'.

  Expected by artifact-schema in prompt '{prompt}'.

  Add the missing section to the artifact.
```

**Variables**: `{path}` — artifact file path, `{section}` — missing section heading, `{prompt}` — prompt slug that defines the schema

**Example**:
```
✗ Artifact docs/tech-stack.md is missing required section 'Runtime Environment'.

  Expected by artifact-schema in prompt 'tech-stack'.

  Add the missing section to the artifact.
```

#### VALIDATE_ARTIFACT_INVALID_ID

**Severity**: Error
**Exit code**: 5
**Component**: Validator (Domain 09)
**Trigger**: Artifact ID (from tracking comment) does not match the expected pattern

**Template**:
```
✗ Invalid artifact ID in {path}

  Found: '{foundId}'
  Expected pattern: {expectedPattern}
```

**Variables**: `{path}` — artifact file path, `{foundId}` — detected ID, `{expectedPattern}` — expected ID pattern

**Example**:
```
✗ Invalid artifact ID in docs/tech-stack.md

  Found: 'Tech Stack'
  Expected pattern: kebab-case slug (e.g., 'tech-stack')
```

#### VALIDATE_ARTIFACT_MISSING_INDEX

**Severity**: Error
**Exit code**: 5
**Component**: Validator (Domain 09)
**Trigger**: Artifact is missing an index table within the first 50 lines

**Template**:
```
✗ Artifact {path} is missing an index table.

  Expected: Table of contents or section index within the first 50 lines.
  Prompt '{prompt}' requires an index table for this artifact.
```

**Variables**: `{path}` — artifact file path, `{prompt}` — prompt slug

**Example**:
```
✗ Artifact docs/coding-standards.md is missing an index table.

  Expected: Table of contents or section index within the first 50 lines.
  Prompt 'coding-standards' requires an index table for this artifact.
```

#### VALIDATE_ARTIFACT_MISSING_TRACKING

**Severity**: Error
**Exit code**: 5
**Component**: Validator (Domain 09)
**Trigger**: Artifact is missing a tracking comment on line 1

**Template**:
```
✗ Artifact {path} is missing a tracking comment on line 1.

  Expected: <!-- scaffold:{slug} v{version} {date} {methodology} depth:{depth} -->
  This comment is required for mode detection and provenance tracking.
```

**Variables**: `{path}` — artifact file path, `{slug}` — expected prompt slug, `{version}` — expected version, `{date}` — expected date, `{methodology}` — methodology name, `{depth}` — depth level (integer 1-5)

**Example**:
```
✗ Artifact docs/tech-stack.md is missing a tracking comment on line 1.

  Expected: <!-- scaffold:tech-stack v1 2026-03-13 deep depth:5 -->
  This comment is required for mode detection and provenance tracking.
```

#### VALIDATE_UNRESOLVED_MARKER

**Severity**: Error
**Exit code**: 5
**Component**: Validator (Domain 09)
**Trigger**: Build output file contains an unresolved mixin or verb marker

**Template**:
```
✗ Unresolved marker found in build output: {path}

  Marker: {marker} at line {line}

  Run 'scaffold build' to regenerate outputs.
```

**Variables**: `{path}` — output file path, `{marker}` — unresolved marker text, `{line}` — line number

**Example**:
```
✗ Unresolved marker found in build output: commands/coding-standards.md

  Marker: <!-- mixin:tdd --> at line 42

  Run 'scaffold build' to regenerate outputs.
```

#### VALIDATE_DECISIONS_INVALID

**Severity**: Error
**Exit code**: 5
**Component**: Validator (Domain 09)
**Trigger**: An entry in decisions.jsonl is malformed JSON

**Template**:
```
✗ Malformed entry in .scaffold/decisions.jsonl at line {line}

  {parseError}

  Fix or remove the malformed line. Each line must be valid JSON.
```

**Variables**: `{line}` — line number, `{parseError}` — JSON parse error

**Example**:
```
✗ Malformed entry in .scaffold/decisions.jsonl at line 15

  Unexpected token '}' at position 42

  Fix or remove the malformed line. Each line must be valid JSON.
```

---

### 3.15 Tracking Comments

#### TRK_MISSING

**Severity**: Error
**Exit code**: 5
**Component**: Tracking Comment Parser
**Trigger**: Expected tracking comment on line 1 is absent

**Template**:
```
✗ Tracking comment missing from line 1 of {path}

  Expected format: <!-- scaffold:{slug} v{version} {date} {methodology} depth:{depth} -->
```

**Variables**: `{path}` — file path, `{slug}` — expected prompt slug, `{version}` — expected version, `{date}` — expected date, `{methodology}` — methodology name, `{depth}` — depth level (integer 1-5)

**Example**:
```
✗ Tracking comment missing from line 1 of docs/tech-stack.md

  Expected format: <!-- scaffold:tech-stack v1 2026-03-13 deep depth:5 -->
```

#### TRK_MALFORMED

**Severity**: Error
**Exit code**: 5
**Component**: Tracking Comment Parser
**Trigger**: Line 1 contains an HTML comment that looks like a tracking comment but does not match the expected regex

**Template**:
```
✗ Malformed tracking comment on line 1 of {path}

  Found: {rawComment}
  Expected format: <!-- scaffold:<slug> v<N> <YYYY-MM-DD> <methodology> depth:<N> -->
```

**Variables**: `{path}` — file path, `{rawComment}` — actual line 1 content

**Example**:
```
✗ Malformed tracking comment on line 1 of docs/tech-stack.md

  Found: <!-- scaffold:tech-stack v1 -->
  Expected format: <!-- scaffold:<slug> v<N> <YYYY-MM-DD> <methodology> depth:<N> -->
```

#### TRK_SLUG_MISMATCH

**Severity**: Error
**Exit code**: 5
**Component**: Tracking Comment Parser
**Trigger**: Tracking comment slug does not match the expected prompt slug for the artifact

**Template**:
```
✗ Tracking comment slug mismatch in {path}

  Comment slug: {commentSlug}
  Expected slug: {expectedSlug}

  Update the tracking comment or verify the file is the correct artifact.
```

**Variables**: `{path}` — file path, `{commentSlug}` — slug from tracking comment, `{expectedSlug}` — expected slug

**Example**:
```
✗ Tracking comment slug mismatch in docs/tech-stack.md

  Comment slug: create-prd
  Expected slug: tech-stack

  Update the tracking comment or verify the file is the correct artifact.
```

#### TRK_FUTURE_DATE

**Severity**: Warning
**Exit code**: 0
**Component**: Tracking Comment Parser
**Trigger**: Tracking comment date is in the future

**Template**:
```
⚠ Tracking comment in {path} has a future date: {date}

  This may indicate a clock skew issue. The file will be processed normally.
```

**Variables**: `{path}` — file path, `{date}` — future date from comment

**Example**:
```
⚠ Tracking comment in docs/tech-stack.md has a future date: 2027-01-15

  This may indicate a clock skew issue. The file will be processed normally.
```

#### TRK_V1_DETECTED

**Severity**: Warning
**Exit code**: 0
**Component**: Tracking Comment Parser
**Trigger**: V1 tracking comment format detected (missing methodology and mixin summary fields)

**Template**:
```
⚠ V1 tracking comment detected in {path}

  Format: {rawComment}
  V1 tracking comments lack methodology and mixin summary fields.

  The file will be processed. Re-run the prompt to update the tracking comment to v2 format.
```

**Variables**: `{path}` — file path, `{rawComment}` — raw v1 comment

**Example**:
```
⚠ V1 tracking comment detected in docs/tech-stack.md

  Format: <!-- scaffold:tech-stack v1 2025-06-15 -->
  V1 tracking comments lack methodology and mixin summary fields.

  The file will be processed. Re-run the prompt to update the tracking comment to v2 format.
```

#### TRK_VERSION_ZERO

**Severity**: Warning
**Exit code**: 0
**Component**: Tracking Comment Parser
**Trigger**: Tracking comment version is 0, which is unconventional (versions start at 1)

**Template**:
```
⚠ Tracking comment in {path} has version 0.

  Versions normally start at 1. This may indicate a manually created tracking comment.
```

**Variables**: `{path}` — file path

**Example**:
```
⚠ Tracking comment in docs/tech-stack.md has version 0.

  Versions normally start at 1. This may indicate a manually created tracking comment.
```

---

### 3.16 CLAUDE.md Ownership Markers

#### CMD_UNPAIRED_OPEN

**Severity**: Error
**Exit code**: 5
**Component**: CLAUDE.md Manager (Domain 10)
**Trigger**: Open ownership marker (`<!-- scaffold:managed by ... -->`) has no corresponding close marker

**Template**:
```
✗ Unpaired open marker in CLAUDE.md at line {line}

  Marker: <!-- scaffold:managed by {owner} -->
  No corresponding <!-- /scaffold:managed --> found below this line.

  Add a close marker, or remove the open marker.
```

**Variables**: `{line}` — line number, `{owner}` — owner slug from the marker

**Example**:
```
✗ Unpaired open marker in CLAUDE.md at line 45

  Marker: <!-- scaffold:managed by tech-stack -->
  No corresponding <!-- /scaffold:managed --> found below this line.

  Add a close marker, or remove the open marker.
```

#### CMD_UNPAIRED_CLOSE

**Severity**: Error
**Exit code**: 5
**Component**: CLAUDE.md Manager (Domain 10)
**Trigger**: Close ownership marker (`<!-- /scaffold:managed -->`) has no preceding open marker

**Template**:
```
✗ Unpaired close marker in CLAUDE.md at line {line}

  Found <!-- /scaffold:managed --> without a preceding open marker.

  Add an open marker above, or remove the close marker.
```

**Variables**: `{line}` — line number

**Example**:
```
✗ Unpaired close marker in CLAUDE.md at line 72

  Found <!-- /scaffold:managed --> without a preceding open marker.

  Add an open marker above, or remove the close marker.
```

#### CMD_NESTED_MARKERS

**Severity**: Error
**Exit code**: 5
**Component**: CLAUDE.md Manager (Domain 10)
**Trigger**: An open ownership marker appears inside another managed section

**Template**:
```
✗ Nested ownership markers in CLAUDE.md

  Outer: <!-- scaffold:managed by {outerOwner} --> at line {outerLine}
  Inner: <!-- scaffold:managed by {innerOwner} --> at line {innerLine}

  Ownership markers must not be nested. Close the outer section first.
```

**Variables**: `{outerOwner}` — outer section owner, `{outerLine}` — outer marker line, `{innerOwner}` — inner section owner, `{innerLine}` — inner marker line

**Example**:
```
✗ Nested ownership markers in CLAUDE.md

  Outer: <!-- scaffold:managed by tech-stack --> at line 45
  Inner: <!-- scaffold:managed by coding-standards --> at line 52

  Ownership markers must not be nested. Close the outer section first.
```

#### CMD_DUPLICATE_OWNER

**Severity**: Warning
**Exit code**: 0
**Component**: CLAUDE.md Manager (Domain 10)
**Trigger**: Same owner slug appears in multiple open markers

**Template**:
```
⚠ Duplicate ownership for '{owner}' in CLAUDE.md

  First: line {firstLine}
  Duplicate: line {duplicateLine}

  Each prompt slug should own at most one section. Remove the duplicate.
```

**Variables**: `{owner}` — owner slug, `{firstLine}` — first marker line, `{duplicateLine}` — duplicate marker line

**Example**:
```
⚠ Duplicate ownership for 'tech-stack' in CLAUDE.md

  First: line 45
  Duplicate: line 120

  Each prompt slug should own at most one section. Remove the duplicate.
```

#### CMD_UNKNOWN_OWNER

**Severity**: Warning
**Exit code**: 0
**Component**: CLAUDE.md Manager (Domain 10)
**Trigger**: Owner slug in a managed section does not match any prompt in the resolved pipeline

**Template**:
```
⚠ Unknown owner '{owner}' in CLAUDE.md at line {line}

  No prompt with slug '{owner}' is in the current pipeline.
  The section will not be updated by any prompt.
```

**Variables**: `{owner}` — unrecognized owner slug, `{line}` — line number

**Example**:
```
⚠ Unknown owner 'old-prompt' in CLAUDE.md at line 45

  No prompt with slug 'old-prompt' is in the current pipeline.
  The section will not be updated by any prompt.
```

#### CMD_SECTION_OVER_BUDGET

**Severity**: Warning
**Exit code**: 0
**Component**: CLAUDE.md Manager (Domain 10)
**Trigger**: A managed CLAUDE.md section exceeds its token budget

**Template**:
```
⚠ CLAUDE.md section "{section}" owned by "{owner}" is {actual} tokens (budget: {budget}). Total scaffold budget: {totalActual}/{totalBudget} tokens.

  Consider condensing the section content. Run 'scaffold validate' to see all budget violations.
```

**Variables**: `{section}` — section heading, `{owner}` — step slug that owns the section, `{actual}` — actual token count, `{budget}` — per-section budget, `{totalActual}` — total tokens across all scaffold sections, `{totalBudget}` — total scaffold token budget

**Example**:
```
⚠ CLAUDE.md section "Pipeline Status" owned by "create-prd" is 350 tokens (budget: 300). Total scaffold budget: 2100/2000 tokens.

  Consider condensing the section content. Run 'scaffold validate' to see all budget violations.
```

---

### 3.17 User Cancellation

#### USER_CANCELLED

**Severity**: Error
**Exit code**: 4
**Component**: CLI Shell (interactive layer)
**Trigger**: User interrupts an interactive command (Ctrl+C or declines a confirmation prompt)

**Template**:
```
Operation cancelled.
```

**Variables**: none

**Example**:
```
Operation cancelled.
```

#### INIT_WIZARD_CANCELLED

**Severity**: Error
**Exit code**: 4
**Component**: Init Wizard (Domain 14)
**Trigger**: User explicitly declines the init wizard (deliberate cancellation, distinct from interrupt)

**Template**:
```
Wizard cancelled — no files were created.
```

**Variables**: none

**Example**:
```
Wizard cancelled — no files were created.
```

---

### 3.18 Methodology Preset Loader

#### PRESET_MISSING

**Severity**: Error
**Exit code**: 1
**Component**: Methodology Preset Loader (Domain 16)
**Trigger**: Methodology preset file not found when resolving methodology

**Template**:
```
✗ Methodology preset file not found: methodology/{name}.yml

  Check that the preset name matches an installed methodology.
  Available presets: deep, mvp, custom-defaults
```

**Variables**: `{name}` — methodology name from config

**Example**:
```
✗ Methodology preset file not found: methodology/agile.yml

  Check that the preset name matches an installed methodology.
  Available presets: deep, mvp, custom-defaults
```

---

#### PRESET_PARSE_ERROR

**Severity**: Error
**Exit code**: 1
**Component**: Methodology Preset Loader (Domain 16)
**Trigger**: YAML syntax error in methodology preset file

**Template**:
```
✗ Methodology preset methodology/{name}.yml has invalid YAML: {parseError}

  Fix the YAML syntax error in the preset file.
```

**Variables**: `{name}` — methodology name, `{parseError}` — YAML parser error message

**Example**:
```
✗ Methodology preset methodology/deep.yml has invalid YAML: unexpected end of the stream (12:1)

  Fix the YAML syntax error in the preset file.
```

---

#### PRESET_INVALID_STEP

**Severity**: Error
**Exit code**: 1
**Component**: Methodology Preset Loader (Domain 16)
**Trigger**: Preset references a step name that does not exist in the pipeline/ directory

**Template**:
```
✗ Preset "{preset}" references step "{step}" which does not exist in the pipeline.

  {suggestion}
  Remove the unknown step from methodology/{preset}.yml or create pipeline/{step}.md.
```

**Variables**: `{preset}` — preset name, `{step}` — invalid step name, `{suggestion}` — fuzzy match suggestion or empty string

**Example**:
```
✗ Preset "deep" references step "create-pdr" which does not exist in the pipeline.

  Did you mean 'create-prd'?
  Remove the unknown step from methodology/deep.yml or create pipeline/create-pdr.md.
```

---

#### PRESET_MISSING_STEP

**Severity**: Warning
**Exit code**: 0
**Component**: Methodology Preset Loader (Domain 16)
**Trigger**: A meta-prompt exists in pipeline/ but is not listed in the preset's steps map

**Template**:
```
⚠ Meta-prompt "{step}" exists in pipeline/ but is not listed in preset "{preset}". It will use the preset's default_depth.

  Add an explicit entry to methodology/{preset}.yml to control this step's enablement and depth.
```

**Variables**: `{step}` — meta-prompt name not in preset, `{preset}` — preset name

**Example**:
```
⚠ Meta-prompt "accessibility" exists in pipeline/ but is not listed in preset "deep". It will use the preset's default_depth.

  Add an explicit entry to methodology/deep.yml to control this step's enablement and depth.
```

---

### 3.19 Knowledge Base

#### KB_NAME_MISSING

**Severity**: Error
**Exit code**: 1
**Component**: Knowledge Loader (Domain 15)
**Trigger**: Knowledge base entry file is missing required `name` field in frontmatter

**Template**:
```
✗ Knowledge base entry {file} is missing required "name" field.

  Add a 'name' field (kebab-case) to the YAML frontmatter.
```

**Variables**: `{file}` — file path of the KB entry

**Example**:
```
✗ Knowledge base entry knowledge/core/system-architecture.md is missing required "name" field.

  Add a 'name' field (kebab-case) to the YAML frontmatter.
```

---

#### KB_NAME_INVALID

**Severity**: Error
**Exit code**: 1
**Component**: Knowledge Loader (Domain 15)
**Trigger**: Knowledge base entry `name` field is not valid kebab-case or does not match filename stem

**Template**:
```
✗ Knowledge base entry {file} name "{value}" is not valid kebab-case.

  Name must match pattern ^[a-z][a-z0-9-]*$ and match the filename stem.
```

**Variables**: `{file}` — file path, `{value}` — invalid name value

**Example**:
```
✗ Knowledge base entry knowledge/core/System-Architecture.md name "System-Architecture" is not valid kebab-case.

  Name must match pattern ^[a-z][a-z0-9-]*$ and match the filename stem.
```

---

#### KB_DESCRIPTION_MISSING

**Severity**: Error
**Exit code**: 1
**Component**: Knowledge Loader (Domain 15)
**Trigger**: Knowledge base entry file is missing required `description` field in frontmatter

**Template**:
```
✗ Knowledge base entry {file} is missing required "description" field.

  Add a 'description' field (max 200 characters) to the YAML frontmatter.
```

**Variables**: `{file}` — file path

**Example**:
```
✗ Knowledge base entry knowledge/core/api-design.md is missing required "description" field.

  Add a 'description' field (max 200 characters) to the YAML frontmatter.
```

---

#### KB_TOPICS_EMPTY

**Severity**: Error
**Exit code**: 1
**Component**: Knowledge Loader (Domain 15)
**Trigger**: Knowledge base entry `topics` field is missing or empty array

**Template**:
```
✗ Knowledge base entry {file} must have at least one topic.

  Add a 'topics' array with at least one topic label to the YAML frontmatter.
```

**Variables**: `{file}` — file path

**Example**:
```
✗ Knowledge base entry knowledge/review/review-methodology.md must have at least one topic.

  Add a 'topics' array with at least one topic label to the YAML frontmatter.
```

---

#### KB_UNKNOWN_FIELD

**Severity**: Warning
**Exit code**: 0
**Component**: Knowledge Loader (Domain 15)
**Trigger**: Unrecognized field in knowledge base entry frontmatter

**Template**:
```
⚠ Unknown field "{field}" in knowledge base entry {file}.

  Known fields: name, description, topics
```

**Variables**: `{field}` — unrecognized field name, `{file}` — file path

**Example**:
```
⚠ Unknown field "author" in knowledge base entry knowledge/core/domain-modeling.md.

  Known fields: name, description, topics
```

---

## Section 4: Warning Message Patterns

Warnings use `⚠` (yellow) and do not block operations (exit code 0). They follow the same three-part structure as errors: what happened → context → suggestion.

### 4.1 Incompatible Combination Warnings

> **Note**: The former mixin combination warnings (`COMBO_MANUAL_FULL_PR`, `COMBO_NONE_MULTI`, `COMBO_CODEX_NO_CODEX_PLATFORM`, `COMBO_MULTI_AGENT_SINGLE_STYLE`, `COMBO_NONE_STRICT_TDD`) have been removed. Mixin axes have been eliminated from the architecture (ADR-041). The meta-prompt architecture adapts prompt content natively based on project context.

---

### 4.2 Adopt Warnings

#### ADOPT_PARTIAL_MATCH

**Severity**: Warning
**Exit code**: 0
**Component**: Project Detector (Domain 07)
**Trigger**: File exists but schema validation fails

```
⚠ Partial match for prompt '{prompt}': {path}

  File exists but is missing {detail}.
  Prompt will be marked 'pending' — run it to complete the artifact.
```

#### ADOPT_FUZZY_PATH_MATCH

**Severity**: Warning
**Exit code**: 0
**Component**: Project Detector (Domain 07)
**Trigger**: File found at a non-standard location

```
⚠ Artifact found at non-standard path for prompt '{prompt}'.

  Expected: {expectedPath}
  Found: {actualPath}

  The file will be used, but consider moving it to the expected location.
```

#### ADOPT_V1_TRACKING_FORMAT

**Severity**: Warning
**Exit code**: 0
**Component**: Project Detector (Domain 07)
**Trigger**: V1 tracking comment detected — migration needed

```
⚠ V1 tracking comment found in {path}

  Format: <!-- scaffold:{promptName} v{version} {date} -->
  This artifact was created by Scaffold v1 and will be migrated.
```

#### ADOPT_STALE_TRACKING

**Severity**: Warning
**Exit code**: 0
**Component**: Project Detector (Domain 07)
**Trigger**: Tracking comment refers to an unknown prompt slug

```
⚠ Tracking comment in {path} references unknown prompt '{promptName}'.

  This prompt may have been renamed or removed in v2.
  The file will not be mapped to any pipeline prompt.
```

#### ADOPT_MIXIN_INFERENCE_WEAK (REMOVED)

> **Removed**: Mixin axes have been eliminated from the architecture. See ADR-041.

#### ADOPT_EXTRA_ARTIFACTS

**Severity**: Warning
**Exit code**: 0
**Component**: Project Detector (Domain 07)
**Trigger**: Files found that don't map to any prompt

```
⚠ {count} file(s) found that don't map to any Scaffold prompt.

  These files will be preserved but not tracked by the pipeline.
```

---

### 4.3 Other Advisory Warnings

#### PSM_ZERO_BYTE_ARTIFACT

**Severity**: Warning
**Exit code**: 0
**Component**: State Manager / Validator
**Trigger**: Produced artifact file exists but is 0 bytes

```
⚠ Zero-byte artifact: {path}

  Prompt '{prompt}' is marked completed, but the artifact is empty.
  Consider re-running: scaffold run --from {prompt}
```

#### PSM_METHODOLOGY_MISMATCH

See [Section 3.8](#38-state-manager) — documented with State Manager errors as it can also appear as a standalone warning during `scaffold status`.

#### BUILD_OUTPUTS_STALE

**Severity**: Warning
**Exit code**: 0
**Component**: CLI Shell
**Trigger**: Config mtime is newer than last build timestamp

```
⚠ Build outputs may be stale.

  Config was modified after the last build ({configMtime}).
  Run 'scaffold build' to regenerate.
```

#### DECISION_UNKNOWN_PROMPT

**Severity**: Warning
**Exit code**: 0
**Component**: Validator
**Trigger**: Decision references a prompt not in state.json

```
⚠ Decision references unknown prompt '{prompt}' in decisions.jsonl

  This prompt may have been removed after a methodology change.
  The decision is preserved but will not appear in prompt context.
```

#### CMD_SECTION_NOT_FILLED

**Severity**: Warning
**Exit code**: 0
**Component**: Validator
**Trigger**: CLAUDE.md section is still a placeholder despite prompt being completed

```
⚠ CLAUDE.md section for prompt '{prompt}' is still a placeholder.

  The prompt is marked completed, but the CLAUDE.md section was not filled.
  Re-run: scaffold run --from {prompt}
```

#### PSM_SKIP_HAS_DEPENDENTS (replaces SKIPPED_PREDECESSOR)

See [Section 3.8 — PSM_SKIP_HAS_DEPENDENTS](#38-state-manager) for the full entry. This code replaces the former `SKIPPED_PREDECESSOR` code, aligning with the architecture Section 7c error registry naming.

---

## Section 5: Fuzzy Match Suggestions

When a string value fails validation and the closest valid option has Levenshtein distance ≤ 2, the error message includes a suggestion. This applies to all value-validation error codes.

### Single Close Match

When exactly one valid option is within distance 2:

```
✗ Unknown methodology 'deap' in .scaffold/config.yml

  Did you mean 'deep'?
  Valid options: deep, mvp, custom
```

### Multiple Close Matches

When two or more valid options are within distance 2:

```
✗ Unknown platform 'claud' in .scaffold/config.yml

  Did you mean one of:
    • claude-code
    • (no other matches within threshold)

  Valid options: claude-code, codex
```

### No Close Match

When no valid option is within distance 2:

```
✗ Unknown methodology 'mycompany' in .scaffold/config.yml

  Valid options: deep, mvp, custom
  Run 'scaffold list' to see all available methodologies.
```

### Error Codes with Fuzzy Match Support

The following error codes include fuzzy match suggestions via the `{suggestion}` template variable:

| Error Code | Fuzzy Match Against |
|-----------|-------------------|
| `CONFIG_UNKNOWN_FIELD` | Top-level config field names |
| `FIELD_INVALID_METHODOLOGY` | Installed methodology directory names |
| `FIELD_INVALID_PLATFORM` | Registered platform adapter names |
| `FIELD_INVALID_PROJECT_PLATFORM` | Project platform names (web, mobile, desktop) |
| `RESOLUTION_METHODOLOGY_NOT_FOUND` | Installed methodology directory names |
| `DEP_TARGET_MISSING` | Resolved prompt slugs |

### Suggestion Variable Format

The `{suggestion}` placeholder in error templates expands to one of:

- `Did you mean '{match}'?` — single close match
- `Did you mean one of:\n  • {match1}\n  • {match2}` — multiple close matches
- *(empty string)* — no close match found

When `{suggestion}` is empty, the error message structure omits the suggestion line entirely (no blank line where the suggestion would have been).

### Levenshtein Distance Calculation

- Case-insensitive comparison (all strings lowered before distance calculation)
- Threshold: distance ≤ 2
- If multiple options are within threshold, they are sorted by distance (closest first), then alphabetically for ties
- Maximum 3 suggestions displayed (even if more are within threshold)
