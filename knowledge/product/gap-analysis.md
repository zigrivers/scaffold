---
name: gap-analysis
description: Systematic approaches to finding gaps in requirements and specifications
topics: [gap-analysis, requirements, completeness, ambiguity, edge-cases]
---

# Gap Analysis

Gap analysis is the systematic process of finding what is missing from a set of requirements or specifications. A gap is anything that an implementing team would need to know but that the document does not tell them. Gaps are not errors (things stated incorrectly) — they are omissions (things not stated at all).

## Systematic Analysis Approaches

### Section-by-Section Review

Walk through the document section by section, asking structured questions at each:

**For each feature description:**
1. Who uses this feature? (Is the actor specified?)
2. What triggers this feature? (Is the entry point clear?)
3. What are the inputs? (Are all fields listed? With types and constraints?)
4. What is the happy path output? (Is the success response defined?)
5. What are the error outputs? (Is every failure mode addressed?)
6. What state changes? (What data is created, updated, or deleted?)
7. What are the preconditions? (What must be true before this feature can execute?)
8. What are the postconditions? (What is guaranteed to be true after execution?)
9. Are there rate limits, permissions, or visibility constraints?
10. Is this feature idempotent? (What happens if it runs twice?)

**For each data entity:**
1. What are all the fields? (Are any missing?)
2. What are the field types? (String, number, enum, date, etc.)
3. Which fields are required vs optional?
4. What are the valid ranges or patterns for each field?
5. What happens when a field is null vs absent vs empty?
6. How is this entity created? Updated? Deleted?
7. What relationships does it have with other entities?
8. What uniqueness constraints exist?

**For each user flow:**
1. What is the starting state?
2. What are all the steps?
3. At each step, what can go wrong?
4. At each step, can the user go back?
5. What happens if the user abandons the flow mid-way?
6. What happens if the user's session expires during the flow?
7. What does the user see while waiting for asynchronous operations?

### Cross-Reference Checking

Compare different sections of the same document (or different documents) for consistency and completeness:

1. **Feature list vs. detail sections** — Is every listed feature described in detail? Are there detail sections for unlisted features?
2. **Personas vs. features** — Does every persona have at least one feature that addresses their primary need? Does every feature map to a persona?
3. **NFRs vs. features** — Do performance requirements specify which features they apply to? Are there features without any NFR coverage?
4. **Constraints vs. features** — Do constraints affect feature design? Is the impact documented?
5. **Success criteria vs. features** — Can every success criterion be measured by at least one feature? Are there features that contribute to no success criterion?
6. **Error scenarios vs. features** — Does every feature with user input have error handling? Does every feature with external dependencies have failure handling?

### Edge Case Enumeration

Systematically explore the boundaries of each feature:

**Boundary conditions:**
- Minimum values (0, empty string, empty list, null)
- Maximum values (max integer, max string length, max file size)
- Just over/under limits (101 characters for a 100-char limit)
- Unicode edge cases (emoji, RTL text, zero-width characters)
- Time zone boundaries (DST transitions, UTC offset changes)
- Date boundaries (leap years, month boundaries, year boundaries)

**State boundaries:**
- First use (no data exists)
- Normal use (typical data volume)
- Heavy use (large data volumes, many records)
- Degraded state (partial data, corrupt data, missing references)
- Recovery state (after a crash, after a failed migration, after restoring from backup)

**Concurrency boundaries:**
- Two users editing the same record
- Two users claiming the same resource
- Rapid successive submissions (double-click)
- Long-running operations interrupted by newer operations
- Race conditions between create and delete

**Network boundaries:**
- Slow connection (high latency)
- Intermittent connection (requests that time out mid-way)
- Offline mode (if applicable)
- Partial response (connection drops mid-transfer)

## Ambiguity Detection

An ambiguity is a statement that could reasonably be interpreted in more than one way. Ambiguities are gaps because the implementing team must guess which interpretation is correct.

### Types of Ambiguity

**Lexical ambiguity** — A word has multiple meanings.
- "The system should store the user's records." (Medical records? Usage records? Database records?)
- "Notify the admin when a user is blocked." (Email notification? In-app notification? Both?)

**Structural ambiguity** — The sentence structure allows multiple readings.
- "Users can view reports shared by team members and partners." (Reports shared by [team members and partners]? Or [reports shared by team members] and [partners]?)
- "The system sends email when the order is completed or cancelled and the user has opted in." (Opted in to what — both notifications or just cancellation?)

**Scope ambiguity** — The boundary of a requirement is unclear.
- "Support all modern browsers." (Which ones? What version threshold?)
- "The search should return relevant results." (What defines relevant? Ranked how?)

**Referential ambiguity** — Pronouns or references are unclear.
- "When the admin approves the user's request, they receive a notification." (Who receives — the admin or the user?)

### Detection Technique

For each requirement statement:
1. Read it once and form an interpretation.
2. Deliberately try to form a DIFFERENT valid interpretation.
3. If you can, the statement is ambiguous.
4. Rewrite the statement to be unambiguous, or flag it as needing clarification.

**Example:**
- Original: "The system should validate user input."
- Interpretation 1: Client-side validation only (JavaScript form validation)
- Interpretation 2: Server-side validation only (API-level validation)
- Interpretation 3: Both client-side and server-side validation
- Finding: Ambiguous. Specify where validation occurs.
- Rewrite: "The system validates user input on both the client (inline feedback during form entry) and the server (API returns 422 with field-level error messages)."

