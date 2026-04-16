import type { CouplingValidator } from './types.js'
import type { ResearchConfig } from '../../types/config.js'

export const researchCouplingValidator: CouplingValidator<ResearchConfig> = {
  configKey: 'researchConfig',
  projectType: 'research',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'research') {
      ctx.addIssue({
        path: [...path, 'researchConfig'],
        code: 'custom',
        message: 'researchConfig requires projectType: research',
      })
    }
    if (config) {
      const { experimentDriver, interactionMode } = config
      if (experimentDriver === 'notebook-driven' && interactionMode === 'autonomous') {
        ctx.addIssue({
          path: [...path, 'researchConfig', 'interactionMode'],
          code: 'custom',
          message: 'Notebook-driven execution cannot be fully autonomous',
        })
      }
    }
  },
}
