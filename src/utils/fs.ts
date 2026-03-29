import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Atomically write content to a file using temp-file-then-rename pattern.
 * Write to <path>.tmp, then fs.renameSync to <path>.
 * Prevents corruption if process crashes mid-write.
 */
export function atomicWriteFile(filePath: string, content: string): void {
  const tmpPath = filePath + '.tmp'
  fs.writeFileSync(tmpPath, content, 'utf8')
  fs.renameSync(tmpPath, filePath)
}

/** Check if a file or directory exists. */
export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath)
}

/** Ensure a directory exists, creating it recursively if needed. */
export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true })
}

/**
 * Resolve the package's own root directory (where pipeline/, knowledge/, methodology/ live).
 * Works whether scaffold is run from the repo or installed globally via npm/brew.
 */
export function getPackageRoot(): string {
  const thisFile = fileURLToPath(import.meta.url)
  // thisFile is dist/utils/fs.js (or src/utils/fs.ts in dev)
  // package root is two levels up from utils/
  return path.resolve(path.dirname(thisFile), '..', '..')
}

/**
 * Resolve the pipeline directory.
 * If projectRoot is provided and contains pipeline/, use that (dev/test mode).
 * Otherwise use the package's bundled pipeline/.
 */
export function getPackagePipelineDir(projectRoot?: string): string {
  if (projectRoot) {
    const local = path.join(projectRoot, 'pipeline')
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'pipeline')
}

/**
 * Resolve the knowledge directory.
 * If projectRoot is provided and contains knowledge/, use that (dev/test mode).
 * Otherwise use the package's bundled knowledge/.
 */
export function getPackageKnowledgeDir(projectRoot?: string): string {
  if (projectRoot) {
    const local = path.join(projectRoot, 'knowledge')
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'knowledge')
}

/**
 * Resolve the tools directory.
 * If projectRoot is provided and contains tools/, use that (dev/test mode).
 * Otherwise use the package's bundled tools/.
 */
export function getPackageToolsDir(projectRoot?: string): string {
  if (projectRoot) {
    const local = path.join(projectRoot, 'tools')
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'tools')
}

/**
 * Resolve the methodology directory.
 * If projectRoot is provided and contains methodology/, use that (dev/test mode).
 * Otherwise use the package's bundled methodology/.
 */
export function getPackageMethodologyDir(projectRoot?: string): string {
  if (projectRoot) {
    const local = path.join(projectRoot, 'methodology')
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'methodology')
}
