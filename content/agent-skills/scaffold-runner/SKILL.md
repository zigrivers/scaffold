---
name: scaffold-runner
description: Use for Scaffold pipeline status, running steps or batches, rework, setup, and Scaffold tools.
---

<!-- lean:start -->
# Scaffold Runner

Use this for requested Scaffold operations. A `.scaffold/` directory alone does
not turn an ordinary coding request into a pipeline run.

Reuse the current request, approved scope, recorded decisions, and session
preferences. Ask for unresolved consequential choices or explicit approval gates;
make routine implementation choices from project context. Continue authorized
work after recoverable errors are repaired. Preserve required checks and
security boundaries.

Pipeline execution is sequential (ADR-021): one stateful step at a time. Use the
CLI to check eligibility, assemble prompts, and record state. Never bypass its
prerequisites. Build steps and utility tools are stateless: do not call
`scaffold complete` for them.

For status, run `scaffold status` (`--compact` for remaining work); for next
steps, run `scaffold next`; for available tools, run `scaffold list --section tools`.
These queries need no execution manual. For other requested operations, use the
router in `.agents/skills/scaffold-runner/SKILL.md` when reading this as an
AGENTS.md or Cursor rule.
<!-- lean:end -->

## Choose the requested operation

Load only the matching reference, plus a linked procedure when that phase starts.
Paths in this table are relative to this skill directory.

| Request | Read / do |
|---|---|
| Initialize or adopt a project | Use the bootstrap rules below. |
| Run one pipeline step, build step, or utility tool | [Execution](references/execution.md): eligibility, prompt assembly, decisions, completion, and session preferences. |
| List tools, navigate, reset, skip, inspect depth or applicability | [Navigation](references/navigation.md). Simple status/next queries use the commands above directly. |
| Multi-model code or design review | [Review routing](references/reviews.md); retain the selected review contract and gates. |
| Run or re-run a batch | [Batches](references/batches.md), then execution for each step. Show the resolved list and use existing authorization; preserve explicitly requested per-step confirmation. |
| Start or resume rework | [Rework](references/rework.md), then execution for each step. Keep the configured phase pauses and fresh-mode deletion boundary. |
| An operation fails | [Recovery](references/recovery.md). Diagnose and repair within scope; pause only dependent work at a real blocker. |

## Bootstrap

When setup is requested and `.scaffold/` is absent, choose from the directory:

- Empty or brand-new directory: `scaffold init`.
- Existing source code or docs: `scaffold adopt`. It initializes config/state and
  selects `brownfield`; it renders a plan and writes nothing until `--apply`
  with the approved `--plan-key`. Keep that plan approval gate.

Never run `scaffold init` before `scaffold adopt` on an existing codebase.
Do not change methodology/config unless requested, invent pipeline steps, or
execute unrelated rework just because a session file exists. Recover preferences
from explicit conversation or approved project records; do not invent answers
from an unavailable prior session. For the full CLI surface, use
`scaffold guides cli` or `scaffold guides pipeline` when needed.
