import { describe, it, expectTypeOf } from 'vitest'
import type { OutputParserConfig } from '../../src/config/schema.js'

describe('OutputParserConfig propagation', () => {
  it('accepts a string at the type level', () => {
    const v: OutputParserConfig = 'default'
    expectTypeOf(v).toMatchTypeOf<OutputParserConfig>()
  })

  it('accepts an unwrap-jsonpath object at the type level', () => {
    const v: OutputParserConfig = { kind: 'unwrap-jsonpath', wrap: '$.x', then: 'default' }
    expectTypeOf(v).toMatchTypeOf<OutputParserConfig>()
  })

  it('accepts a regex-findings object at the type level', () => {
    const v: OutputParserConfig = {
      kind: 'regex-findings',
      pattern: '.*',
      fields: { location: 1, description: 2 },
    }
    expectTypeOf(v).toMatchTypeOf<OutputParserConfig>()
  })
})
