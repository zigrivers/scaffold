import path from 'node:path'
import fs from 'node:fs'

/**
 * Resolves file paths for global or service-scoped scaffold state.
 * When `service` is undefined, paths resolve to `.scaffold/`.
 * When `service` is provided, paths resolve to `.scaffold/services/{name}/`.
 */
export class StatePathResolver {
  constructor(
    private readonly projectRoot: string,
    private readonly service?: string,
  ) {}

  get scaffoldDir(): string {
    return this.service
      ? path.join(this.projectRoot, '.scaffold', 'services', this.service)
      : path.join(this.projectRoot, '.scaffold')
  }

  get rootScaffoldDir(): string {
    return path.join(this.projectRoot, '.scaffold')
  }

  get statePath(): string { return path.join(this.scaffoldDir, 'state.json') }
  get lockPath(): string { return path.join(this.scaffoldDir, 'lock.json') }
  get decisionsPath(): string { return path.join(this.scaffoldDir, 'decisions.jsonl') }
  get reworkPath(): string { return path.join(this.scaffoldDir, 'rework.json') }

  /** Whether this resolver targets a specific service (vs root/global). */
  get isServiceScoped(): boolean { return this.service !== undefined }

  /** The service name, if service-scoped. */
  get serviceName(): string | undefined { return this.service }

  /** Create the scaffold directory if it doesn't exist. */
  ensureDir(): void {
    fs.mkdirSync(this.scaffoldDir, { recursive: true })
  }
}
