import type { CouplingValidator } from './types.js'
import type { MlConfig } from '../../types/config.js'

export const mlCouplingValidator: CouplingValidator<MlConfig> = {
  configKey: 'mlConfig',
  projectType: 'ml',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'ml') {
      ctx.addIssue({
        path: [...path, 'mlConfig'],
        code: 'custom',
        message: 'mlConfig requires projectType: ml',
      })
    }
    if (config) {
      const { projectPhase, servingPattern } = config
      if (projectPhase === 'inference' && servingPattern === 'none') {
        ctx.addIssue({
          path: [...path, 'mlConfig', 'servingPattern'],
          code: 'custom',
          message: 'Inference projects must specify a serving pattern',
        })
      }
      if (projectPhase === 'training' && servingPattern !== 'none') {
        ctx.addIssue({
          path: [...path, 'mlConfig', 'servingPattern'],
          code: 'custom',
          message: 'Training-only projects should not have a serving pattern',
        })
      }
    }
  },
}
