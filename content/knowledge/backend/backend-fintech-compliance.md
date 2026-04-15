---
name: backend-fintech-compliance
description: PCI-DSS, SOC 2, SEC/FINRA regulations for consumer/B2B fintech backends; audit trail immutability; data retention; segregation of duties.
topics: [backend, fintech, compliance, pci-dss, soc2, sec, finra, audit-trail, gdpr]
---

Fintech compliance is not a checklist applied at the end — it determines schema design, deployment pipelines, and system boundaries. Most regulations apply based on what a service *touches* (cards, trades, PII), so scope reduction is the single highest-leverage design decision available to engineering. This doc covers the regulatory regimes a typical US/EU fintech encounters, the audit-trail patterns they demand, and concrete implementation choices that keep audits survivable.

## Summary

Which regulations apply depends on what the service handles. Handling card data (PAN, CVV, track data) triggers PCI-DSS v4.0. Storing customer PII, financial records, or operating as a service provider to regulated firms triggers SOC 2 Type II expectations from customers and GLBA obligations (US financial privacy). Executing securities trades or routing orders triggers SEC Rule 17a-4 record retention and FINRA supervisory requirements. Operating in the EU triggers GDPR and — for crypto — MiCA. Serving retail vs institutional customers changes consumer-protection obligations (Reg Z, Reg E, CFPB oversight vs institutional carve-outs).

Compliance cost scales with scope, not with traffic. A service that never sees raw PANs is *out of scope* for most PCI-DSS controls. A microservice that only handles trade metadata (not orders themselves) may be out of the SEC 17a-4 retention perimeter. Practical scope-reduction strategies: tokenize at the edge (Stripe, Marqeta, Basis Theory) so internal services only ever see tokens; keep regulated datastores (ledger, order book, card vault) in dedicated VPCs with narrow IAM; route regulated-data logs to a separate SIEM stream so the main observability stack stays out of scope; design SDK boundaries where PII-sensitive fields are never emitted to general-purpose workers.

Audit trails are the backbone of every fintech regime. Requirements vary but share a common shape: **who did what, to what, when, from where, and with what authorization** — and the log must be tamper-evident and retained for a regulation-specific minimum (SEC 17a-4: 6 years, first 2 easily accessible; SOX: 7 years; GDPR: duration of legitimate-use plus documented retention; PCI-DSS: 1 year minimum, 3 months immediately available). Append-only database tables (enforced via triggers that reject UPDATE/DELETE) satisfy "append-only" but not "tamper-evident" — a DBA with superuser can still alter the table. Tamper-evidence requires either external WORM storage (AWS S3 Object Lock in compliance mode, AWS QLDB, immutable Kafka with retention holds) or cryptographic chaining (each log entry includes the hash of the previous entry, forming a Merkle-like chain verified on read).

Segregation of duties (SoD) is a control, not just good hygiene. For any high-value or irreversible action — wire transfer over a threshold, customer account close, prod DB schema migration, release to production — one human must initiate and a *different* human with appropriate role must approve. SoD failures are the most common SOX/SOC 2 audit findings for fintech engineering orgs. Enforce SoD in the application layer (two-person workflow state machines), in the deploy layer (GitHub required reviewers, protected branches), and in IAM (separate break-glass roles that require another operator to grant). Auditors will ask: "Can the engineer who wrote the code also deploy it to prod? Can the same person initiate and approve a payout?" The answer must be no, with technical enforcement — not policy.

Encryption is assumed baseline: TLS 1.2+ in transit (1.3 preferred), AES-256 at rest via KMS-managed keys (AWS KMS, GCP Cloud KMS, Azure Key Vault, HashiCorp Vault Transit). Field-level encryption for the most sensitive data (SSN, PAN, bank account numbers) in addition to disk encryption, with keys rotated annually. See also `backend-fintech-ledger.md` for double-entry ledger design and `backend-fintech-broker-integration.md` for broker-dealer specific records.

