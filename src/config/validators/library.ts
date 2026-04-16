import type { CouplingValidator } from './types.js'
import type { LibraryConfig } from '../../types/config.js'

export const libraryCouplingValidator: CouplingValidator<LibraryConfig> = {
  configKey: 'libraryConfig',
  projectType: 'library',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'library') {
      ctx.addIssue({
        path: [...path, 'libraryConfig'],
        code: 'custom',
        message: 'libraryConfig requires projectType: library',
      })
    }
    if (config) {
      const { visibility, documentationLevel } = config
      if (visibility === 'public' && documentationLevel === 'none') {
        ctx.addIssue({
          path: [...path, 'libraryConfig', 'documentationLevel'],
          code: 'custom',
          message: 'Public libraries should have documentation'
            + ' (documentationLevel: none with visibility: public)',
        })
      }
    }
  },
}
