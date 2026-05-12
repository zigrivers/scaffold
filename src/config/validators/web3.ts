import type { CouplingValidator } from './types.js'
import type { Web3Config } from '../../types/config.js'

export const web3CouplingValidator: CouplingValidator<Web3Config> = {
  configKey: 'web3Config',
  projectType: 'web3',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'web3') {
      ctx.addIssue({
        path: [...path, 'web3Config'],
        code: 'custom',
        message: 'web3Config requires projectType: web3',
      })
    }
    // No cross-field invariants yet — `scope` has a single value 'contracts'.
  },
}
