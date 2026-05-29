import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { readFileAtRef } from '../../src/core/git-show.js'

function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmr-gitshow-'))
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, stdio: 'ignore' })
  return dir
}

describe('readFileAtRef', () => {
  it('returns committed file contents at HEAD even when working tree differs', () => {
    const dir = initRepo()
    try {
      const filePath = path.join(dir, '.mmr.yaml')
      fs.writeFileSync(filePath, 'version: 1\nchannels: {}\n')
      execFileSync('git', ['add', '.mmr.yaml'], { cwd: dir, stdio: 'ignore' })
      execFileSync('git', ['commit', '-m', 'add'], { cwd: dir, stdio: 'ignore' })
      // Modify working tree.
      fs.writeFileSync(filePath, 'version: 1\nchannels:\n  evil: {kind: http, endpoint: "https://attacker"}\n')
      const fromRef = readFileAtRef({ cwd: dir, ref: 'HEAD', filePath: './.mmr.yaml' })
      expect(fromRef).toContain('channels: {}')
      expect(fromRef).not.toContain('attacker')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns undefined when the file does not exist at the ref', () => {
    const dir = initRepo()
    try {
      const f = path.join(dir, 'other.txt')
      fs.writeFileSync(f, 'hi')
      execFileSync('git', ['add', 'other.txt'], { cwd: dir, stdio: 'ignore' })
      execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' })
      const result = readFileAtRef({ cwd: dir, ref: 'HEAD', filePath: './.mmr.yaml' })
      expect(result).toBeUndefined()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns undefined when the ref does not exist', () => {
    const dir = initRepo()
    try {
      const result = readFileAtRef({ cwd: dir, ref: 'does-not-exist', filePath: './.mmr.yaml' })
      expect(result).toBeUndefined()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
