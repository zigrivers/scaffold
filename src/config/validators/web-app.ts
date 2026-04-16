import type { CouplingValidator } from './types.js'
import type { WebAppConfig } from '../../types/config.js'

export const webAppCouplingValidator: CouplingValidator<WebAppConfig> = {
  configKey: 'webAppConfig',
  projectType: 'web-app',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'web-app') {
      ctx.addIssue({
        path: [...path, 'webAppConfig'],
        code: 'custom',
        message: 'webAppConfig requires projectType: web-app',
      })
    }
    if (config) {
      const { renderingStrategy, deployTarget, authFlow } = config
      if (['ssr', 'hybrid'].includes(renderingStrategy) && deployTarget === 'static') {
        ctx.addIssue({
          path: [...path, 'webAppConfig', 'deployTarget'],
          code: 'custom',
          message: 'SSR/hybrid rendering requires compute, not static hosting',
        })
      }
      if (authFlow === 'session' && deployTarget === 'static') {
        ctx.addIssue({
          path: [...path, 'webAppConfig', 'authFlow'],
          code: 'custom',
          message: 'Session auth requires server state, incompatible with static hosting',
        })
      }
    }
  },
}
