import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { backendRealDomains, researchRealDomains } from '../../src/config/schema.js'
import { getPackageMethodologyDir } from '../../src/utils/fs.js'

describe('packaging integrity — domain overlays aligned with schema enums', () => {
  const methodologyDir = getPackageMethodologyDir()

  it('every backendRealDomains entry has a content/methodology file', () => {
    for (const domain of backendRealDomains) {
      const overlayPath = path.join(methodologyDir, `backend-${domain}.yml`)
      expect(
        fs.existsSync(overlayPath),
        `Expected ${overlayPath} to exist for backendRealDomains entry '${domain}'`,
      ).toBe(true)
      expect(
        fs.statSync(overlayPath).isFile(),
        `Expected ${overlayPath} to be a regular file`,
      ).toBe(true)
    }
  })

  it('every researchRealDomains entry has a content/methodology file', () => {
    for (const domain of researchRealDomains) {
      const overlayPath = path.join(methodologyDir, `research-${domain}.yml`)
      expect(
        fs.existsSync(overlayPath),
        `Expected ${overlayPath} to exist for researchRealDomains entry '${domain}'`,
      ).toBe(true)
      expect(
        fs.statSync(overlayPath).isFile(),
        `Expected ${overlayPath} to be a regular file`,
      ).toBe(true)
    }
  })
})
