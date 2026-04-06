---
name: library-requirements
description: API contract stability, semver commitments, consumer compatibility, and breaking change policy for published libraries
topics: [library, requirements, semver, api-contract, breaking-changes, compatibility]
---

Library requirements differ fundamentally from application requirements: every public API decision becomes a contract with downstream consumers who cannot easily update. Stability, predictability, and clear communication of change are the highest-priority concerns. A library that breaks its consumers silently, or without adequate notice, loses trust permanently.

## Summary

Library requirements must explicitly capture the public API surface and the stability guarantees attached to each part of it. Distinguish stable APIs (semver-protected), experimental APIs (no stability guarantee), and internal APIs (not for external use). Document breaking change policy, minimum supported runtime versions, and peer dependency expectations upfront. Requirements must include consumer use cases — not just feature descriptions — because API design is driven by how consumers will actually call the library.

Key commitments to define:
- Which exports are public and semver-protected
- Which are experimental (`@alpha`, `@beta`, `@experimental`)
- Minimum Node.js / runtime versions supported
- Peer dependency version ranges and their constraints
- Deprecation notice period before removal (recommended: 2+ major versions)
- Supported environments (ESM-only, CJS-only, dual, browser, Node-only, universal)

## Deep Guidance

### API Contract as a First-Class Requirement

The public API surface is a contract. Treat it with the same rigor as a legal agreement. Before writing any code, define:

**What is public:**
```
Public API (semver-protected):
- All named exports from the package root (index.ts)
- All types and interfaces exported from the root
- Constructor signatures, method names, parameter order, return types
- Error types thrown by public methods
- Event names and payload shapes (for event-emitter APIs)
```

**What is explicitly internal:**
```
Internal (not public, no stability guarantee):
- Anything exported from /internal/* paths
- _prefixed exports (by convention)
- Anything documented as "implementation detail"
- Test utilities not in a separate @scope/lib-test-utils package
```

**What is experimental:**
```
Experimental (may change without semver):
- Exports tagged @alpha or @beta in JSDoc
- Features behind feature flags
- Exports from /experimental/* subpaths
```

Define these categories in your requirements document, not in code comments alone.

### Semver Commitments

Semver has precise semantics for libraries. Teams frequently misapply it:

**PATCH (1.0.x):** Bug fixes only. No new APIs. No behavior changes for correct usage. A bug fix that changes observable behavior in a way consumers may depend on is a MINOR or MAJOR change.

**MINOR (1.x.0):** Backward-compatible additions. New exports. New optional parameters (at the end of argument lists). New optional properties on config objects. Extending return types with additional optional fields. New overloads.

**MAJOR (x.0.0):** Any breaking change. This includes:
- Removing or renaming exports
- Changing required parameter types or order
- Narrowing accepted input types
- Widening return types in ways that break type narrowing
- Changing thrown error types
- Dropping support for a previously supported Node.js version
- Changing peer dependency minimum versions
- Behavior changes that violate documented semantics

A common mistake: treating TypeScript type-only changes as "not breaking." Changing a type from `string` to `string | null` is a breaking change for consumers who never account for null.

### Consumer Compatibility Matrix

Requirements must specify the compatibility matrix:

```markdown
## Runtime Support

| Runtime        | Minimum Version | Status     |
|----------------|-----------------|------------|
| Node.js        | 18.0.0          | Supported  |
| Node.js        | 20.0.0          | Supported  |
| Node.js        | 22.0.0          | Supported  |
| Bun            | 1.0.0           | Supported  |
| Deno           | 1.40.0          | Experimental |
| Browser (ESM)  | Modern (ES2020) | Supported  |

## TypeScript Support

Minimum TypeScript version: 5.0
Bundled type definitions: Yes (.d.ts in dist/)
```

Define this matrix in requirements, not after the fact. Dropping Node 18 support is a major version bump — plan it deliberately.

### Peer Dependency Policy

Peer dependencies express "your project must also have X installed." They are fundamentally different from regular dependencies:

**When to use peer dependencies:**
- The library is an extension/plugin of another library (e.g., a React component library — React is a peer)
- The library integrates with a framework the consumer already has
- Bundling the dependency would create duplicate instances (React, any singleton library)

**Peer dependency requirements to document:**
```json
{
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  },
  "peerDependenciesMeta": {
    "react-dom": {
      "optional": true
    }
  }
}
```

State in requirements: which peer deps are required vs. optional, and what happens if the consumer provides an incompatible version.

### Breaking Change Policy

Document your policy before you ship v1:

**Recommended policy:**
1. No breaking changes in patch or minor releases (strict semver)
2. Deprecate before removing: at least one minor release with `@deprecated` JSDoc
3. Major version bump for any breaking change, no matter how small
4. Provide migration guide for every major version bump
5. Maintain previous major version with security patches for N months after next major (define N upfront — 12 months is common)
6. Communicate breaking changes in CHANGELOG.md with migration steps

**Experimental API exception:**
Experimental APIs tagged `@alpha` or `@beta` may break in minor or patch releases. Consumers opt in by using experimental exports. Document this explicitly.

### Use-Case-Driven Requirements

Library requirements fail when they describe features instead of consumer use cases. Write requirements from the consumer's perspective:

**Weak (feature-centric):**
> The library exports a `parse()` function that accepts a string and returns an object.

**Strong (use-case-centric):**
> A consumer building a configuration loader needs to: (1) parse a TOML string into a typed JavaScript object, (2) receive a typed parse error with line/column information if parsing fails, (3) validate the parsed object against a schema and receive typed validation errors. The API must be synchronous (no async) for use in module initialization.

Use cases drive API design. The feature-centric description could be satisfied by dozens of different APIs; the use-case description constrains the design to what actually serves consumers.

### Minimum Viable Requirements Checklist

Before beginning library implementation:

```
[ ] Public API surface enumerated (all exports listed)
[ ] Stability tier assigned to each export (stable / experimental / internal)
[ ] Supported runtime versions documented
[ ] Supported TypeScript versions documented
[ ] Peer dependencies and version ranges documented
[ ] Breaking change policy written
[ ] Deprecation notice period specified
[ ] Distribution format requirements (ESM, CJS, both, IIFE)
[ ] Bundle size budget (if applicable — important for browser libraries)
[ ] Tree-shaking requirement (yes/no and constraints)
[ ] License and attribution requirements
[ ] At least 3 concrete consumer use cases documented
[ ] Error handling contract defined (throws vs. returns Result type)
```

This checklist is non-negotiable for any library that will have external consumers.
