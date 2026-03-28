import fs from 'node:fs'
import path from 'node:path'
import type { DetectionResult, ProjectSignal } from './signals.js'

/**
 * Detect project mode by scanning for signals in projectRoot.
 * Priority: v1-tracking > brownfield-signals > greenfield (default)
 */
export function detectProjectMode(projectRoot: string): DetectionResult {
  const signals: ProjectSignal[] = []

  // Check for v1 tracking comments (highest priority)
  const v1Files = [
    'docs/prd.md', 'docs/plan.md', 'docs/user-stories.md',
    'docs/domain-model.md', 'docs/system-architecture.md',
  ]
  let hasV1Tracking = false
  for (const relPath of v1Files) {
    const fullPath = path.join(projectRoot, relPath)
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8')
      if (/<!--\s*scaffold:[a-z-]+\s+v\d+/.test(content)) {
        hasV1Tracking = true
        signals.push({ category: 'v1-tracking', file: relPath, detected: true })
      }
    }
  }

  if (hasV1Tracking) {
    return { mode: 'v1-migration', signals, methodologySuggestion: 'deep' }
  }

  // Check for brownfield signals
  const packageManifests = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'pom.xml']
  let hasPackageManifest = false
  for (const m of packageManifests) {
    if (fs.existsSync(path.join(projectRoot, m))) {
      hasPackageManifest = true
      signals.push({ category: 'package-manifest', file: m, detected: true })
      break
    }
  }

  const sourceDirs = ['src', 'lib', 'app', 'packages']
  let hasSourceDir = false
  for (const d of sourceDirs) {
    const dirPath = path.join(projectRoot, d)
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      hasSourceDir = true
      signals.push({ category: 'source-directory', file: d, detected: true })
      break
    }
  }

  // Count source files for methodology suggestion
  let sourceFileCount = 0
  try {
    const walk = (dir: string, depth: number) => {
      if (depth > 3) return
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isFile() && /\.(ts|js|py|go|rs)$/.test(entry.name)) sourceFileCount++
        else if (entry.isDirectory() && !entry.name.startsWith('.')) walk(path.join(dir, entry.name), depth + 1)
      }
    }
    walk(projectRoot, 0)
  } catch { /* ignore */ }

  // Check docs and CI
  if (fs.existsSync(path.join(projectRoot, 'docs'))) {
    signals.push({ category: 'documentation', file: 'docs', detected: true })
  }
  if (fs.existsSync(path.join(projectRoot, '.github/workflows'))) {
    signals.push({ category: 'ci-config', file: '.github/workflows', detected: true })
  }
  if (
    fs.existsSync(path.join(projectRoot, 'vitest.config.ts')) ||
    fs.existsSync(path.join(projectRoot, 'jest.config.js'))
  ) {
    signals.push({ category: 'test-config', file: 'vitest.config.ts', detected: true })
  }

  if (hasPackageManifest || hasSourceDir) {
    const suggestion = sourceFileCount > 10 ? 'deep' : 'mvp'
    return { mode: 'brownfield', signals, methodologySuggestion: suggestion }
  }

  return { mode: 'greenfield', signals, methodologySuggestion: 'deep' }
}
