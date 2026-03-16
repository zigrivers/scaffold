export type LockableCommand = 'run' | 'skip' | 'init' | 'reset' | 'adopt'

export interface LockFile {
  holder: string
  prompt?: string
  pid: number
  started: string
  processStartedAt: string
  command: LockableCommand
}