## Deep Guidance

### PCI-DSS Scoping and Tokenization

PCI-DSS v4.0 applies to any system that stores, processes, or transmits cardholder data (CHD) — the Primary Account Number (PAN), cardholder name, expiration date, service code — or sensitive authentication data (full track, CVV, PIN). The cost of compliance is roughly quadratic in the scope of the "cardholder data environment" (CDE): every service inside the CDE needs quarterly ASV scans, annual penetration tests, hardened configurations, FIM, and quarterly access reviews.

**Scope reduction via tokenization** is the dominant pattern. Instead of your application receiving raw PANs, the card is submitted directly from the browser/mobile app to a tokenization provider (Stripe Elements, Braintree Hosted Fields, Marqeta, Basis Theory, Very Good Security) which returns an opaque token. Your backend stores only the token. The card vault is the provider's CDE; your systems are *SAQ A* eligible (the lightest form).

If you must hold PANs directly, consider a dedicated card-vault microservice with its own VPC, its own database, its own deploy pipeline, its own on-call, and narrow IAM so the rest of the org — and most of engineering — is outside the CDE. PAN storage requires strong cryptography with documented key management; display must be truncated (first 6, last 4 at most) unless there's a documented business need.

Never log PANs, CVVs, or track data. Install log-scrubbing middleware that redacts 13–19 digit sequences matching the Luhn check. Same for error reports — configure Sentry/Datadog scrubbing rules and test them.

### SOC 2 Type I vs Type II, and What Engineering Owns

SOC 2 is an attestation framework (not a law) under AICPA TSC (Trust Services Criteria). Type I is a point-in-time assessment of control *design*. Type II assesses *operating effectiveness* over a period (typically 6–12 months). Enterprise customers routinely require Type II before signing.

Trust Services Criteria: **Security (CC1–CC9)** is mandatory; Availability, Confidentiality, Processing Integrity, and Privacy are optional but common. Engineering-touchable criteria:

- **CC6.1–CC6.8 (Logical Access):** IAM, MFA, offboarding, periodic access reviews. Auditors want evidence of MFA enforced, ex-employee access revoked within N days, quarterly access reviews recorded.
- **CC7.1–CC7.5 (System Operations):** Monitoring, incident response, change detection. Expect to produce alerting config, incident postmortems, and evidence that anomalies were detected and triaged.
- **CC8.1 (Change Management):** Every production change must be authorized, tested, and reviewed. Auditors will sample production deploys and ask for the associated PR, reviewer approval, test results, and rollback plan.
- **A1.1–A1.3 (Availability):** Uptime targets, DR tests, backup verification. Run documented DR drills annually.

Automate evidence collection. Tools like Drata, Vanta, Secureframe, Sprinto pull evidence directly from GitHub (PR approvals), AWS (IAM state), Datadog (monitors), HRIS (offboarding). Manual evidence collection at audit time is the most common cause of audit delays.

### SEC Rule 17a-4 and FINRA Supervisory Records

Broker-dealers in the US must retain certain records under SEC Rule 17a-4 (and related 17a-3). Key engineering implications:

- **Retention periods:** Most records — 6 years, with the first 2 years "easily accessible." Customer account records — lifetime of the account plus 6 years. Trade blotters, order tickets, and communications have specific classifications.
- **Format:** Historically WORM (Write-Once-Read-Many) with audit-system-of-records. The 2022 amendment to 17a-4(f) now permits an "electronic record-keeping system" that uses an audit trail to track and verify changes, as an alternative to strict WORM. Either way: the record must be non-rewriteable, non-erasable, and verifiable.
- **Third-party access:** You must designate a third party with the ability to download records if the firm becomes unavailable (D3P letter).
- **Indexing and retrieval:** Records must be indexed and retrievable within a reasonable time for regulatory request.

