import { describe, it, expect } from 'vitest'
import { jsonpathGet } from '../../src/core/jsonpath.js'

describe('jsonpathGet', () => {
  it('returns the root for $', () => {
    const obj = { a: 1 }
    expect(jsonpathGet(obj, '$')).toEqual({ a: 1 })
  })

  it('returns a single-level property', () => {
    expect(jsonpathGet({ a: 'x' }, '$.a')).toBe('x')
  })

  it('returns a nested property', () => {
    expect(jsonpathGet({ a: { b: 'x' } }, '$.a.b')).toBe('x')
  })

  it('returns an indexed array element', () => {
    expect(jsonpathGet({ a: ['x', 'y'] }, '$.a[0]')).toBe('x')
    expect(jsonpathGet({ a: ['x', 'y'] }, '$.a[1]')).toBe('y')
  })

  it('returns a property of an indexed array element', () => {
    const obj = { choices: [{ message: { content: 'hi' } }] }
    expect(jsonpathGet(obj, '$.choices[0].message.content')).toBe('hi')
  })

  it('returns undefined for a missing top-level key', () => {
    expect(jsonpathGet({ a: 1 }, '$.b')).toBeUndefined()
  })

  it('returns undefined for a missing nested key', () => {
    expect(jsonpathGet({ a: {} }, '$.a.b')).toBeUndefined()
  })

  it('returns undefined for an out-of-bounds index', () => {
    expect(jsonpathGet({ a: ['x'] }, '$.a[5]')).toBeUndefined()
  })

  it('returns undefined when traversing through a non-object', () => {
    expect(jsonpathGet({ a: 'string' }, '$.a.b')).toBeUndefined()
  })

  it('throws on a path that does not start with $', () => {
    expect(() => jsonpathGet({ a: 1 }, 'a.b')).toThrow(/must start with \$/i)
  })

  it('throws on a malformed bracket expression', () => {
    expect(() => jsonpathGet({ a: [1] }, '$.a[abc]')).toThrow(/invalid|malformed|index/i)
  })
})
