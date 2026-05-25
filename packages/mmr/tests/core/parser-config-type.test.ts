import { describe, it, expectTypeOf } from 'vitest'
import type { OutputParserConfig } from '../../src/config/schema.js'

describe('OutputParserConfig propagation', () => {
  it('accepts a string at the type level', () => {
    const v = 'default'
    expectTypeOf(v).toMatchTypeOf<OutputParserConfig>()
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
})
