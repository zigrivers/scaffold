import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { loadConfig } from '../../src/config/loader.js'

describe('loadConfig', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('returns defaults when no config files exist', () => {
    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.defaults.fix_threshold).toBe('P2')
    expect(config.defaults.timeout).toBe(300)
  })

  it('default gemini command does not pass `-p` (prompt is piped via stdin)', () => {
    // Repro: `gemini -p` requires a positional value; with prompt
    // delivered via stdin and `--output-format json` as the next argv
    // token, gemini parses that flag as `-p`'s value and bails with
    // "Not enough arguments following: p", failing the channel in 0s.
    // Default command must omit `-p` so gemini reads stdin natively.
    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    const geminiCmd = config.channels.gemini?.command ?? ''
    expect(geminiCmd.split(/\s+/)).not.toContain('-p')
    expect(geminiCmd).toBe('gemini')
  })

  it('loads project .mmr.yaml and merges with defaults', () => {
    const yaml = [
      'version: 1',
      'defaults:',
      '  fix_threshold: P1',
      'channels:',
      '  claude:',
      '    enabled: true',
      '    command: claude -p',
      '    auth:',
      '      check: "claude -p ok"',
      '      timeout: 5',
      '      failure_exit_codes: [1]',
      '      recovery: "Run: claude login"',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yaml)

    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.defaults.fix_threshold).toBe('P1')
    expect(config.defaults.timeout).toBe(300)
    expect(config.channels.claude.enabled).toBe(true)
  })

  it('loads project .mmr.yaml from configBaseRef unless working-tree config is trusted', () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'defaults:',
      '  fix_threshold: P1',
    ].join('\n'))
    execFileSync('git', ['init'], { cwd: tmpDir, stdio: 'ignore' })
    execFileSync('git', ['add', '.mmr.yaml'], { cwd: tmpDir, stdio: 'ignore' })
    execFileSync(
      'git',
      ['-c', 'user.name=MMR Test', '-c', 'user.email=mmr@example.test', 'commit', '-m', 'base config'],
      { cwd: tmpDir, stdio: 'ignore' },
    )

    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), [
      'version: 1',
      'defaults:',
      '  fix_threshold: P0',
    ].join('\n'))

    const baseConfig = loadConfig({
      projectRoot: tmpDir,
      userHome: tmpDir,
      configBaseRef: 'HEAD',
    })
    const trustedWorkingTreeConfig = loadConfig({
      projectRoot: tmpDir,
      userHome: tmpDir,
      configBaseRef: 'HEAD',
      trustProjectConfig: true,
    })

    expect(baseConfig.defaults.fix_threshold).toBe('P1')
    expect(trustedWorkingTreeConfig.defaults.fix_threshold).toBe('P0')
  })

  it('CLI overrides take precedence over config file', () => {
    const yaml = [
      'version: 1',
      'defaults:',
      '  fix_threshold: P2',
      '  timeout: 300',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yaml)

    const config = loadConfig({
      projectRoot: tmpDir,
      userHome: tmpDir,
      cliOverrides: { fix_threshold: 'P0', timeout: 60 },
    })
    expect(config.defaults.fix_threshold).toBe('P0')
    expect(config.defaults.timeout).toBe(60)
  })

  it('merges user config with project config', () => {
    const userDir = path.join(tmpDir, '.mmr')
    fs.mkdirSync(userDir, { recursive: true })
    const userYaml = [
      'channels:',
      '  codex:',
      '    enabled: false',
      '    command: codex exec',
      '    auth:',
      '      check: "codex login status"',
      '      timeout: 5',
      '      failure_exit_codes: [1]',
      '      recovery: "Run: codex login"',
    ].join('\n')
    fs.writeFileSync(path.join(userDir, 'config.yaml'), userYaml)

    const projYaml = [
      'version: 1',
      'channels:',
      '  claude:',
      '    enabled: true',
      '    command: claude -p',
      '    auth:',
      '      check: "claude -p ok"',
      '      timeout: 5',
      '      failure_exit_codes: [1]',
      '      recovery: "Run: claude login"',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), projYaml)

    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels.claude.enabled).toBe(true)
    expect(config.channels.codex.enabled).toBe(false)
  })

  it('seeds builtin channels when no config files exist', () => {
    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels.claude).toBeDefined()
    expect(config.channels.claude.command).toBe('claude -p')
    expect(config.channels.gemini).toBeDefined()
    expect(config.channels.codex).toBeDefined()
  })

  it('allows partial channel overrides on top of builtins', () => {
    const yaml = [
      'version: 1',
      'channels:',
      '  claude:',
      '    timeout: 600',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yaml)
    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels.claude.timeout).toBe(600)
    expect(config.channels.claude.command).toBe('claude -p')
  })

  it('allows abstract channels without command or auth', () => {
    const yaml = [
      'version: 1',
      'channels:',
      '  base-reviewer:',
      '    abstract: true',
      '    prompt_wrapper: "Base: {{prompt}}"',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yaml)

    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels['base-reviewer']?.abstract).toBe(true)
    expect(config.channels['base-reviewer']?.command).toBeUndefined()
  })

  it('resolves channels with extends before validation', () => {
    const yaml = [
      'version: 1',
      'channels:',
      '  strict-claude:',
      '    extends: claude',
      '    prompt_wrapper: "Strict: {{prompt}}"',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yaml)

    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels['strict-claude']?.extends).toBeUndefined()
    expect(config.channels['strict-claude']?.command).toBe('claude -p')
    expect(config.channels['strict-claude']?.auth?.check).toBe('claude -p "respond with ok" 2>/dev/null')
  })

  it('throws when a concrete channel has no command', () => {
    const yaml = [
      'version: 1',
      'channels:',
      '  broken:',
      '    auth:',
      '      check: "broken auth"',
      '      timeout: 5',
      '      failure_exit_codes: [1]',
      '      recovery: "Configure broken"',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yaml)

    expect(() => loadConfig({ projectRoot: tmpDir, userHome: tmpDir }))
      .toThrow('Channel "broken" must define command after inheritance unless abstract is set')
  })

  it('allows a concrete channel with no auth check', () => {
    const yaml = [
      'version: 1',
      'channels:',
      '  broken:',
      '    command: broken review',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yaml)

    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels.broken?.command).toBe('broken review')
    expect(config.channels.broken?.auth).toBeUndefined()
  })

  it('rejects a compensator.channel that does not exist in channels', () => {
    const projectYaml = `
version: 1
defaults:
  compensator:
    channel: nonexistent-local
channels:
  claude:
    command: claude -p
    auth:
      check: 'true'
      failure_exit_codes: [1]
      recovery: 'noop'
`
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), projectYaml)
    expect(() =>
      loadConfig({ projectRoot: tmpDir, userHome: path.join(tmpDir, 'home') }),
    ).toThrow(/compensator.*nonexistent-local|not found|does not exist|unknown channel/i)
  })

  it('rejects an empty compensator.channel value', () => {
    const projectYaml = `
version: 1
defaults:
  compensator:
    channel: ""
channels:
  claude:
    command: claude -p
`
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), projectYaml)
    expect(() =>
      loadConfig({ projectRoot: tmpDir, userHome: path.join(tmpDir, 'home') }),
    ).toThrow(/compensator.*unknown channel ""|remove the compensator block/i)
  })

  it('rejects compensator.channel that targets an abstract channel (depends on v3.28 T1-A)', () => {
    const projectYaml = `
version: 1
defaults:
  compensator:
    channel: ollama-base
channels:
  ollama-base:
    abstract: true
    command: ollama
    auth:
      check: 'true'
      failure_exit_codes: [1]
      recovery: 'noop'
  qwen:
    extends: ollama-base
    flags: ["run", "qwen2.5-coder:32b"]
`
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), projectYaml)
    expect(() =>
      loadConfig({ projectRoot: tmpDir, userHome: path.join(tmpDir, 'home') }),
    ).toThrow(/abstract|T1-A|non-dispatchable|template/i)
  })

  it('rejects compensator.channel that targets a channel without command', () => {
    const projectYaml = `
version: 1
defaults:
  compensator:
    channel: qwen
channels:
  qwen:
    enabled: true
`
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), projectYaml)
    expect(() =>
      loadConfig({ projectRoot: tmpDir, userHome: path.join(tmpDir, 'home') }),
    ).toThrow(/compensator\.channel "qwen" is missing command|dispatch targets/i)
  })

  it('does not overwrite base values with undefined overlay values', () => {
    const config = loadConfig({
      projectRoot: tmpDir,
      userHome: tmpDir,
      cliOverrides: { fix_threshold: undefined },
    })
    // Should keep the default P2, not overwrite with undefined
    expect(config.defaults.fix_threshold).toBe('P2')
  })

  it('throws on malformed YAML', () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), '{ invalid yaml: [}')
    expect(() => loadConfig({ projectRoot: tmpDir, userHome: tmpDir })).toThrow('Failed to parse')
  })

  it('throws on non-object YAML root', () => {
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), '- just\n- a\n- list\n')
    expect(() => loadConfig({ projectRoot: tmpDir, userHome: tmpDir })).toThrow('expected an object')
  })
})

