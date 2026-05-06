import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadObservabilityConfig, DEFAULT_CONFIG, ensureConfigDir } from './observability-config.js'

describe('loadObservabilityConfig', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'observe-cfg-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('returns defaults when no file exists', () => {
    expect(loadObservabilityConfig(dir)).toEqual(DEFAULT_CONFIG)
  })

  it('merges user values over defaults at the lens-keyed level', () => {
    writeFileSync(ensureConfigDir(dir),
      `lenses:
  E-design:
    ad_hoc_token_threshold: 5
    ui_glob: "src/components/**/*.{tsx,vue}"
  C-standards:
    enforce_via_linter: true
    rule_overrides:
      no-console: P1
`)
    const cfg = loadObservabilityConfig(dir)
    expect(cfg.lenses['E-design']?.ad_hoc_token_threshold).toBe(5)
    expect(cfg.lenses['E-design']?.ui_glob).toBe('src/components/**/*.{tsx,vue}')
    expect(cfg.lenses['C-standards']?.enforce_via_linter).toBe(true)
    expect(cfg.lenses['C-standards']?.rule_overrides).toEqual({ 'no-console': 'P1' })
  })

  it('falls through to defaults silently when the file is malformed YAML', () => {
    writeFileSync(ensureConfigDir(dir), ': - bad yaml -')
    expect(loadObservabilityConfig(dir)).toEqual(DEFAULT_CONFIG)
  })

  it('disabled_lenses takes the registered ids out of the enabled set', () => {
    writeFileSync(ensureConfigDir(dir), 'disabled_lenses: ["E-design", "G-decisions"]\n')
    const cfg = loadObservabilityConfig(dir)
    expect(cfg.disabled_lenses).toEqual(['E-design', 'G-decisions'])
  })
})
