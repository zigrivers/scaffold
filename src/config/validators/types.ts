import type { z } from 'zod'
import type { ProjectType } from '../../types/config.js'

/**
 * A coupling validator encapsulates the rules that relate a given project
 * type's per-type config to the `projectType` value. Used by both
 * `ProjectSchema.superRefine` and `ServiceSchema.superRefine` via the
 * registry at `src/config/validators/index.ts`.
 *
 * Preserves the existing asymmetric rule: a config set without the matching
 * projectType is an error; projectType set without the matching config is
 * NOT an error in root ProjectSchema (see ServiceSchema for the forward
 * rule).
 */
export interface CouplingValidator<T> {
  readonly configKey: string
  readonly projectType: ProjectType
  validate(
    ctx: z.RefinementCtx,
    path: (string | number)[],
    projectType: ProjectType | undefined,
    config: T | undefined,
  ): void
}
