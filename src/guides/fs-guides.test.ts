import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { getPackageGuidesDir, getPackageRoot } from '../utils/fs.js'

describe('getPackageGuidesDir', () => {
  it('returns <packageRoot>/content/guides when no projectRoot given', () => {
    expect(getPackageGuidesDir()).toBe(path.join(getPackageRoot(), 'content', 'guides'))
  })

  it('prefers an existing projectRoot/content/guides', () => {
    const root = getPackageRoot()
    const result = getPackageGuidesDir(root)
    expect(result).toBe(path.join(root, 'content', 'guides'))
  })
})
