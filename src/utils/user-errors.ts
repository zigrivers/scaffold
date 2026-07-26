/**
 * Base class for user-facing errors that the CLI handler layer normalizes
 * to an exit code (typically 2) and a diagnostic line. Internal errors
 * that should surface as stack traces do NOT extend this.
 */
export abstract class ScaffoldUserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class FlagConflictError extends ScaffoldUserError {
  constructor(conflictSummary: string) {
    super(`--from cannot be combined with: ${conflictSummary}. Edit services.yml and re-run.`)
  }
}

export class InvalidYamlError extends ScaffoldUserError {
  constructor(sourceLabel: string, detail: string) {
    super(`Invalid YAML in ${sourceLabel}: ${detail}`)
  }
}

export class InvalidConfigError extends ScaffoldUserError {
  constructor(sourceLabel: string, detail: string) {
    super(`Invalid config (${sourceLabel}):\n${detail}`)
  }
}

export class FromPathReadError extends ScaffoldUserError {
  constructor(pathArg: string, cause: string) {
    super(`Cannot read --from path "${pathArg}": ${cause}`)
  }
}

export class TTYStdinError extends ScaffoldUserError {
  constructor() {
    super('--from - requires piped input (stdin is a TTY).')
  }
}

export class MultiServiceNotSupportedError extends ScaffoldUserError {
  constructor(commandName: string) {
    super(
      'Multi-service projects are not yet executable. '
      + `"scaffold ${commandName}" on a config with services[] lands in Wave 2.`,
    )
  }
}

export class ExistingScaffoldError extends ScaffoldUserError {
  constructor(projectRoot: string) {
    super(`.scaffold/ already exists at "${projectRoot}". Use --force to back up and reinitialize.`)
  }
}

export class ServiceRequiredError extends ScaffoldUserError {
  constructor(stepName: string) {
    super(`Step '${stepName}' requires --service flag when services[] is configured.`)
  }
}

export class ServiceRejectedError extends ScaffoldUserError {
  constructor(stepName: string) {
    super(`Step '${stepName}' is a global cross-service step and does not accept --service.`)
  }
}

export class ServiceNotFoundError extends ScaffoldUserError {
  constructor(serviceName: string) {
    super(`Service '${serviceName}' not found in services[].`)
  }
}

export class ServiceFlagWithoutServicesError extends ScaffoldUserError {
  constructor() {
    super('--service requires services[] in config.')
  }
}

export class MultiServiceOverlayMissingError extends ScaffoldUserError {
  constructor() {
    super('Multi-service projects require multi-service-overlay.yml.')
  }
}

export function isScaffoldUserError(err: unknown): err is ScaffoldUserError {
  return err instanceof ScaffoldUserError
}

// ---------------------------------------------------------------------------
// Normalization to coded ScaffoldErrors
// ---------------------------------------------------------------------------

/**
 * Code and recovery for each ScaffoldUserError subclass.
 *
 * `recovery` is REQUIRED, not optional. Every terminal failure must name its
 * own fix, and a mapping that allowed an entry without one would let that
 * guarantee rot silently as subclasses were added.
 */
export const USER_ERROR_CODES: Record<string, { code: string; recovery: string }> = {
  ExistingScaffoldError: {
    code: 'INIT_SCAFFOLD_EXISTS',
    recovery: 'Use --force to back up and reinitialize',
  },
  FlagConflictError: {
    code: 'INIT_FLAG_CONFLICT',
    recovery: 'Use --from on its own, or drop --from and pass the config flags directly',
  },
  InvalidYamlError: {
    code: 'INIT_INVALID_YAML',
    recovery: 'Fix the reported YAML syntax error and re-run',
  },
  InvalidConfigError: {
    code: 'INIT_INVALID_CONFIG',
    recovery: 'Correct the fields listed in the message and re-run',
  },
  FromPathReadError: {
    code: 'INIT_FROM_READ_FAILED',
    recovery: 'Check the --from path exists and is readable',
  },
  TTYStdinError: {
    code: 'INIT_FROM_TTY_STDIN',
    recovery: 'Pipe the config in: cat config.yml | scaffold init --from=-',
  },
  MultiServiceNotSupportedError: {
    code: 'INIT_MULTI_SERVICE_UNSUPPORTED',
    recovery: 'Remove services[] from the config, or run the per-service commands directly',
  },
  ServiceRequiredError: {
    code: 'RUN_SERVICE_REQUIRED',
    recovery: 'Pass --service <name>, using a name from services[] in .scaffold/config.yml',
  },
  ServiceRejectedError: {
    code: 'RUN_SERVICE_REJECTED',
    recovery: 'Drop --service; this step runs once across all services',
  },
  ServiceNotFoundError: {
    code: 'RUN_SERVICE_NOT_FOUND',
    recovery: 'Use a service name listed under services[] in .scaffold/config.yml',
  },
  ServiceFlagWithoutServicesError: {
    code: 'RUN_SERVICE_WITHOUT_SERVICES',
    recovery: 'Drop --service, or add a services[] block to .scaffold/config.yml',
  },
  MultiServiceOverlayMissingError: {
    code: 'INIT_OVERLAY_MISSING',
    recovery: 'Add multi-service-overlay.yml, or remove services[] from the config',
  },
}

/**
 * Normalize a ScaffoldUserError into the coded error the CLI emits.
 *
 * Throws on an unmapped subclass rather than falling back to a generic code.
 * A silent fallback would emit an error with no actionable recovery, which is
 * the exact failure this work exists to remove; failing loudly in development
 * beats shipping an unhelpful error.
 */
export function toScaffoldError(err: ScaffoldUserError): {
  code: string
  message: string
  exitCode: number
  recovery: string
} {
  const mapped = USER_ERROR_CODES[err.name]
  if (!mapped) {
    throw new Error(
      `Unmapped ScaffoldUserError subclass "${err.name}". `
      + 'Add it to USER_ERROR_CODES with a code and an actionable recovery string.',
    )
  }
  return {
    code: mapped.code,
    message: err.message,
    // ExitCode.ValidationError (1). Exit 2 is MissingDependency, which the
    // --from path used to return for input errors — semantically wrong.
    exitCode: 1,
    recovery: mapped.recovery,
  }
}
