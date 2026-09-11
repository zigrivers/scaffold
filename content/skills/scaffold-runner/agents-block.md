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
