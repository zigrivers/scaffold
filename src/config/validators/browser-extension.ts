import type { CouplingValidator } from './types.js'
import type { BrowserExtensionConfig } from '../../types/config.js'

export const browserExtensionCouplingValidator: CouplingValidator<BrowserExtensionConfig> = {
  configKey: 'browserExtensionConfig',
  projectType: 'browser-extension',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'browser-extension') {
      ctx.addIssue({
        path: [...path, 'browserExtensionConfig'],
        code: 'custom',
        message: 'browserExtensionConfig requires projectType: browser-extension',
      })
    }
    if (config) {
      const { uiSurfaces, hasContentScript, hasBackgroundWorker } = config
      if ((!uiSurfaces || uiSurfaces.length === 0) && !hasContentScript && !hasBackgroundWorker) {
        ctx.addIssue({
          path: [...path, 'browserExtensionConfig'],
          code: 'custom',
          message: 'Extension must have at least one UI surface, content script, or background worker',
        })
      }
    }
  },
}
