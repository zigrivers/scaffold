---
name: fix-all-review-findings
description: Always fix P0, P1, AND P2 findings from multi-model reviews — never defer P2s
type: feedback
---

Fix ALL P0, P1, and P2 findings from multi-model code reviews before marking a task complete.

**Why:** Ken expects thorough follow-through. Deferring P2s creates tech debt that accumulates across tasks. The standard is: every finding gets addressed, not just the critical ones.

**How to apply:** After each MMR review cycle, compile ALL findings (P0+P1+P2), fix them all, re-verify tests pass, then mark complete. Do not move to the next task with unresolved findings at any severity level.
