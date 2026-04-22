// src/config/validators/data-science.ts
import type { CouplingValidator } from './types.js'
import type { DataScienceConfig } from '../../types/config.js'

export const dataScienceCouplingValidator: CouplingValidator<DataScienceConfig> = {
  configKey: 'dataScienceConfig',
  projectType: 'data-science',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'data-science') {
      ctx.addIssue({
        path: [...path, 'dataScienceConfig'],
        code: 'custom',
        message: 'dataScienceConfig requires projectType: data-science',
      })
    }
    // No cross-field invariants yet — `audience` has a single value 'solo'.
  },
}
