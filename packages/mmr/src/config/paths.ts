import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Resolve the two on-disk config locations MMR reads and writes, and report
 * which exist. Single source of truth for "where does config live / land"
 * (vision B1 / D1). The search order, later-wins, is:
 *   1. built-in defaults
 *   2. user / global  (~/.mmr/config.yaml)
 *   3. project         (<projectRoot>/.mmr.yaml)
 *   4. CLI flags
 */
export function resolveConfigPaths(opts: { projectRoot: string; userHome?: string }): {
  user: string
  project: string
  userExists: boolean
  projectExists: boolean
} {
  const userHome = opts.userHome ?? os.homedir()
  const user = path.join(userHome, '.mmr', 'config.yaml')
  const project = path.join(opts.projectRoot, '.mmr.yaml')
  return {
    user,
    project,
    userExists: fs.existsSync(user),
    projectExists: fs.existsSync(project),
  }
}
