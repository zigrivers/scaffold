import { describe, it, expect } from 'vitest'
import { AUTO_REQUIRED_FLAG, autoRequiredSuffix } from './init-flag-families.js'
import { ProjectTypeSchema } from '../config/schema.js'

describe('AUTO_REQUIRED_FLAG', () => {
  it('has an entry for every project type in the schema', () => {
    for (const type of ProjectTypeSchema.options) {
      expect(Object.hasOwn(AUTO_REQUIRED_FLAG, type), `missing entry: ${type}`).toBe(true)
    }
  })

  it('marks the nine types that require a discriminator under --auto', () => {
    expect(AUTO_REQUIRED_FLAG['web-app']).toBe('web-rendering')
    expect(AUTO_REQUIRED_FLAG['backend']).toBe('backend-api-style')
    expect(AUTO_REQUIRED_FLAG['cli']).toBe('cli-interactivity')
    expect(AUTO_REQUIRED_FLAG['library']).toBe('lib-visibility')
    expect(AUTO_REQUIRED_FLAG['mobile-app']).toBe('mobile-platform')
    expect(AUTO_REQUIRED_FLAG['data-pipeline']).toBe('pipeline-processing')
    expect(AUTO_REQUIRED_FLAG['ml']).toBe('ml-phase')
    expect(AUTO_REQUIRED_FLAG['research']).toBe('research-driver')
    expect(AUTO_REQUIRED_FLAG['mcp-server']).toBe('mcp-language')
  })

  it('marks the five fully-defaultable types as null', () => {
    expect(AUTO_REQUIRED_FLAG['game']).toBeNull()
    expect(AUTO_REQUIRED_FLAG['browser-extension']).toBeNull()
    expect(AUTO_REQUIRED_FLAG['macos-native']).toBeNull()
    expect(AUTO_REQUIRED_FLAG['data-science']).toBeNull()
    expect(AUTO_REQUIRED_FLAG['web3']).toBeNull()
  })

  it('splits every schema type across exactly the two groups', () => {
    const entries = Object.entries(AUTO_REQUIRED_FLAG)
    const required = entries.filter(([, f]) => f !== null)
    const defaultable = entries.filter(([, f]) => f === null)
    expect(required).toHaveLength(9)
    expect(defaultable).toHaveLength(5)
    expect(entries).toHaveLength(ProjectTypeSchema.options.length)
  })
})

describe('autoRequiredSuffix', () => {
  it('annotates a discriminator flag', () => {
    expect(autoRequiredSuffix('cli-interactivity')).toBe(' [required with --auto]')
  })

  it('returns an empty string for a non-discriminator flag', () => {
    expect(autoRequiredSuffix('cli-distribution')).toBe('')
  })
})
