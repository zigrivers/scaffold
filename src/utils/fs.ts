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

/**
 * The npm package name of scaffold itself. Used to gate the project-local
 * content override (see resolveContentDir).
 */
const SCAFFOLD_PACKAGE_NAME = '@zigrivers/scaffold'

/**
 * True only when `dir` is scaffold's own source/install tree, detected by its
 * package.json name. This gates the dev-mode content override so that a
 * downstream project which merely happens to have a `content/` directory
 * (e.g. a scaffold-like CLI tool, whose project-structure step generates
 * `content/pipeline/` + `content/methodology/`) does NOT shadow scaffold's
 * bundled content. Without this gate the resolved pipeline silently collapses.
 */
function isScaffoldPackageRoot(dir: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    return pkg?.name === SCAFFOLD_PACKAGE_NAME
  } catch {
    return false
  }
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
