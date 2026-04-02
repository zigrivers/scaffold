---
name: session-analysis
description: Patterns for analyzing Claude Code sessions to discover automation opportunities
topics: [analysis, automation, sessions]
---

# Session Analysis

Expert knowledge for analyzing Claude Code sessions to discover automation opportunities. Covers pattern detection, repeated action identification, and actionable automation recommendations.

## Summary

### Pattern Detection

Review session history for recurring sequences of actions. Look for commands executed multiple times, error-retry cycles, and multi-step manual workflows that could be automated.

### Repeated Action Identification

Categorize repeated actions by type: git workflows, test runs, build commands, file editing patterns, environment setup, and debugging sequences.

### Automation Recommendations

For each discovered pattern, recommend an appropriate automation mechanism: shell aliases, git hooks, Makefile targets, Claude Code hooks, or standalone scripts. Rank by estimated time savings.

## Deep Guidance

### What to Look For

When analyzing a session (or set of sessions), search for these signal types:

**Repeated manual actions:**
- The same command (or close variants) executed 3+ times in a session
- Multi-step sequences performed identically each time (e.g., `git add . && git commit && git push`)
- Copy-paste patterns between files

**Common errors and their fixes:**
- Errors that appear, are diagnosed, and fixed the same way each time
- Lint failures that require the same remediation pattern
- Test failures caused by environment state (not code bugs)

**Workflow bottlenecks:**
- Steps where the agent pauses to think or read documentation
- Long command sequences that could be a single script
- Context switches between directories or tools

**Frequently-used commands:**
- Commands with complex flags that are typed repeatedly
- Commands that are always run together (candidates for chaining)

### Pattern Categories

#### Git Workflows

Common automatable git patterns:

| Pattern | Frequency Signal | Automation |
|---------|-----------------|------------|
| Branch, commit, push, create PR | Every task completion | Makefile target or script |
| Fetch, rebase, resolve, push | Every multi-agent sync | Pre-push hook or script |
| Clean up merged branches | End of sprint/batch | Shell alias or cron |
| Conventional commit formatting | Every commit | Git hook (commit-msg) |

#### Test Runs

| Pattern | Frequency Signal | Automation |
|---------|-----------------|------------|
| Run specific test file during TDD | Continuous during development | Watch mode configuration |
| Run full suite before PR | Every PR creation | Pre-push hook |
| Re-run failed tests after fix | Error-retry cycles | Test runner watch mode |
| Generate test coverage report | Every PR or release | CI pipeline step |

#### Build Commands

| Pattern | Frequency Signal | Automation |
|---------|-----------------|------------|
| Build before testing | Every test cycle | Makefile dependency |
| Rebuild after dependency change | After every `npm install` / `pip install` | Post-install hook |
| Clean build after switching branches | Every branch switch | Git post-checkout hook |

#### File Editing Patterns

| Pattern | Frequency Signal | Automation |
|---------|-----------------|------------|
| Adding boilerplate to new files | Every new file creation | File templates / generators |
| Updating imports after adding a module | Every module creation | Auto-import tooling |
| Adding entries to index/barrel files | Every new export | Code generator or hook |

### Recommendation Types

For each discovered pattern, recommend the most appropriate automation mechanism:

#### Shell Aliases

Best for: frequently-typed commands with complex flags.

```bash
# Example: common git log format
alias gl="git log --oneline --graph --decorate -20"

# Example: common test command
alias mt="make test"
```

**When to recommend:** Single commands used 5+ times per session, no conditional logic needed.

#### Git Hooks

Best for: quality enforcement that should happen automatically at git events.

| Hook | Trigger | Use Case |
|------|---------|----------|
| `pre-commit` | Before every commit | Lint staged files, validate frontmatter |
| `commit-msg` | After writing commit message | Enforce conventional commit format |
| `pre-push` | Before every push | Run test suite, check branch naming |
| `post-checkout` | After branch switch | Reinstall dependencies, clean build artifacts |
| `post-merge` | After merge/pull | Reinstall dependencies if lock files changed |

#### Makefile Targets

Best for: multi-step workflows that combine several commands.

```makefile
# Example: full release workflow
release: check
	@scripts/release.sh

# Example: clean development reset
reset:
	git clean -fd
	npm install
	make build
```

**When to recommend:** 3+ commands always run together, may need conditional logic, team-wide usage.

#### Claude Code Hooks

Best for: automated behaviors tied to Claude Code events.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hook": "echo 'Running command...'"
      }
    ]
  }
}
```

**When to recommend:** Behaviors specific to AI agent workflows, context injection, automated checks during agent execution.

#### Standalone Scripts

Best for: complex workflows with error handling, conditional logic, and user interaction.

**When to recommend:** Workflow has branching logic, needs error recovery, combines multiple tools, or is too complex for a Makefile target.

### Output Format

Present findings as a ranked list of automation opportunities:

```
## Automation Opportunities

### 1. Branch cleanup after task completion
- **Pattern:** Agent runs `git fetch --prune && git branch --merged ...` after every PR merge
- **Frequency:** 4x per session
- **Recommendation:** Add `make clean-branches` Makefile target
- **Time savings:** ~2 min/occurrence → 8 min/session
- **Implementation complexity:** Low (5 min to implement)

### 2. Pre-PR quality check
- **Pattern:** Agent runs `make lint && make test && git push` before every PR
- **Frequency:** 3x per session
- **Recommendation:** Add `make ready` target that chains lint + test + push
- **Time savings:** ~1 min/occurrence → 3 min/session
- **Implementation complexity:** Low (2 min to implement)
```

**Ranking criteria:**
1. Frequency × time-per-occurrence (total time savings)
2. Error reduction potential (automating error-prone steps)
3. Implementation complexity (prefer quick wins)

### Session History Analysis

When analyzing session transcripts or tool call logs:

**Tool call patterns:**
- Count occurrences of each tool
- Identify sequences of tool calls that always appear together
- Flag tool calls that fail and are retried with modifications

**Command patterns:**
- Extract all Bash tool invocations
- Group by command prefix (`git`, `make`, `npm`, etc.)
- Identify commands with identical or near-identical arguments

**Error-retry cycles:**
- Find sequences where a command fails, the agent diagnoses, and retries
- If the same error type appears 3+ times across sessions, it needs a preventive automation
- Common cycle: lint fails → fix → re-lint → passes (automate the fix or add a pre-save hook)

**File access patterns:**
- Track which files are read most frequently
- Identify files that are always read together (candidates for a combined view)
- Flag files that are read but never modified (reference material — could be injected as context)

## See Also

- [dev-environment](../core/dev-environment.md) — Development environment setup
- [claude-md-patterns](../core/claude-md-patterns.md) — CLAUDE.md configuration patterns
