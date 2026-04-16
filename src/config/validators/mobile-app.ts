import type { CouplingValidator } from './types.js'
import type { MobileAppConfig } from '../../types/config.js'

export const mobileAppCouplingValidator: CouplingValidator<MobileAppConfig> = {
  configKey: 'mobileAppConfig',
  projectType: 'mobile-app',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'mobile-app') {
      ctx.addIssue({
        path: [...path, 'mobileAppConfig'],
        code: 'custom',
        message: 'mobileAppConfig requires projectType: mobile-app',
      })
    }
  },
}
