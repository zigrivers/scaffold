// src/project/detectors/types.ts
import type { z } from 'zod'
import type {
  WebAppConfigSchema, BackendConfigSchema, CliConfigSchema, LibraryConfigSchema,
  MobileAppConfigSchema, DataPipelineConfigSchema, MlConfigSchema, ResearchConfigSchema,
  BrowserExtensionConfigSchema, GameConfigSchema, DataScienceConfigSchema,
} from '../../config/schema.js'

export type Confidence = 'high' | 'medium' | 'low'

export interface DetectionEvidence {
  readonly signal: string
  readonly file?: string
  readonly note?: string
}

interface BaseMatch {
  readonly confidence: Confidence
  readonly evidence: readonly DetectionEvidence[]
}

export interface WebAppMatch extends BaseMatch {
  readonly projectType: 'web-app'
  readonly partialConfig: Partial<z.infer<typeof WebAppConfigSchema>>
}
export interface BackendMatch extends BaseMatch {
  readonly projectType: 'backend'
  readonly partialConfig: Partial<z.infer<typeof BackendConfigSchema>>
}
export interface CliMatch extends BaseMatch {
  readonly projectType: 'cli'
  readonly partialConfig: Partial<z.infer<typeof CliConfigSchema>>
}
export interface LibraryMatch extends BaseMatch {
  readonly projectType: 'library'
  readonly partialConfig: Partial<z.infer<typeof LibraryConfigSchema>>
}
export interface MobileAppMatch extends BaseMatch {
  readonly projectType: 'mobile-app'
  readonly partialConfig: Partial<z.infer<typeof MobileAppConfigSchema>>
}
export interface DataPipelineMatch extends BaseMatch {
  readonly projectType: 'data-pipeline'
  readonly partialConfig: Partial<z.infer<typeof DataPipelineConfigSchema>>
}
export interface MlMatch extends BaseMatch {
  readonly projectType: 'ml'
  readonly partialConfig: Partial<z.infer<typeof MlConfigSchema>>
}
export interface ResearchMatch extends BaseMatch {
  readonly projectType: 'research'
  readonly partialConfig: Partial<z.infer<typeof ResearchConfigSchema>>
}
export interface BrowserExtensionMatch extends BaseMatch {
  readonly projectType: 'browser-extension'
  readonly partialConfig: Partial<z.infer<typeof BrowserExtensionConfigSchema>>
}
export interface GameMatch extends BaseMatch {
  readonly projectType: 'game'
  readonly partialConfig: Partial<z.infer<typeof GameConfigSchema>>
}
export interface DataScienceMatch extends BaseMatch {
  readonly projectType: 'data-science'
  readonly partialConfig: Partial<z.infer<typeof DataScienceConfigSchema>>
}

export type DetectionMatch =
  | WebAppMatch | BackendMatch | CliMatch | LibraryMatch | MobileAppMatch
  | DataPipelineMatch | MlMatch | ResearchMatch | BrowserExtensionMatch | GameMatch
  | DataScienceMatch

export type Detector = (ctx: import('./context.js').SignalContext) => DetectionMatch | null

/** Exhaustiveness helper for discriminated-union routing. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled detection match variant: ${JSON.stringify(value)}`)
}

/** Ergonomic evidence builder. */
export function evidence(signal: string, file?: string, note?: string): DetectionEvidence {
  return { signal, file, note }
}
