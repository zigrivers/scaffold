import { MultiServiceNotSupportedError } from '../utils/user-errors.js'
import type { ScaffoldConfig } from '../types/index.js'

export interface GuardContext {
  commandName: string
  output: { error: (message: string) => void; result: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }
}

export function assertSingleServiceOrExit(
  config: Partial<ScaffoldConfig>,
  ctx: GuardContext,
): void {
  const services = config?.project?.services
  if (services && services.length > 0) {
    const err = new MultiServiceNotSupportedError(ctx.commandName)
    ctx.output.error(err.message)
    process.exitCode = 2
  }
}
