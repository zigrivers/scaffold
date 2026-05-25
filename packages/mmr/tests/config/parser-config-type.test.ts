import { describe, it, expectTypeOf } from 'vitest'
import type { OutputParserConfig } from '../../src/config/schema.js'

describe('OutputParserConfig propagation', () => {
  it('accepts any parser name string at the type level', () => {
    expectTypeOf<string>().toMatchTypeOf<OutputParserConfig>()
  })

  it('accepts an unwrap-jsonpath object at the type level', () => {
    const v = { kind: 'unwrap-jsonpath', wrap: '$.x', then: 'default' } as const
    expectTypeOf(v).toMatchTypeOf<OutputParserConfig>()
  })

  it('accepts a regex-findings object at the type level', () => {
    const v = {
      kind: 'regex-findings',
      pattern: '.*',
      fields: { location: 1, description: 2 },
    } as const
    expectTypeOf(v).toMatchTypeOf<OutputParserConfig>()
  })

  it('rejects a regex-findings object missing required location field', () => {
    const v = {
      kind: 'regex-findings',
      pattern: '.*',
      fields: { description: 2 },
    } as const
    expectTypeOf(v).not.toMatchTypeOf<OutputParserConfig>()
  })

  it('rejects an unknown parser kind', () => {
    const v = { kind: 'unknown-kind', wrap: '$.x' } as const
    expectTypeOf(v).not.toMatchTypeOf<OutputParserConfig>()
  })
})