### Ambiguity Severity Levels

- **Critical** — Ambiguity about core functionality. Different interpretations lead to fundamentally different implementations.
- **Major** — Ambiguity about behavior details. Different interpretations lead to different user experiences.
- **Minor** — Ambiguity about edge cases or formatting. Different interpretations are cosmetically different.

## Edge Case Discovery

### Error Scenarios

For each operation, systematically enumerate error scenarios:

**Input errors:**
- Missing required fields
- Fields with wrong types
- Fields with values outside valid ranges
- Fields with malicious content (SQL injection, XSS)
- Duplicate submissions

**State errors:**
- Operating on a deleted entity
- Operating on an entity in an unexpected state
- Stale data (entity was modified since last read)

**Permission errors:**
- Unauthenticated access
- Authenticated but unauthorized access
- Access to another user's data
- Elevated privilege operations by non-admin users

**External dependency errors:**
- Payment processor unavailable
- Email service unavailable
- Third-party API returns unexpected response
- Third-party API rate limit exceeded
- DNS resolution failure

**Resource errors:**
- Database connection pool exhausted
- Disk full
- Memory exhausted
- File size exceeds limit

### Boundary Conditions

For each quantitative constraint, test the boundaries:

```
Constraint: Username must be 3-30 characters
Test cases:
- 0 characters (empty) → error
- 1 character → error
- 2 characters → error
- 3 characters → success (minimum boundary)
- 15 characters → success (normal)
- 30 characters → success (maximum boundary)
- 31 characters → error
- 1000 characters → error (ensure no buffer overflow)
```

### Concurrent Access

For each shared resource:
1. What happens when two users read simultaneously? (Usually fine)
2. What happens when two users write simultaneously? (Last write wins? Merge? Reject?)
3. What happens when one user reads while another writes? (Stale data? Locked? Consistent?)
4. What happens when two users try to claim the same unique resource? (First wins? Queue? Error?)

## NFR Gap Patterns

### Performance Gaps

- Response time specified for reads but not writes
- Average response time specified but not percentiles (p50 can be 100ms while p99 is 10 seconds)
- Page load time specified but not API response time
- No specification for batch operations (import 10,000 records — how long is acceptable?)
- No specification for search response time (full-text search is often slower than CRUD)

### Security Gaps

- Authentication mechanism specified but not session management (timeout, rotation, revocation)
- Authorization model specified but not data isolation (can user A see user B's data?)
- Encryption at rest mentioned but not encryption in transit (or vice versa)
- Password policy not specified (minimum length, complexity, rotation)
- No mention of rate limiting or brute force protection
- No mention of audit logging (who did what when)

### Accessibility Gaps

- WCAG level stated but not specific compliance areas (keyboard navigation, screen reader support, color contrast)
- No mention of focus management for dynamic content (modals, notifications, form errors)
- No mention of alt text requirements for images
- No mention of motion reduction for users who prefer reduced motion

### Scalability Gaps

- Current scale specified but not growth projections
- User count specified but not data volume (10,000 users with 1 record each is different from 10,000 users with 1 million records each)
- No specification for what degrades gracefully under load (versus what must maintain full quality)

## Contradiction Detection

Contradictions are requirements that cannot both be true simultaneously.

### Detection Technique

1. Group requirements by topic (authentication, data handling, UI behavior, etc.).
2. Within each group, compare every pair of requirements.
3. Ask: "Can these both be true at the same time?"

### Common Contradiction Patterns

**Real-time vs. batch:**
- "Display real-time inventory counts" AND "Update inventory via nightly batch job"
- These contradict unless there is a mechanism to handle the 24-hour stale window.

**Simple vs. comprehensive:**
- "The interface should be simple and uncluttered" AND "Display all order details on one page"
- Simplicity and completeness often conflict. Which takes priority?

**Flexible vs. consistent:**
- "Allow users to customize their workflow" AND "Ensure all users follow the standard process"
- Customization and standardization conflict. What is the scope of customization?

**Fast vs. thorough:**
- "API responses under 100ms" AND "Validate against all business rules on every request"
- Complex validation may make 100ms impossible. Which gives?

### Resolution

For each contradiction, the PRD should clarify:
1. Which requirement takes priority?
2. Under what conditions does each apply?
3. Is there a design that satisfies both, and what are the trade-offs?

## Output Format

### Gap Report Structure

```markdown
## Gap Analysis Report

### Summary
- Total gaps found: [N]
- Critical: [N] (blocks implementation)
- Major: [N] (impacts quality)
- Minor: [N] (cosmetic or edge case)

### Critical Gaps
1. [Gap description]
   - **Location:** [Section/feature]
   - **Impact:** [What happens if not resolved]
   - **Recommended resolution:** [What to add or clarify]

### Major Gaps
...

### Minor Gaps
...

### Ambiguities
1. [Statement as written]
   - **Possible interpretations:** [list]
   - **Recommended clarification:** [suggested rewrite]

### Contradictions
1. [Requirement A] vs [Requirement B]
   - **Analysis:** [why they conflict]
   - **Recommended resolution:** [which takes priority and why]

```

## When to Use Gap Analysis

- **After PRD creation** — Find gaps before domain modeling begins. Cheapest time to fix.
- **After each documentation phase** — Incremental gap analysis as specifications become more detailed.
- **After requirements change** — Any PRD modification should trigger gap analysis of affected features.
- **Before implementation** — Final gap analysis of the complete specification set.
