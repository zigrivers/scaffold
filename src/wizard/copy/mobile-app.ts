import type { MobileAppCopy } from './types.js'

export const mobileAppCopy: MobileAppCopy = {
  platform: {
    short: 'TODO',
    options: {
      ios:              { label: 'TODO', short: 'TODO' },
      android:          { label: 'TODO', short: 'TODO' },
      'cross-platform': { label: 'TODO', short: 'TODO' },
    },
  },
  distributionModel: {
    short: 'TODO',
    options: {
      public:  { label: 'TODO', short: 'TODO' },
      private: { label: 'TODO', short: 'TODO' },
      mixed:   { label: 'TODO', short: 'TODO' },
    },
  },
  offlineSupport: {
    short: 'TODO',
    options: {
      none:            { label: 'TODO', short: 'TODO' },
      cache:           { label: 'TODO', short: 'TODO' },
      'offline-first': { label: 'TODO', short: 'TODO' },
    },
  },
  hasPushNotifications: {
    short: 'TODO',
  },
}
