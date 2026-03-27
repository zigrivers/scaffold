---
description: "Operations runbook review for completeness and quality"
long-description: "Performs a structured multi-pass review of the operations runbook, targeting failure modes specific to operations and deployment artifacts. Covers deployment strategy, rollback procedures, monitoring coverage, alerting thresholds, runbook scenarios, dev environment parity, and DR/backup coverage."
---

Perform a structured multi-pass review of the operations runbook, targeting failure modes specific to operations and deployment artifacts. Follow the review methodology from review-methodology knowledge base.

## Mode Detection

Check if `docs/reviews/review-operations.md` already exists:

**If the file does NOT exist -> FRESH MODE**: Proceed with a full review from scratch.

**If the file exists -> RE-REVIEW MODE**:
1. Read the prior review report and its findings
2. Check which findings were addressed in the updated runbook
3. Run all review passes again on the current operations runbook
4. Focus on: remaining unresolved findings, regressions from fixes, and any new deployment or monitoring sections added since the last review
5. Update the review report rather than replacing it — preserve the fix history

## Review Process

### Step 1: Read the Artifact

Read `docs/operations-runbook.md` completely. Also read `docs/system-architecture.md` for deployment and infrastructure coverage cross-reference.

### Step 2: Multi-Pass Review

Execute 7 review passes. For each pass, re-read the artifact with only that lens, document all findings with severity (P0-P3), and provide specific fix recommendations.

**Pass 1: Deployment Strategy Completeness**
Trace the full deploy lifecycle from merged PR to running in production: build, test, staging, production deploy, post-deploy verification. Verify each stage has a clear trigger (manual/automatic), success criteria, and failure behavior. Check environment progression (dev -> staging -> production). Verify deployment artifacts are specified. Check database migration integration timing. Verify deployment credentials, access controls, and approval requirements.

**Pass 2: Rollback Procedures**
For each deployment type (code, database migration, configuration, infrastructure), verify a rollback procedure exists. Check code rollback mechanism (redeploy previous version, revert container tag). Check database rollback addresses reversible and irreversible migrations separately. Verify rollback time estimates. Check partial deployment rollback (2 of 5 services deployed before failure). Verify data consistency during rollback.

**Pass 3: Monitoring Coverage**
Verify infrastructure metrics: CPU, memory, disk, network, container health. Verify application metrics: request rate, error rate, response time (p50, p95, p99), active connections. Check business metrics: transaction volume, user signups, conversion rates. Verify every architecture component has at least one monitored metric. Check dependency monitoring (databases, third-party APIs, message queues). Verify error categorization (4xx vs 5xx, timeout vs validation).

**Pass 4: Alerting Thresholds**
For each alert, check the threshold has rationale (baseline data, SLA, capacity limits). Verify severity levels: page (wake someone), warn (next business day), info (review). Check page-level alerts are for user/revenue-impacting conditions only. Verify de-duplication and grouping (server flap = one alert, not hundreds). Check alert routing and on-call rotation. Verify alert testing procedures.

**Pass 5: Runbook Scenarios**
List most likely failures: database connection loss, external API outage, OOM, certificate expiration, disk full, deployment failure, high latency. For each, verify a runbook entry with: symptoms, diagnosis steps, resolution steps, verification, and post-mortem template. Verify commands are specific and actionable ("run `kubectl logs ...`" not "check the logs"). Check escalation paths and tool/dashboard references.

**Pass 6: Dev Environment Parity**
Compare dev stack to production: same database engine, message queue, cache, auth provider. Check documented deviations with implications noted. Verify local setup instructions are complete (clone to running system). Check seed data and test fixtures. Verify environment variable and secrets management for local dev. Check containerization parity.

**Pass 7: DR/Backup Coverage**
Verify backup strategy covers all persistent stores: primary database, file storage, persistent queues, config stores. Check backup frequency aligns with RPO. Verify backup restoration is documented and tested. Check DR strategy (multi-region, failover, warm standby, cold recovery). Verify RTO and RPO are specified. Check backup encryption and key storage. Verify DR testing schedule.

