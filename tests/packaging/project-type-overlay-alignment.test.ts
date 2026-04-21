import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { ProjectTypeSchema } from '../../src/config/schema.js'
import { getPackageMethodologyDir } from '../../src/utils/fs.js'

describe('packaging integrity — project-type overlays aligned with schema enum', () => {
  const methodologyDir = getPackageMethodologyDir()

  it.each(ProjectTypeSchema.options as readonly string[])(
    'project type %s has a matching content/methodology file',
    (projectType) => {
      const overlayPath = path.join(methodologyDir, `${projectType}-overlay.yml`)
      expect(
        fs.existsSync(overlayPath),
        `Expected ${overlayPath} to exist for ProjectType '${projectType}'`,
      ).toBe(true)
      expect(
        fs.statSync(overlayPath).isFile(),
        `Expected ${overlayPath} to be a regular file`,
      ).toBe(true)
    },
  )
})
