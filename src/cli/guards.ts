import { MultiServiceNotSupportedError } from '../utils/user-errors.js'
import type { ScaffoldConfig } from '../types/index.js'
import type { OutputContext } from './output/context.js'

export interface GuardContext {
  commandName: string
  output: Pick<OutputContext, 'error' | 'result' | 'warn'>
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
