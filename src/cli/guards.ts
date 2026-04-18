import {
  ServiceRequiredError, ServiceRejectedError,
  ServiceNotFoundError, ServiceFlagWithoutServicesError,
  MultiServiceOverlayMissingError,
} from '../utils/user-errors.js'
import type { ScaffoldConfig } from '../types/index.js'
import type { OutputContext } from './output/context.js'

export interface GuardContext {
  commandName: string
  output: Pick<OutputContext, 'error' | 'result' | 'warn'>
}

/** Guard for step-targeting commands (run, skip, complete). */
export function guardStepCommand(
  step: string,
  config: Partial<ScaffoldConfig>,
  service: string | undefined,
  globalSteps: Set<string>,
  ctx: GuardContext,
): void {
  const services = config?.project?.services
  const hasServices = services && services.length > 0

  // Fail-fast: multi-service without overlay → empty globalSteps
  if (hasServices && globalSteps.size === 0) {
    const err = new MultiServiceOverlayMissingError()
    ctx.output.error(err.message)
    process.exitCode = 2
    return
  }

  if (service && !hasServices) {
    const err = new ServiceFlagWithoutServicesError()
    ctx.output.error(err.message)
    process.exitCode = 2
    return
  }

  if (hasServices && !globalSteps.has(step) && !service) {
    const err = new ServiceRequiredError(step)
    ctx.output.error(err.message)
    process.exitCode = 2
    return
  }

  if (hasServices && globalSteps.has(step) && service) {
    const err = new ServiceRejectedError(step)
    ctx.output.error(err.message)
    process.exitCode = 2
    return
  }

  if (service && hasServices) {
    const found = services!.some((s: { name: string }) => s.name === service)
    if (!found) {
      const err = new ServiceNotFoundError(service)
      ctx.output.error(err.message)
      process.exitCode = 2
      return
    }
  }
}

/** Guard for step-less commands (next, status, dashboard, info, decisions). */
export function guardSteplessCommand(
  config: Partial<ScaffoldConfig>,
  service: string | undefined,
  ctx: GuardContext,
): void {
  if (service) {
    const services = config?.project?.services
    if (!services || services.length === 0) {
      const err = new ServiceFlagWithoutServicesError()
      ctx.output.error(err.message)
      process.exitCode = 2
      return
    }
    const found = services.some((s: { name: string }) => s.name === service)
    if (!found) {
      const err = new ServiceNotFoundError(service)
      ctx.output.error(err.message)
      process.exitCode = 2
      return
    }
  }
}

// Backward compat — keep old function during transition
/** @deprecated Use guardStepCommand or guardSteplessCommand */
export function assertSingleServiceOrExit(
  config: Partial<ScaffoldConfig>,
  ctx: GuardContext,
): void {
  const services = config?.project?.services
  if (services && services.length > 0) {
    ctx.output.error(
      'Multi-service projects are not yet executable. '
      + `"scaffold ${ctx.commandName}" on a config with services[] lands in Wave 2.`,
    )
    process.exitCode = 2
  }
}
