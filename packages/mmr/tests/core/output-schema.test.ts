import { describe, it, expect } from 'vitest'
import {
  FINDINGS_JSON_SCHEMA,
  FINDINGS_SCHEMA_PLACEHOLDER,
  substituteFindingsSchema,
  stripFindingsSchemaFlags,
} from '../../src/core/output-schema.js'

describe('FINDINGS_JSON_SCHEMA', () => {
  it('describes the review reply object (approved/findings/summary all required)', () => {
    expect(FINDINGS_JSON_SCHEMA.type).toBe('object')
    expect(FINDINGS_JSON_SCHEMA.required).toEqual(['approved', 'findings', 'summary'])
  })

  it('constrains finding severity to the P0-P3 enum and requires the parser-mandatory fields', () => {
    const finding = FINDINGS_JSON_SCHEMA.properties.findings.items
    expect(finding.properties.severity.enum).toEqual(['P0', 'P1', 'P2', 'P3'])
    // validateFindingStrict requires severity + location + description; the
    // schema must force the model to emit them so a strict parse never throws.
    expect(finding.required).toEqual(expect.arrayContaining(['severity', 'location', 'description']))
  })

  it('serializes to single-line JSON usable as a CLI arg value', () => {
    const serialized = JSON.stringify(FINDINGS_JSON_SCHEMA)
    expect(serialized).not.toContain('\n')
    expect(JSON.parse(serialized)).toEqual(FINDINGS_JSON_SCHEMA)
  })
})

describe('substituteFindingsSchema', () => {
  it('replaces the placeholder arg with the serialized schema', () => {
    const flags = ['--output-format', 'json', '--json-schema', FINDINGS_SCHEMA_PLACEHOLDER]
    const out = substituteFindingsSchema(flags)
    expect(out).toEqual(['--output-format', 'json', '--json-schema', JSON.stringify(FINDINGS_JSON_SCHEMA)])
  })

  it('is a no-op when no placeholder is present (custom channel configs)', () => {
    const flags = ['--output-format', 'json']
    expect(substituteFindingsSchema(flags)).toEqual(flags)
  })

  it('does not mutate the input array', () => {
    const flags = ['--json-schema', FINDINGS_SCHEMA_PLACEHOLDER]
    substituteFindingsSchema(flags)
    expect(flags).toEqual(['--json-schema', FINDINGS_SCHEMA_PLACEHOLDER])
  })
})

describe('stripFindingsSchemaFlags', () => {
  it('removes the flag/value pair carrying the placeholder (critique reuses channel flags verbatim)', () => {
    const flags = ['--output-format', 'json', '--json-schema', FINDINGS_SCHEMA_PLACEHOLDER, '--no-memory']
    expect(stripFindingsSchemaFlags(flags)).toEqual(['--output-format', 'json', '--no-memory'])
  })

  it('removes the preceding flag token whatever its name (custom flag carrying the placeholder)', () => {
    // A valueless flag left behind would break the CLI invocation.
    const flags = ['--custom-schema-flag', FINDINGS_SCHEMA_PLACEHOLDER]
    expect(stripFindingsSchemaFlags(flags)).toEqual([])
  })

  it('removes a bare placeholder arg when the previous token is not a flag', () => {
    const flags = ['positional', FINDINGS_SCHEMA_PLACEHOLDER]
    expect(stripFindingsSchemaFlags(flags)).toEqual(['positional'])
  })

  it('is a no-op when no placeholder is present', () => {
    const flags = ['--output-format', 'json', '--no-memory']
    expect(stripFindingsSchemaFlags(flags)).toEqual(flags)
  })
})
