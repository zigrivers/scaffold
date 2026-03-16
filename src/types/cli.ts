import type { ScaffoldError, ScaffoldWarning } from './errors.js'

export interface GlobalFlags {
  format?: 'json'
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

export interface CommandResult {
  exitCode: number
  data?: unknown
  errors?: ScaffoldError[]
  warnings?: ScaffoldWarning[]
}