describe('loadConfig extends inheritance (T1-A)', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('child inherits command from parent', () => {
    const yamlText = [
      'version: 1',
      'channels:',
      '  ollama-base:',
      '    abstract: true',
      '    command: ollama run',
      '    auth:',
      '      check: "ollama list"',
      '      failure_exit_codes: [1]',
      '      recovery: "ollama serve"',
      '  qwen:',
      '    extends: ollama-base',
      '    flags: ["qwen2.5-coder:32b"]',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yamlText)
    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels.qwen?.abstract).toBe(false)
    expect(config.channels.qwen?.command).toBe('ollama run')
    expect(config.channels.qwen?.flags).toEqual(['qwen2.5-coder:32b'])
  })

  it('child overrides parent fields', () => {
    const yamlText = [
      'version: 1',
      'channels:',
      '  base:',
      '    abstract: true',
      '    command: ollama run',
      '    timeout: 60',
      '    auth: { check: "ollama list", failure_exit_codes: [1], recovery: "x" }',
      '  child:',
      '    extends: base',
      '    timeout: 300',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yamlText)
    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels.child?.timeout).toBe(300)
    expect(config.channels.child?.command).toBe('ollama run')
  })

  it('resolves sibling children without mutating the shared parent', () => {
    const yamlText = [
      'version: 1',
      'channels:',
      '  base:',
      '    abstract: true',
      '    command: ollama run',
      '    flags: ["base"]',
      '    auth: { check: "ollama list", failure_exit_codes: [1], recovery: "x" }',
      '  first:',
      '    extends: base',
      '    flags: ["first"]',
      '  second:',
      '    extends: base',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yamlText)
    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels.first?.flags).toEqual(['first'])
    expect(config.channels.second?.flags).toEqual(['base'])
  })

  it('supports two-level extends chains', () => {
    const yamlText = [
      'version: 1',
      'channels:',
      '  a:',
      '    abstract: true',
      '    command: ollama run',
      '    auth: { check: "ollama list", failure_exit_codes: [1], recovery: "x" }',
      '  b:',
      '    abstract: true',
      '    extends: a',
      '    flags: ["base"]',
      '  c:',
      '    extends: b',
      '    flags: ["c-override"]',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yamlText)
    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels.c?.abstract).toBe(false)
    expect(config.channels.c?.command).toBe('ollama run')
    expect(config.channels.c?.flags).toEqual(['c-override'])
  })

  it('resolves same-name builtin channels from their extends parent, not stale builtin fields', () => {
    const yamlText = [
      'version: 1',
      'channels:',
      '  local-base:',
      '    abstract: true',
      '    command: ollama run',
      '    flags: ["--json"]',
      '    auth: { check: "ollama list", failure_exit_codes: [1], recovery: "x" }',
      '  claude:',
      '    extends: local-base',
      '    flags: ["qwen2.5-coder:32b"]',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yamlText)
    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels.claude?.command).toBe('ollama run')
    expect(config.channels.claude?.auth?.check).toBe('ollama list')
    expect(config.channels.claude?.flags).toEqual(['qwen2.5-coder:32b'])
  })

  it('rejects extends cycle (A extends B extends A)', () => {
    const yamlText = [
      'version: 1',
      'channels:',
      '  a: { extends: b, command: "x", auth: { check: "x", failure_exit_codes: [1], recovery: "x" } }',
      '  b: { extends: a, command: "y", auth: { check: "y", failure_exit_codes: [1], recovery: "y" } }',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yamlText)
    expect(() => loadConfig({ projectRoot: tmpDir, userHome: tmpDir }))
      .toThrow(/cycle/i)
  })

  it('rejects extends depth > 4', () => {
    const yamlText = [
      'version: 1',
      'channels:',
      '  l1: { abstract: true, command: "x", auth: { check: "x", failure_exit_codes: [1], recovery: "x" } }',
      '  l2: { abstract: true, extends: l1 }',
      '  l3: { abstract: true, extends: l2 }',
      '  l4: { abstract: true, extends: l3 }',
      '  l5: { abstract: true, extends: l4 }',
      '  l6: { extends: l5 }',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yamlText)
    expect(() => loadConfig({ projectRoot: tmpDir, userHome: tmpDir }))
      .toThrow(/depth/i)
  })

  it('allows extends depth of exactly 4', () => {
    const yamlText = [
      'version: 1',
      'channels:',
      '  l1: { abstract: true, command: "x", auth: { check: "x", failure_exit_codes: [1], recovery: "x" } }',
      '  l2: { abstract: true, extends: l1 }',
      '  l3: { abstract: true, extends: l2 }',
      '  l4: { abstract: true, extends: l3 }',
      '  l5: { extends: l4 }',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yamlText)
    const config = loadConfig({ projectRoot: tmpDir, userHome: tmpDir })
    expect(config.channels.l5?.command).toBe('x')
  })

  it('rejects concrete channel missing command after merge', () => {
    const yamlText = [
      'version: 1',
      'channels:',
      '  orphan:',
      '    flags: ["x"]',
      '    auth: { check: "x", failure_exit_codes: [1], recovery: "x" }',
    ].join('\n')
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), yamlText)
    expect(() => loadConfig({ projectRoot: tmpDir, userHome: tmpDir }))
      .toThrow(/command/i)
  })

  it('round-trips an object-form output_parser through .mmr.yaml', () => {
    const projectYaml = `
version: 1
channels:
  qwen:
    command: ollama
    auth:
      check: 'true'
      failure_exit_codes: [1]
      recovery: 'noop'
    output_parser:
      kind: unwrap-jsonpath
      wrap: $.choices[0].message.content
      then: default
`
    fs.writeFileSync(path.join(tmpDir, '.mmr.yaml'), projectYaml)
    const cfg = loadConfig({ projectRoot: tmpDir, userHome: path.join(tmpDir, 'home') })
    const op = cfg.channels.qwen.output_parser
    expect(op).toEqual({
      kind: 'unwrap-jsonpath',
      wrap: '$.choices[0].message.content',
      then: 'default',
    })
  })
})
