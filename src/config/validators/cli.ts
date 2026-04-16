import type { CouplingValidator } from './types.js'
import type { CliConfig } from '../../types/config.js'

export const cliCouplingValidator: CouplingValidator<CliConfig> = {
  configKey: 'cliConfig',
  projectType: 'cli',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'cli') {
      ctx.addIssue({
        path: [...path, 'cliConfig'],
        code: 'custom',
        message: 'cliConfig requires projectType: cli',
      })
    }
  },
}
