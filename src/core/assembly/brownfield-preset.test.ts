import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { loadPreset } from './preset-loader.js'
import { discoverMetaPrompts } from './meta-prompt-loader.js'

describe('content/methodology/brownfield.yml (D11 R1)', () => {
  const repoRoot = process.cwd()
  const presetPath = path.join(repoRoot, 'content', 'methodology', 'brownfield.yml')
  const stepNames = [...discoverMetaPrompts(path.join(repoRoot, 'content', 'pipeline')).keys()]

  it('loads without errors or missing-step warnings against the real pipeline', () => {
    const { preset, errors, warnings } = loadPreset(presetPath, stepNames)
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(preset).not.toBeNull()
    expect(preset!.name).toBe('Brownfield')
    expect(preset!.default_depth).toBe(3)
  })

  it('enables foundation/environment/quality and disables the doc-chain middle, parity, and validation', () => {
    const { preset } = loadPreset(presetPath, stepNames)
    const steps = preset!.steps
    expect(steps['github-setup'].enabled).toBe(true)
    expect(steps['tech-stack'].enabled).toBe(true)
    expect(steps['git-workflow'].enabled).toBe(true)
    expect(steps['security'].enabled).toBe(true)
    expect(steps['domain-modeling'].enabled).toBe(false)
    expect(steps['adrs'].enabled).toBe(false)
    expect(steps['system-architecture'].enabled).toBe(false)
    expect(steps['api-contracts'].enabled).toBe(false)
    expect(steps['platform-parity-review'].enabled).toBe(false)
    expect(steps['cross-phase-consistency'].enabled).toBe(false)
  })
})
