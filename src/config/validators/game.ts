import type { CouplingValidator } from './types.js'
import type { GameConfig } from '../../types/config.js'

export const gameCouplingValidator: CouplingValidator<GameConfig> = {
  configKey: 'gameConfig',
  projectType: 'game',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'game') {
      ctx.addIssue({
        path: [...path, 'gameConfig'],
        code: 'custom',
        message: 'gameConfig is only valid when projectType is "game"',
      })
    }
  },
}
