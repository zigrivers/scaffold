import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSignalContext, createFakeSignalContext } from './context.js'
import { detectMobileApp } from './mobile-app.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES = path.join(__dirname, '../../../tests/fixtures/adopt/detectors/mobile-app')

describe('detectMobileApp', () => {
  it('Expo with both platforms → cross-platform + push notifications', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'expo-cross'))
    const m = detectMobileApp(ctx)
    expect(m?.projectType).toBe('mobile-app')
    expect(m?.confidence).toBe('high')
    expect(m?.partialConfig.platform).toBe('cross-platform')
    expect(m?.partialConfig.hasPushNotifications).toBe(true)
  })

  it('Native ios/ + android/ → cross-platform high', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'native-rn'))
    expect(detectMobileApp(ctx)?.partialConfig.platform).toBe('cross-platform')
  })

  it('Flutter → cross-platform high', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'flutter'))
    expect(detectMobileApp(ctx)?.confidence).toBe('high')
  })

  it('Only ios/ → ios platform medium', () => {
    const ctx = createSignalContext(path.join(FIXTURES, 'ios-only'))
    const m = detectMobileApp(ctx)
    expect(m?.partialConfig.platform).toBe('ios')
    expect(m?.confidence).toBe('medium')
  })

  it('No mobile signals → null', () => {
    const ctx = createFakeSignalContext({ rootEntries: ['package.json'] })
    expect(detectMobileApp(ctx)).toBeNull()
  })

  it('Offline support detected from realm dep', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'app', dependencies: { 'react-native': '0.73', realm: '12' } },
      dirs: ['ios', 'android'],
    })
    expect(detectMobileApp(ctx)?.partialConfig.offlineSupport).toBe('cache')
  })

  it('Push notifications via @react-native-firebase/messaging', () => {
    const ctx = createFakeSignalContext({
      packageJson: { name: 'app', dependencies: { 'react-native': '0.73', '@react-native-firebase/messaging': '20' } },
      dirs: ['ios', 'android'],
    })
    expect(detectMobileApp(ctx)?.partialConfig.hasPushNotifications).toBe(true)
  })

  it('Single-platform android-only → android medium', () => {
    const ctx = createFakeSignalContext({ dirs: ['android'] })
    const m = detectMobileApp(ctx)
    expect(m?.partialConfig.platform).toBe('android')
    expect(m?.confidence).toBe('medium')
  })
})
