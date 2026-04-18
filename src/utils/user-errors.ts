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
