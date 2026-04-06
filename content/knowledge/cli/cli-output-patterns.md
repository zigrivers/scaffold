---
name: cli-output-patterns
description: --json/--format flags, table formatting, machine-readable output, piping conventions, and --quiet flag for CLI tools
topics: [cli, output, json, formatting, tables, piping, stdout, stderr, machine-readable]
---

CLI output is a two-audience problem: humans reading in a terminal, and machines reading in a pipeline. Tools that ignore the machine audience force users to write fragile regex parsers against human-formatted output. Tools that ignore the human audience are inscrutable to debug. The solution is structured output modes with a clear default.

## Summary

### stdout vs stderr Convention

This distinction is non-negotiable for tools expected to participate in pipelines:

- **stdout**: The tool's result — data, transformed content, generated output. This is what `>` captures and `|` pipes.
- **stderr**: Status messages, progress, warnings, errors — anything that is for the human operator, not the downstream process.

```bash
# Correct: status to stderr, data to stdout
my-cli process input.json > output.json 2>errors.log

# If status messages are on stdout, this breaks
my-cli process input.json | jq '.result'   # jq sees status messages, fails to parse
```

Log every informational line, progress update, warning, and error to stderr. Reserve stdout for the tool's actual data output.

### --json Flag

Provide `--json` for any command that produces output a script might consume:

```bash
my-cli status --json
# Output:
{
  "status": "running",
  "pid": 12345,
  "uptime": 3600,
  "version": "2.4.1"
}
```

Rules for `--json` output:
- Always valid JSON — never mix human-readable text with JSON
- Always exit 0 and include an error field for operational errors, rather than outputting JSON to stdout and error text to stdout
- For errors: `{"error": "message", "code": "ERROR_CODE"}` to stderr with non-zero exit
- Arrays for lists, never newline-separated JSON objects (unless using JSON Lines)

**JSON Lines** (`--json-lines` or `--format=jsonl`): For streaming or large list output, emit one JSON object per line. Each line is independently parseable. This is preferred over wrapping everything in a single JSON array when the output can be large.

### --format Flag

For tools that support multiple output formats:

```bash
my-cli list --format=table    # Human-readable table (default)
my-cli list --format=json     # JSON array
my-cli list --format=csv      # CSV with header row
my-cli list --format=tsv      # Tab-separated, no header (script-friendly)
```

When `--format` is provided without a value, default to `json`. When piping to a non-TTY, consider defaulting to `json` automatically.

### Table Formatting

For human-readable tabular output:

- **Node.js**: `columnify`, `cli-table3`, `tabled`
- **Rust**: `comfy-table`, `prettytable-rs`, `tabled`
- **Python**: `tabulate`, `rich.table`

Table rules:
- Align columns consistently; numbers right-aligned, strings left-aligned
- Truncate long values with `...` suffix to preserve column alignment
- Print column headers by default; suppress with `--no-header`
- Respect terminal width (`process.stdout.columns`) — do not print lines that wrap unexpectedly

### --quiet Flag

`--quiet` / `-q` suppresses all non-error output. The tool runs silently and only prints to stderr if something goes wrong:

```bash
my-cli build --quiet && echo "Build OK"  # Only "Build OK" appears on success
```

Quiet mode is essential for cron jobs, shell scripts that run in the background, and CI steps where unrelated output creates noise.

Quiet + --json interaction: `--json` takes precedence. A user who explicitly requests JSON output expects it even with `--quiet`.

## Deep Guidance

### Output Format Decision Matrix

| Scenario | Recommended Format |
|---|---|
| Interactive terminal, human operator | Table or formatted text |
| Piped to another CLI tool | JSON or TSV |
| CI/CD logging | Plain text (no ANSI), or JSON Lines |
| Consumed by a script | JSON with `--json` |
| Large dataset (streaming) | JSON Lines |
| Copy-paste into a document | Plain text or CSV |

### Consistent Field Names

When outputting JSON, use consistent snake_case field names across all subcommands. Define a schema. Breaking changes to JSON output are breaking changes to any script that consumes the tool — treat them with the same care as a library API change.
