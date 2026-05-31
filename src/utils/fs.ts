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
 * Resolve the package's own root directory (where content/pipeline/, content/knowledge/, etc. live).
 * Works whether scaffold is run from the repo or installed globally via npm/brew.
 */
export function getPackageRoot(): string {
  const thisFile = fileURLToPath(import.meta.url)
  // thisFile is dist/utils/fs.js (or src/utils/fs.ts in dev)
  // package root is two levels up from utils/
  return path.resolve(path.dirname(thisFile), '..', '..')
}

/** Read the `name` field from `<dir>/package.json`, or null if absent/unreadable. */
function readPackageName(dir: string): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    return typeof pkg?.name === 'string' ? pkg.name : null
  } catch {
    return null
  }
}

/**
 * The npm package name of the *running* scaffold, read once from its own
 * package.json (with a literal fallback). Deriving it — rather than hardcoding
 * — means the gate below reads "is projectRoot the same package as the scaffold
 * that's running", which also stays correct for forks/renames.
 */
let cachedOwnPackageName: string | undefined
function ownPackageName(): string {
  if (cachedOwnPackageName === undefined) {
    cachedOwnPackageName = readPackageName(getPackageRoot()) ?? '@zigrivers/scaffold'
  }
  return cachedOwnPackageName
}

/**
 * True only when `dir` is scaffold's own source/install tree, detected by its
 * package.json name matching the running scaffold's. This gates the dev-mode
 * content override so that a downstream project which merely happens to have a
 * `content/` directory (e.g. a scaffold-like CLI tool, whose project-structure
 * step generates `content/pipeline/` + `content/methodology/`) does NOT shadow
 * scaffold's bundled content. Without this gate the resolved pipeline silently
 * collapses. Result is memoized per directory — this runs for every
 * getPackage*Dir call (6+ per command) and scaffold is a short-lived process.
 *
 * Note: only the exact `dir` passed is checked (no upward walk). Callers pass
 * the project root that holds `.scaffold/` and, for scaffold itself, its
 * package.json + content/ sit at that same root.
 */
const scaffoldRootCache = new Map<string, boolean>()
function isScaffoldPackageRoot(dir: string): boolean {
  let cached = scaffoldRootCache.get(dir)
  if (cached === undefined) {
    cached = readPackageName(dir) === ownPackageName()
    scaffoldRootCache.set(dir, cached)
  }
  return cached
}

/**
 * Resolve a `content/<subdir>` directory.
 *
 * The project-local override (`<projectRoot>/content/<subdir>`) is used ONLY
 * when running scaffold against scaffold's own source tree — i.e. developing
 * scaffold itself with a globally-installed binary. For every other project,
 * and when installed, the package's bundled `content/<subdir>` is used.
 */
function resolveContentDir(subdir: string, projectRoot?: string): string {
  if (projectRoot && isScaffoldPackageRoot(projectRoot)) {
    const local = path.join(projectRoot, 'content', subdir)
    if (fs.existsSync(local)) return local
  }
  return path.join(getPackageRoot(), 'content', subdir)
}

/** Resolve the pipeline directory (bundled, unless running against scaffold itself). */
export function getPackagePipelineDir(projectRoot?: string): string {
  return resolveContentDir('pipeline', projectRoot)
}

/** Resolve the knowledge directory (bundled, unless running against scaffold itself). */
export function getPackageKnowledgeDir(projectRoot?: string): string {
  return resolveContentDir('knowledge', projectRoot)
}

/** Resolve the tools directory (bundled, unless running against scaffold itself). */
export function getPackageToolsDir(projectRoot?: string): string {
  return resolveContentDir('tools', projectRoot)
}

/** Resolve the skills template directory (bundled, unless running against scaffold itself). */
export function getPackageSkillsDir(projectRoot?: string): string {
  return resolveContentDir('skills', projectRoot)
}

/** Resolve the methodology directory (bundled, unless running against scaffold itself). */
export function getPackageMethodologyDir(projectRoot?: string): string {
  return resolveContentDir('methodology', projectRoot)
}

/** Resolve the guides directory (bundled, unless running against scaffold itself). */
export function getPackageGuidesDir(projectRoot?: string): string {
  return resolveContentDir('guides', projectRoot)
}
