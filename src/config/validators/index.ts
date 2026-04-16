import type { CouplingValidator } from './types.js'
import type { ProjectType } from '../../types/config.js'
import { backendCouplingValidator } from './backend.js'
import { webAppCouplingValidator } from './web-app.js'
import { researchCouplingValidator } from './research.js'
import { cliCouplingValidator } from './cli.js'
import { libraryCouplingValidator } from './library.js'
import { mobileAppCouplingValidator } from './mobile-app.js'
import { dataPipelineCouplingValidator } from './data-pipeline.js'
import { mlCouplingValidator } from './ml.js'
import { gameCouplingValidator } from './game.js'
import { browserExtensionCouplingValidator } from './browser-extension.js'

export const ALL_COUPLING_VALIDATORS: readonly CouplingValidator<unknown>[] = [
  backendCouplingValidator as CouplingValidator<unknown>,
  webAppCouplingValidator as CouplingValidator<unknown>,
  researchCouplingValidator as CouplingValidator<unknown>,
  cliCouplingValidator as CouplingValidator<unknown>,
  libraryCouplingValidator as CouplingValidator<unknown>,
  mobileAppCouplingValidator as CouplingValidator<unknown>,
  dataPipelineCouplingValidator as CouplingValidator<unknown>,
  mlCouplingValidator as CouplingValidator<unknown>,
  gameCouplingValidator as CouplingValidator<unknown>,
  browserExtensionCouplingValidator as CouplingValidator<unknown>,
] as const

export const PROJECT_TYPE_TO_CONFIG_KEY: Readonly<Record<ProjectType, string>> =
  Object.freeze(Object.fromEntries(
    ALL_COUPLING_VALIDATORS.map(v => [v.projectType, v.configKey]),
  )) as Readonly<Record<ProjectType, string>>

export function configKeyFor(projectType: ProjectType): string {
  return PROJECT_TYPE_TO_CONFIG_KEY[projectType]
}

export type { CouplingValidator } from './types.js'
