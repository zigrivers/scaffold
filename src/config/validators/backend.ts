import type { CouplingValidator } from './types.js'
import type { BackendConfig } from '../../types/config.js'

export const backendCouplingValidator: CouplingValidator<BackendConfig> = {
  configKey: 'backendConfig',
  projectType: 'backend',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'backend') {
      ctx.addIssue({
        path: [...path, 'backendConfig'],
        code: 'custom',
        message: 'backendConfig requires projectType: backend',
      })
    }
  },
}
