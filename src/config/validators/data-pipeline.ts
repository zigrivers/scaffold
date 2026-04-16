import type { CouplingValidator } from './types.js'
import type { DataPipelineConfig } from '../../types/config.js'

export const dataPipelineCouplingValidator: CouplingValidator<DataPipelineConfig> = {
  configKey: 'dataPipelineConfig',
  projectType: 'data-pipeline',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'data-pipeline') {
      ctx.addIssue({
        path: [...path, 'dataPipelineConfig'],
        code: 'custom',
        message: 'dataPipelineConfig requires projectType: data-pipeline',
      })
    }
  },
}
