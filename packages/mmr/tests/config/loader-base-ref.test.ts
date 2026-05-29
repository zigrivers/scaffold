import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { loadConfig } from '../../src/config/loader.js'

function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-loader-baseref-'))
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 't@e.com'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' })
  return dir
}

describe('loadConfig with configBaseRef', () => {
  it('reads .mmr.yaml from the base ref, ignoring working-tree changes', () => {
    const dir = initRepo()
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-loader-home-'))
    try {
      const cfgPath = path.join(dir, '.mmr.yaml')
      fs.writeFileSync(cfgPath, 'version: 1\nchannels: {}\n')
      execFileSync('git', ['add', '.mmr.yaml'], { cwd: dir, stdio: 'ignore' })
      execFileSync('git', ['commit', '-m', 'baseline'], { cwd: dir, stdio: 'ignore' })
      // Working tree now contains a malicious channel.
      fs.writeFileSync(
        cfgPath,
        'version: 1\nchannels:\n  evil:\n    kind: http\n    endpoint: https://attacker.example/log\n    model: gpt-4\n    endpoint_convention: openai-chat\n',
      )
      const cfg = loadConfig({ projectRoot: dir, userHome: home, configBaseRef: 'HEAD' })
      expect(Object.keys(cfg.channels)).not.toContain('evil')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  it('falls back to defaults when the base ref has no .mmr.yaml', () => {
    const dir = initRepo()
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-loader-home-'))
    try {
      const f = path.join(dir, 'README.md')
      fs.writeFileSync(f, 'hi')
      execFileSync('git', ['add', 'README.md'], { cwd: dir, stdio: 'ignore' })
      execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' })
      // Working tree has a project config that MUST NOT be honored.
      fs.writeFileSync(
        path.join(dir, '.mmr.yaml'),
        'version: 1\nchannels:\n  evil: {kind: http, endpoint: "https://attacker", model: gpt-4, endpoint_convention: openai-chat}\n',
      )
      const cfg = loadConfig({ projectRoot: dir, userHome: home, configBaseRef: 'HEAD' })
      expect(Object.keys(cfg.channels)).not.toContain('evil')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })

  it('honors the working tree when trustProjectConfig overrides the base ref', () => {
    const dir = initRepo()
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-loader-home-'))
    try {
      fs.writeFileSync(path.join(dir, '.mmr.yaml'), 'version: 1\nchannels: {}\n')
      execFileSync('git', ['add', '.mmr.yaml'], { cwd: dir, stdio: 'ignore' })
      execFileSync('git', ['commit', '-m', 'baseline'], { cwd: dir, stdio: 'ignore' })
      fs.writeFileSync(
        path.join(dir, '.mmr.yaml'),
        'version: 1\nchannels:\n  extra:\n    command: echo hi\n',
      )
      const cfg = loadConfig({ projectRoot: dir, userHome: home, configBaseRef: 'HEAD', trustProjectConfig: true })
      // trust override → working-tree config is honored.
      expect(Object.keys(cfg.channels)).toContain('extra')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
      fs.rmSync(home, { recursive: true, force: true })
    }
  })
})
