import {
  ServiceRequiredError, ServiceRejectedError,
  ServiceNotFoundError, ServiceFlagWithoutServicesError,
  MultiServiceOverlayMissingError, MultiServiceNotSupportedError,
  toScaffoldError,
} from '../utils/user-errors.js'
import type { ScaffoldUserError } from '../utils/user-errors.js'
import type { ScaffoldConfig } from '../types/index.js'
import type { OutputContext } from './output/context.js'

export interface GuardContext {
  commandName: string
  output: Pick<OutputContext, 'error' | 'fail' | 'result' | 'warn'>
}

/**
 * Report a guard failure through the output envelope and set the exit code.
 *
 * Guards used to call `output.error(err.message)` — stderr only — and then set
 * exit 2. That threw away the error's code and recovery, left `--format json`
 * with a non-zero exit and EMPTY stdout, and used MissingDependency (2) for
 * what is plainly a validation failure. Because these guards back
 * run/skip/complete/next/status, every one of those commands inherited it.
 *
 * `toScaffoldError` supplies the code, the recovery, and ExitCode.ValidationError
 * from the single mapping in USER_ERROR_CODES, so the guard layer cannot drift
 * from the rest of the CLI.
 */
function failGuard(ctx: GuardContext, err: ScaffoldUserError): false {
  const scaffoldError = toScaffoldError(err)
  ctx.output.fail([scaffoldError])
  process.exitCode = scaffoldError.exitCode
  return false
}

/** Guard for step-targeting commands (run, skip, complete). */
export function guardStepCommand(
  step: string,
  config: Partial<ScaffoldConfig>,
  service: string | undefined,
  globalSteps: Set<string>,
  ctx: GuardContext,
): boolean {
  const services = config?.project?.services
  const hasServices = services && services.length > 0

  // Fail-fast: multi-service without overlay → empty globalSteps
  if (hasServices && globalSteps.size === 0) {
    return failGuard(ctx, new MultiServiceOverlayMissingError())
  }

  if (service && !hasServices) {
    return failGuard(ctx, new ServiceFlagWithoutServicesError())
  }

  if (hasServices && !globalSteps.has(step) && !service) {
    return failGuard(ctx, new ServiceRequiredError(step))
  }

  if (hasServices && globalSteps.has(step) && service) {
    return failGuard(ctx, new ServiceRejectedError(step))
  }

  if (service && hasServices) {
    const found = services!.some((s: { name: string }) => s.name === service)
    if (!found) {
      return failGuard(ctx, new ServiceNotFoundError(service))
    }
  }
  return true
}

/** Guard for step-less commands (next, status, dashboard, info, decisions). */
export function guardSteplessCommand(
  config: Partial<ScaffoldConfig>,
  service: string | undefined,
  ctx: GuardContext,
): boolean {
  if (service) {
    const services = config?.project?.services
    if (!services || services.length === 0) {
      return failGuard(ctx, new ServiceFlagWithoutServicesError())
    }
    const found = services.some((s: { name: string }) => s.name === service)
    if (!found) {
      return failGuard(ctx, new ServiceNotFoundError(service))
    }
  }
  return true
}

// Backward compat — keep old function during transition
/** @deprecated Use guardStepCommand or guardSteplessCommand */
export function assertSingleServiceOrExit(
  config: Partial<ScaffoldConfig>,
  ctx: GuardContext,
): boolean {
  const services = config?.project?.services
  if (services && services.length > 0) {
    // The inline string this replaced was character-for-character the message
    // MultiServiceNotSupportedError already produces; using the class gets the
    // code and recovery for free rather than duplicating the wording.
    return failGuard(ctx, new MultiServiceNotSupportedError(ctx.commandName))
  }
  return true
}
