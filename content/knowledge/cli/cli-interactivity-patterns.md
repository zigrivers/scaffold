---
name: cli-interactivity-patterns
description: Prompt libraries, spinners, progress bars, color output, TTY detection, and graceful degradation for piped output
topics: [cli, interactivity, prompts, spinners, progress-bars, tty-detection, color, chalk]
---

Interactive CLI features — prompts, spinners, progress bars, colored output — exist to help humans. They must never obstruct machines. The guiding principle is graceful degradation: detect the execution context and silently disable interactive features when they would break automation.

## Summary

### TTY Detection

Every interactive feature must be gated on TTY detection:

```javascript
// Node.js
const isInteractive = process.stdout.isTTY && process.stdin.isTTY;
```

```rust
// Rust
use std::io::IsTerminal;
let is_interactive = std::io::stdout().is_terminal();
```

```python
# Python
import sys
is_interactive = sys.stdout.isatty()
```

Non-TTY contexts include: piped output (`my-cli | grep`), redirected output (`my-cli > out.txt`), CI environments (GitHub Actions, Jenkins), and SSH sessions without a pseudo-TTY. In these contexts: suppress spinners, suppress color, suppress prompts (or fail with a clear error if input is required).

### Prompt Libraries

For wizard-style input collection:

- **Node.js**: `@inquirer/prompts` (modern, ESM, individual prompt imports), `prompts` (lightweight, no class hierarchy), `inquirer` (classic, comprehensive)
- **Rust**: `dialoguer` (composable prompts: text, select, confirm, multi-select), `requestty`
- **Python**: `questionary` (rich prompts), `click.prompt()` / `click.confirm()` (built into click)

Prompt patterns:
- **Text input**: Free-form string with optional validation and default
- **Select**: Choose one from a list (arrow keys)
- **Multi-select**: Choose multiple from a list (space to toggle)
- **Confirm**: Yes/no boolean
- **Password**: Hidden input (no echo)

Always provide `--yes` / `--no-interactive` flags that skip prompts with defaults. In CI, any tool requiring interactive prompts without this escape hatch is broken.

### Spinners

Spinners indicate ongoing background work without a known duration:

- **Node.js**: `ora` (most popular, customizable), `nanospinner` (tiny), `cli-spinners` (spinner frames only)
- **Rust**: `indicatif` (spinners + progress bars)
- **Python**: `halo`, `yaspin`

Rules:
- Only render spinners when `stdout.isTTY` is true
- Spinners output to stderr, not stdout, so pipe chains are not polluted
- Clear the spinner line before printing final output — users should not see spinner characters mixed with results
- On completion, replace spinner with a final status line: `✓ Built in 2.4s`

### Progress Bars

Progress bars are appropriate when the total number of steps is known:

```
Building assets ████████████████░░░░ 80% (240/300 files)
```

- Show percentage, current/total count, and elapsed or estimated remaining time
- Update at most 10–20 times per second — more frequent updates cause flicker without adding information
- Collapse to a single completion line when done
- For network transfers, show bytes downloaded and transfer rate

### Color Output

- **Node.js**: `chalk` (most popular), `picocolors` (tiny, fast), `kleur`
- **Rust**: `colored`, `owo-colors`, `nu-ansi-term`
- **Python**: `rich` (full formatting library), `colorama` (Windows ANSI compatibility), `termcolor`

Color conventions:
- **Green**: Success, completion
- **Yellow/Amber**: Warning, deprecation
- **Red**: Error, failure
- **Cyan/Blue**: Informational, prompts
- **Dim/Gray**: Secondary information, timestamps

## Deep Guidance

### Graceful Degradation Checklist

Before shipping any interactive feature, verify it degrades correctly:

```bash
# Test pipe context
my-cli build | cat

# Test redirected output
my-cli build > output.txt

# Test CI simulation
CI=true my-cli build

# Test NO_COLOR
NO_COLOR=1 my-cli build

# Test non-interactive (should not hang waiting for input)
echo "" | my-cli init
```

If any of these scenarios hangs, errors with formatting artifacts, or corrupts stdout with escape codes, the interactive feature is not correctly gated.
