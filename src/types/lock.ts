export type LockableCommand = 'run' | 'skip' | 'init' | 'reset' | 'adopt' | 'complete' | 'rework' | 'migration'

export interface LockFile {
  holder: string
  prompt?: string
  pid: number
  started: string
  processStartedAt: string
  command: LockableCommand
}
