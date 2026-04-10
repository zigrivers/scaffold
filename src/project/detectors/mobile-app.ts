import type { SignalContext } from './context.js'
import type { MobileAppMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

export function detectMobileApp(ctx: SignalContext): MobileAppMatch | null {
  const ev: DetectionEvidence[] = []

  const hasIos = ctx.dirExists('ios')
  const hasAndroid = ctx.dirExists('android')
  const hasAppJson = ctx.hasFile('app.json')
  const hasExpo = ctx.hasDep('expo', 'npm')
  const hasRn = ctx.hasDep('react-native', 'npm')
  const hasFlutter = ctx.hasFile('pubspec.yaml')

  let platform: MobileAppMatch['partialConfig']['platform'] | undefined
  let confidence: 'high' | 'medium' | undefined

  if (hasFlutter) {
    platform = 'cross-platform'
    confidence = 'high'
    ev.push(evidence('pubspec-yaml', 'pubspec.yaml'))
  } else if (hasAppJson && hasExpo) {
    platform = 'cross-platform'
    confidence = 'high'
    ev.push(evidence('expo-app-json', 'app.json'))
  } else if (hasIos && hasAndroid) {
    platform = 'cross-platform'
    confidence = 'high'
    ev.push(evidence('native-ios-android'))
  } else if (hasIos) {
    platform = 'ios'
    confidence = 'medium'
    ev.push(evidence('ios-only'))
  } else if (hasAndroid) {
    platform = 'android'
    confidence = 'medium'
    ev.push(evidence('android-only'))
  } else if (hasRn) {
    platform = 'cross-platform'
    confidence = 'medium'
    ev.push(evidence('react-native-dep'))
  }

  if (!platform || !confidence) return null

  const partialConfig: MobileAppMatch['partialConfig'] = { platform }

  // hasPushNotifications
  const pushDeps = ['expo-notifications', '@react-native-firebase/messaging', 'react-native-push-notification']
  if (ctx.hasAnyDep(pushDeps, 'npm')) {
    partialConfig.hasPushNotifications = true
    ev.push(evidence('push-notifications-dep'))
  }

  // offlineSupport
  if (ctx.hasAnyDep(['expo-sqlite', '@react-native-async-storage/async-storage', 'watermelondb', 'realm'], 'npm')) {
    partialConfig.offlineSupport = 'cache'
    ev.push(evidence('offline-storage-dep'))
  }

  return { projectType: 'mobile-app', confidence, partialConfig, evidence: ev }
}
