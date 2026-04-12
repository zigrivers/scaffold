import type { MobileAppCopy } from './types.js'

export const mobileAppCopy: MobileAppCopy = {
  platform: {
    short: 'Which mobile platform(s) the app targets.',
    long: 'Single-platform gives native performance; cross-platform shares code across iOS and Android.',
    options: {
      ios:              { label: 'iOS only',        short: 'Native iOS app using Swift/SwiftUI.' },
      android:          { label: 'Android only',    short: 'Native Android app using Kotlin/Jetpack Compose.' },
      'cross-platform': { label: 'Cross-platform',  short: 'Shared codebase for iOS and Android (React Native, Flutter, etc.).' },
    },
  },
  distributionModel: {
    short: 'How the app reaches its users.',
    long: 'Public apps go through app stores; private apps use enterprise distribution or MDM.',
    options: {
      public:  { label: 'Public (App Store / Google Play)', short: 'Listed on public app stores for anyone to download.' },
      private: { label: 'Private / Enterprise',             short: 'Distributed internally via MDM or enterprise signing.' },
      mixed:   { label: 'Mixed',                            short: 'Both public store listing and private enterprise builds.' },
    },
  },
  offlineSupport: {
    short: 'How the app behaves without a network connection.',
    long: 'Cache keeps recent data available; offline-first treats local storage as the primary data source.',
    options: {
      none:            { label: 'None',          short: 'Requires an active network connection to function.' },
      cache:           { label: 'Cache',         short: 'Caches recent data for temporary offline access.' },
      'offline-first': { label: 'Offline-first', short: 'Works fully offline — syncs data when connectivity returns.' },
    },
  },
  hasPushNotifications: {
    short: 'Enable push notification support (APNs / FCM).',
  },
}
