import type { ScaffoldError, ScaffoldWarning } from '../types/index.js'

/** Global flags available to all commands. */
export interface GlobalArgs {
  format?: 'json'
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

export type { ScaffoldError, ScaffoldWarning }
