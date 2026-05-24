# MMR Rollout Observations

[2026-05-24T10:01:36Z] PR #348 / stopgap Task 10: Gemini repeatedly reported a P0 Bats syntax error claiming `tests/review-wrapper-hash.bats` used `@src/observability/engine/llm-dispatcher.test.ts` instead of `@test`. The file contains `@test`, `bats tests/review-wrapper-hash.bats` executes all 11 tests, `make check-all` passes, CI passes, and Codex reported no finding. Treat as MMR reviewer false positive; investigate Gemini prompt/diff parsing if it recurs.