FINRA Rule 3110 imposes supervisory obligations: written supervisory procedures (WSPs), review of correspondence, review of trade exceptions. Engineering typically supports these via queryable audit logs and exception-reporting pipelines.

Common implementation: trade-event stream written to AWS S3 with Object Lock in **compliance mode** (not governance — compliance mode cannot be disabled even by root) with a 6-year retention period, fed by an immutable Kafka topic, with a parallel queryable index (OpenSearch, Postgres read model) for retrieval. See also `backend-fintech-ledger.md` and `backend-fintech-order-lifecycle.md`.

### Immutable Audit Log Patterns

**Pattern 1: Append-only table with trigger-enforced immutability (Postgres).**

```sql
CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id      UUID NOT NULL,
  actor_type    TEXT NOT NULL,         -- 'user' | 'system' | 'api_key'
  action        TEXT NOT NULL,         -- 'order.submit' | 'account.close'
  resource_type TEXT NOT NULL,
  resource_id   TEXT NOT NULL,
  request_id    UUID NOT NULL,
  ip_address    INET,
  user_agent    TEXT,
  payload       JSONB NOT NULL,
  prev_hash     BYTEA NOT NULL,        -- hash of previous row's row_hash
  row_hash      BYTEA NOT NULL         -- hash of this row's content + prev_hash
);

CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC;
```

Triggers prevent UPDATE/DELETE via the application path. A DBA with BYPASSRLS or superuser can still mutate — which is why tamper-evidence needs cryptographic chaining or external WORM.

**Pattern 2: Hash-chain computation for tamper evidence.**

```typescript
import { createHash } from 'node:crypto';

function rowHash(prevHash: Buffer, row: AuditRow): Buffer {
  const canonical = JSON.stringify({
    occurredAt: row.occurredAt.toISOString(),
    actorId: row.actorId,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    payload: row.payload, // must be canonicalized (sorted keys)
  });
  return createHash('sha256').update(prevHash).update(canonical).digest();
}

// Verification: walk the chain, recompute each hash, compare to stored row_hash.
// Any mutation anywhere in the chain invalidates all subsequent hashes.
// Publish the latest root hash daily (to an external WORM store, or public
// notary like OpenTimestamps) so even a full-DB rewrite is detectable.
```

**Pattern 3: External WORM.** AWS QLDB provides a managed ledger with cryptographic verification built in (but note AWS announced QLDB end-of-support in 2025; current guidance is Aurora PostgreSQL with application-layer chaining). Immutable Kafka (with compaction disabled and retention set to forever) plus S3 Object Lock in compliance mode is the more durable path today.

### Tokenization and Scope-Reduction Boundary

```text
// Scope-reduction sequence — card capture via hosted fields
//
//   Browser                Payment Provider            Your Backend
//     |                        (CDE)                      (out of CDE)
//     |----- PAN + CVV ------->|                           |
//     |                        |-- vault + tokenize ------>|
//     |                        |                           |
//     |<-- token (tok_abc) ----|                           |
//     |------------ token ---------------------------------|
//     |                                                    |
//     |                                  [store token, last4, brand]
//     |                                  [never sees raw PAN]
```

The boundary is enforced by: (a) hosted fields JavaScript that POSTs directly to the provider, (b) CSP and network rules that prevent your backend from reaching card-network endpoints directly, (c) log scrubbing, (d) an SAQ A attestation that documents you never touch CHD.

### Encryption-at-Rest and In-Transit Expectations

- **In transit:** TLS 1.2 minimum (1.3 preferred). Internal service-to-service: mutual TLS or a service mesh (Istio, Linkerd, Consul Connect) that provides mTLS. No plaintext — even on private networks — for regulated data.
- **At rest:** Disk encryption (EBS, RDS, S3 SSE) is the baseline but not sufficient for the most sensitive data. Add field-level encryption for SSN, PAN, bank account numbers, MFA seeds. Use envelope encryption: data encryption keys (DEKs) wrap each record, KMS holds the key-encryption key (KEK). AWS KMS, GCP Cloud KMS, Azure Key Vault, or HashiCorp Vault Transit all support this pattern.
- **Key rotation:** Annual minimum for KEKs. DEKs rotate via re-encryption on access patterns. Document the rotation runbook — auditors will ask.
- **Backups:** Encrypted with the same rigor as primary data. Test restore quarterly, document the result.

