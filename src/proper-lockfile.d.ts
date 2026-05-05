declare module 'proper-lockfile' {
  interface LockOptions {
    stale?: number
    update?: number
    retries?: number | {
      retries?: number
      factor?: number
      minTimeout?: number
      maxTimeout?: number
      randomize?: boolean
    }
    realpath?: boolean
    lockfilePath?: string
    onCompromised?: (err: Error) => void
  }

  interface UnlockOptions {
    realpath?: boolean
    lockfilePath?: string
  }

  interface CheckOptions {
    stale?: number
    realpath?: boolean
    lockfilePath?: string
  }

  export function lock(path: string, options?: LockOptions): Promise<() => Promise<void>>
  export function unlock(path: string, options?: UnlockOptions): Promise<void>
  export function lockSync(path: string, options?: LockOptions): () => void
  export function unlockSync(path: string, options?: UnlockOptions): void
  export function check(path: string, options?: CheckOptions): Promise<boolean>
  export function checkSync(path: string, options?: CheckOptions): boolean
}
