import type { CouplingValidator } from './types.js'
import type { MacosNativeConfig } from '../../types/config.js'

/** Leading integer (major version) of a macOS version string, e.g. "15.0" → 15. */
function macosMajor(version: string): number {
  return parseInt(version.split('.')[0] ?? '', 10)
}

export const macosNativeCouplingValidator: CouplingValidator<MacosNativeConfig> = {
  configKey: 'macosNativeConfig',
  projectType: 'macos-native',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'macos-native') {
      ctx.addIssue({
        path: [...path, 'macosNativeConfig'],
        code: 'custom',
        message: 'macosNativeConfig requires projectType: macos-native',
      })
    }
    if (config) {
      const { distribution, sandboxed, autoUpdate, persistence, minMacosVersion } = config
      // Rule 1 — Mac App Store requires the App Sandbox.
      if ((distribution === 'mac-app-store' || distribution === 'both') && !sandboxed) {
        ctx.addIssue({
          path: [...path, 'macosNativeConfig', 'sandboxed'],
          code: 'custom',
          message: 'Mac App Store distribution requires sandboxed: true',
        })
      }
      // Rule 2 — Sparkle/third-party updaters are disallowed in App Store builds.
      if (distribution === 'mac-app-store' && autoUpdate !== 'none') {
        ctx.addIssue({
          path: [...path, 'macosNativeConfig', 'autoUpdate'],
          code: 'custom',
          message: 'Mac App Store builds cannot bundle a third-party updater '
            + '(set autoUpdate: none; the App Store delivers updates)',
        })
      }
      // Rule 3 — SwiftData requires macOS 14+.
      if (persistence === 'swiftdata' && macosMajor(minMacosVersion) < 14) {
        ctx.addIssue({
          path: [...path, 'macosNativeConfig', 'persistence'],
          code: 'custom',
          message: 'SwiftData requires minMacosVersion 14.0 or later',
        })
      }
    }
  },
}
