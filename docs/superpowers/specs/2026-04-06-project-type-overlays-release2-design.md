# Project-Type Overlays Release 2 Design Spec

**Date:** 2026-04-06
**Status:** Draft
**Scope:** Release 2 — library and mobile-app overlays

## Goal

Add overlay support for `library` and `mobile-app` project types following the patterns established in Release 1 (v3.7.0).

## Config Types

### LibraryConfig (5 fields)

```typescript
export const LibraryConfigSchema = z.object({
  visibility: z.enum(['public', 'internal']),
  runtimeTarget: z.enum(['node', 'browser', 'isomorphic', 'edge']).default('isomorphic'),
  bundleFormat: z.enum(['esm', 'cjs', 'dual', 'unbundled']).default('dual'),
  hasTypeDefinitions: z.boolean().default(true),
  documentationLevel: z.enum(['none', 'readme', 'api-docs', 'full-site']).default('readme'),
}).strict()
```

- **Required anchor**: `visibility` (no default)
- **Cross-field warning**: `visibility: 'public'` + `documentationLevel: 'none'` (warning, not error)

### MobileAppConfig (4 fields)

```typescript
export const MobileAppConfigSchema = z.object({
  platform: z.enum(['ios', 'android', 'cross-platform']),
  distributionModel: z.enum(['public', 'private', 'mixed']).default('public'),
  offlineSupport: z.enum(['none', 'cache', 'offline-first']).default('none'),
  hasPushNotifications: z.boolean().default(false),
}).strict()
```

- **Required anchor**: `platform` (no default)
- **No cross-field validations** — all combinations are valid

### ProjectConfig Extension

```typescript
export interface ProjectConfig {
  // ... existing fields ...
  libraryConfig?: LibraryConfig
  mobileAppConfig?: MobileAppConfig
}
```

### .superRefine() Additions

```typescript
if (data.libraryConfig !== undefined && data.projectType !== 'library') {
  ctx.addIssue({ path: ['libraryConfig'], code: 'custom',
    message: 'libraryConfig requires projectType: library' })
}
if (data.mobileAppConfig !== undefined && data.projectType !== 'mobile-app') {
  ctx.addIssue({ path: ['mobileAppConfig'], code: 'custom',
    message: 'mobileAppConfig requires projectType: mobile-app' })
}
```

## CLI Flags

### Library flags (5):
```
--lib-visibility        public|internal
--lib-runtime-target    node|browser|isomorphic|edge
--lib-bundle-format     esm|cjs|dual|unbundled
--lib-type-definitions  (boolean)
--lib-doc-level         none|readme|api-docs|full-site
```

### Mobile-app flags (4):
```
--mobile-platform           ios|android|cross-platform
--mobile-distribution       public|private|mixed
--mobile-offline            none|cache|offline-first
--mobile-push-notifications (boolean)
```

Auto-detection: `--lib-*` → `--project-type library`, `--mobile-*` → `--project-type mobile-app`

## Wizard Questions

Same flag-skip pattern as Release 1. Required anchor fields throw early under `--auto`:
- Library: "What is the library's visibility?" (public/internal)
- Mobile: "What platform are you targeting?" (ios/android/cross-platform)

Auth-style distinct phrasing not needed (no auth fields in these types).

## Overlay Structure

Knowledge-first, step-light — same as Release 1.

### Library Knowledge Entries (~12 files in `content/knowledge/library/`):
- `library-requirements` — API contract stability, semver commitments, consumer compatibility
- `library-conventions` — Public API naming, deprecation patterns, changelog conventions
- `library-project-structure` — src/lib, examples/, docs/, package.json exports
- `library-dev-environment` — Monorepo setup, npm link, build watch mode
- `library-architecture` — Module design, dependency minimization, tree-shaking
- `library-api-design` — Public surface design, method signatures, error contracts
- `library-bundling` — ESM/CJS dual publishing, package.json exports map, bundler config
- `library-type-definitions` — Declaration files, type testing (tsd/expect-type), API surface docs
- `library-documentation` — TypeDoc/JSDoc, README structure, example code, migration guides
- `library-versioning` — Semver discipline, breaking change detection, release automation
- `library-security` — Supply chain security, dependency auditing, provenance
- `library-testing` — Unit tests, consumer integration tests, example app tests, snapshot testing

### Mobile-App Knowledge Entries (~12 files in `content/knowledge/mobile-app/`):
- `mobile-app-requirements` — Platform guidelines, performance budgets, device matrix
- `mobile-app-conventions` — Platform-specific naming, accessibility patterns, navigation
- `mobile-app-project-structure` — Platform directory layout, shared code, assets
- `mobile-app-dev-environment` — Simulator/emulator setup, device testing, hot reload
- `mobile-app-architecture` — MVVM/MVI patterns, navigation architecture, dependency injection
- `mobile-app-deployment` — App store submission, code signing, provisioning, CI/CD lanes
- `mobile-app-offline-patterns` — Local storage, sync engines, conflict resolution
- `mobile-app-push-notifications` — APNs/FCM setup, notification channels, background handling
- `mobile-app-security` — Secure storage (Keychain/Keystore), certificate pinning, biometrics
- `mobile-app-observability` — Crash reporting, analytics, performance monitoring
- `mobile-app-testing` — Unit tests, UI tests (XCTest/Espresso/Detox), snapshot tests
- `mobile-app-distribution` — TestFlight/internal track, enterprise MDM, staged rollouts

## Config Serialization Example

```yaml
# Library project
project:
  platforms: [web]
  projectType: library
  libraryConfig:
    visibility: public
    runtimeTarget: isomorphic
    bundleFormat: dual
    hasTypeDefinitions: true
    documentationLevel: api-docs

# Mobile-app project
project:
  platforms: [mobile]
  projectType: mobile-app
  mobileAppConfig:
    platform: cross-platform
    distributionModel: public
    offlineSupport: cache
    hasPushNotifications: true
```
