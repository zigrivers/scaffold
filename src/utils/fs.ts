import fs from 'node:fs'

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
