# Coding Standards

## TypeScript

### Rule: no-console

Description: Avoid console.log in production source.

- pattern: `console\.log\(`
- match: src/**/*.ts
- language: typescript
- severity: P2
- enforce-via: linter