### Step 3: Fix Plan

Present all findings in a structured table:

| # | Severity | Pass | Finding | Location |
|---|----------|------|---------|----------|
| OPS-001 | P0 | Pass 1 | [description] | [section] |
| OPS-002 | P1 | Pass 3 | [description] | [section] |

Then group related findings into fix batches:
- **Same root cause**: Multiple findings from one missing deployment stage — fix once
- **Same section**: Findings in the same runbook section — single editing pass
- **Same severity**: Process all P0s first, then P1s — do not interleave

For each fix batch, describe the fix approach and affected runbook sections.

Wait for user approval before executing fixes.

### Step 4: Execute Fixes

Apply approved fixes to `docs/operations-runbook.md`. For each fix, verify it does not break alignment with architecture or introduce inconsistencies with deployment infrastructure.

### Step 5: Re-Validate

Re-run the specific passes that produced findings. For each:
1. Verify the original findings are resolved
2. Check the fix did not break alignment with architecture or introduce inconsistencies with deployment infrastructure
3. Check for monitoring gaps or rollback procedure issues introduced by the fix

Re-validation is complete when all P0 and P1 findings are resolved and no new P0/P1 findings emerged. Log any new P2/P3 findings but do not block progress.

Write the full review report to `docs/reviews/review-operations.md` including: executive summary, findings by pass, fix plan, fix log, re-validation results, and downstream readiness assessment.

## Multi-Model Validation (Depth 4-5)

**Skip this section at depth 1-3. MANDATORY at depth 4+.**

At depth 4+, dispatch the reviewed artifact to independent AI models for additional validation. This catches blind spots that a single model misses. Follow the invocation patterns and auth verification in the `multi-model-dispatch` skill.

**Previous auth failures do NOT exempt this dispatch.** Auth tokens refresh — always re-check before each review step.

1. **Verify auth**: Run `codex login status` and `NO_BROWSER=true gemini -p "respond with ok" -o json 2>/dev/null` (exit 41 = auth failure). If auth fails, tell the user to run `! codex login` or `! gemini -p "hello"` for interactive recovery. Do not silently skip.
2. **Bundle context**: Include the reviewed artifact + upstream references (listed below)
3. **Dispatch**: Run each available CLI independently with the review prompt
4. **Reconcile**: Apply dual-model reconciliation rules from the skill
5. **Apply fixes**: Fix high-confidence findings; present medium/low-confidence findings to the user

**Upstream references to include in the review bundle:**
- `docs/operations-runbook.md` (the reviewed artifact)
- `docs/system-architecture.md`
- `docs/tech-stack.md`
- Focus areas: incomplete deployment flows, weak rollback strategies, missing monitoring

If neither CLI is available, perform a structured adversarial self-review instead: re-read the artifact specifically looking for issues the initial review passes might have missed.

## Process

1. Read `docs/operations-runbook.md` and `docs/system-architecture.md`
2. Execute all 7 review passes sequentially — do not combine passes
3. Categorize every finding by severity (P0-P3) using the review methodology
4. Create fix plan grouped by root cause and severity
5. Present fix plan and wait for user approval
6. Apply approved fixes
7. Re-validate by re-running affected passes
8. (Depth 4+) Dispatch multi-model validation — verify CLI auth, bundle context, dispatch, reconcile findings, apply high-confidence fixes
9. Write review report to `docs/reviews/review-operations.md`

## After This Step

When this step is complete, tell the user:

---
**Review complete** — Operations runbook review findings documented in `docs/reviews/review-operations.md`.

**Next:** Run `/scaffold:security` to create the security review informed by the reviewed operations runbook.

**Pipeline reference:** `/scaffold:prompt-pipeline`

---