### Data Residency and Localization

EU GDPR, UK GDPR, India DPDP, Brazil LGPD, and increasingly US state laws (California CCPA/CPRA, Colorado CPA) impose data-locality and cross-border-transfer constraints. Design choices:

- **Region-per-tenant:** A tenant lives in exactly one region; all their data (primary DB, backups, caches, search indexes, logs) stays in that region. Route requests by tenant → region mapping at the edge (Cloudflare Workers, AWS Global Accelerator, route-53 geolocation).
- **Partition keys include region:** So you can evacuate a region by range-scanning the partition map.
- **No global secondary indexes that span regions.** That includes search indexes, analytics warehouses, and audit aggregators.
- **Document your data-flow map.** GDPR Article 30 records of processing activities require it. Keep it in-repo and generated from code where possible (schema annotations → flow map).

Retrofitting region isolation after launch is 10x the cost of building it in. If there's any chance you'll serve EU customers, design for it on day one.

### Change-Management Evidence (SOC 2 CC8.1)

Your CI/CD pipeline is auditor-facing. For every production deploy, auditors want to see:

- **Artifact provenance:** The exact commit SHA, the container digest (sha256), the builder identity. SLSA Level 2+ provenance (via GitHub Actions OIDC, Sigstore cosign) makes this cryptographically verifiable.
- **Approval trail:** PR with required reviewers, required status checks (tests, security scans), branch protection enforced. No direct pushes to main. GitHub's audit log captures this.
- **Test evidence:** Test results archived per deploy (JUnit XML, coverage report) and tied to the deploy via the commit SHA.
- **Rollback capability:** Documented procedure, tested in production at least annually. Include automated rollback on health-check failure.
- **Deploy record:** Who triggered, what artifact, when, to what environment, what configuration changes. Deploy tools (ArgoCD, Spinnaker, GitHub Deployments) produce this natively.

Separate the CI identity from the CD identity. The CI identity can build and sign; only the CD identity (with stricter controls) can deploy to prod. This is SoD at the pipeline layer.

### Known Pitfalls

- **Secrets in logs.** A developer logs `console.log(req.headers)` including `Authorization`. Prevention: structured-logging middleware with an allowlist of fields, deny-list of headers (Authorization, Cookie, X-API-Key), unit tests asserting redaction.
- **Debug-mode leaks.** Stack traces, `DEBUG=*`, SQL echo — off in production. Verify via a smoke test in the deploy pipeline.
- **PII in error reports.** Sentry/Datadog by default captures request bodies. Configure beforeSend/scrubbing for known PII field names; validate with synthetic PII in staging.
- **Background workers bypassing request-context audit hooks.** A cron job that updates account balances without writing to `audit_log` creates a compliance gap. Audit-log writes must live in the domain layer (on the entity mutation), not in HTTP middleware.
- **Shadow datastores.** Read replicas, BI warehouses, and ML feature stores often get regulated data without inheriting the controls of the primary store. Every copy of the data must inherit the same retention, access, and encryption rules.
- **Third-party SaaS with unaudited access.** Customer-support tools (Intercom, Zendesk), analytics (Segment, Amplitude), and AI assistants can exfiltrate PII. Gate every new SaaS through a vendor-review process with a DPA.
- **Employee access without audit.** Support staff viewing customer accounts must log every view (access-log table, reason code). This is a common SOC 2 finding and GLBA Safeguards Rule expectation.

See also `backend-fintech-ledger.md`, `backend-fintech-testing.md`, and `backend-fintech-observability.md`.
