import { describe, it, expect } from 'vitest'
import { getCopyForType, optionsFromCopy } from './index.js'

describe('macos-native copy', () => {
  it('is registered and exposes options for every enum field', () => {
    const copy = getCopyForType('macos-native')
    expect(optionsFromCopy(copy.uiFramework.options, ['swiftui', 'appkit', 'hybrid'])).toHaveLength(3)
    expect(optionsFromCopy(copy.appStyle.options, ['standard', 'menu-bar', 'agent'])).toHaveLength(3)
    expect(optionsFromCopy(copy.distribution.options, ['developer-id', 'mac-app-store', 'both'])).toHaveLength(3)
    expect(optionsFromCopy(copy.persistence.options, ['none', 'sqlite', 'core-data', 'swiftdata'])).toHaveLength(4)
    expect(optionsFromCopy(copy.autoUpdate.options, ['none', 'sparkle'])).toHaveLength(2)
  })
})
