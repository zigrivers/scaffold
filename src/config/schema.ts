// src/config/schema.ts

import { z } from 'zod'
import { ALL_COUPLING_VALIDATORS, configKeyFor } from './validators/index.js'
import { loadGlobalStepSlugs } from '../core/pipeline/global-steps.js'
import { getPackageMethodologyDir } from '../utils/fs.js'

const CustomStepSchema = z.object({
  enabled: z.boolean().optional(),
  depth: z.number().int().min(1).max(5).optional(),
}).strict()

const CustomSchema = z.object({
  default_depth: z.number().int().min(1).max(5).optional(),
  steps: z.record(z.string(), CustomStepSchema).optional(),
}).strict()

export const ProjectTypeSchema = z.enum([
  'web-app', 'mobile-app', 'backend', 'cli', 'library', 'game',
  'data-pipeline', 'ml', 'browser-extension', 'research',
])

export const WebAppConfigSchema = z.object({
  renderingStrategy: z.enum(['spa', 'ssr', 'ssg', 'hybrid']),
  deployTarget: z.enum(['static', 'serverless', 'container', 'edge', 'long-running']).default('serverless'),
  realtime: z.enum(['none', 'websocket', 'sse']).default('none'),
  authFlow: z.enum(['none', 'session', 'oauth', 'passkey']).default('none'),
}).strict()

export const BackendConfigSchema = z.object({
  apiStyle: z.enum(['rest', 'graphql', 'grpc', 'trpc', 'none']),
  dataStore: z.array(z.enum(['relational', 'document', 'key-value'])).min(1).default(['relational']),
  authMechanism: z.enum(['none', 'jwt', 'session', 'oauth', 'apikey']).default('none'),
  asyncMessaging: z.enum(['none', 'queue', 'event-driven']).default('none'),
  deployTarget: z.enum(['serverless', 'container', 'long-running']).default('container'),
  domain: z.enum(['none', 'fintech']).default('none'),
}).strict()

export const CliConfigSchema = z.object({
  interactivity: z.enum(['args-only', 'interactive', 'hybrid']),
  distributionChannels: z.array(
    z.enum(['package-manager', 'system-package-manager', 'standalone-binary', 'container']),
  ).min(1).default(['package-manager']),
  hasStructuredOutput: z.boolean().default(false),
}).strict()

export const LibraryConfigSchema = z.object({
  visibility: z.enum(['public', 'internal']),
  runtimeTarget: z.enum(['node', 'browser', 'isomorphic', 'edge']).default('isomorphic'),
  bundleFormat: z.enum(['esm', 'cjs', 'dual', 'unbundled']).default('dual'),
  hasTypeDefinitions: z.boolean().default(true),
  documentationLevel: z.enum(['none', 'readme', 'api-docs', 'full-site']).default('readme'),
}).strict()

export const MobileAppConfigSchema = z.object({
  platform: z.enum(['ios', 'android', 'cross-platform']),
  distributionModel: z.enum(['public', 'private', 'mixed']).default('public'),
  offlineSupport: z.enum(['none', 'cache', 'offline-first']).default('none'),
  hasPushNotifications: z.boolean().default(false),
}).strict()

export const DataPipelineConfigSchema = z.object({
  processingModel: z.enum(['batch', 'streaming', 'hybrid']),
  orchestration: z.enum(['none', 'dag-based', 'event-driven', 'scheduled']).default('none'),
  dataQualityStrategy: z.enum(['none', 'validation', 'testing', 'observability']).default('validation'),
  schemaManagement: z.enum(['none', 'schema-registry', 'contracts']).default('none'),
  hasDataCatalog: z.boolean().default(false),
}).strict()

export const MlConfigSchema = z.object({
  projectPhase: z.enum(['training', 'inference', 'both']),
  modelType: z.enum(['classical', 'deep-learning', 'llm']).default('deep-learning'),
  servingPattern: z.enum(['none', 'batch', 'realtime', 'edge']).default('none'),
  hasExperimentTracking: z.boolean().default(true),
}).strict()

export const BrowserExtensionConfigSchema = z.object({
  manifestVersion: z.enum(['2', '3']).default('3'),
  uiSurfaces: z.array(z.enum(['popup', 'options', 'newtab', 'devtools', 'sidepanel'])).default(['popup']),
  hasContentScript: z.boolean().default(false),
  hasBackgroundWorker: z.boolean().default(true),
}).strict()

export const ResearchConfigSchema = z.object({
  experimentDriver: z.enum([
    'code-driven', 'config-driven', 'api-driven', 'notebook-driven',
  ]),
  interactionMode: z.enum([
    'autonomous', 'checkpoint-gated', 'human-guided',
  ]).default('checkpoint-gated'),
  hasExperimentTracking: z.boolean().default(true),
  domain: z.enum([
    'none', 'quant-finance', 'ml-research', 'simulation',
  ]).default('none'),
}).strict()

export const GameConfigSchema = z.object({
  engine: z.enum(['unity', 'unreal', 'godot', 'custom']),
  multiplayerMode: z.enum(['none', 'local', 'online', 'hybrid']).default('none'),
  narrative: z.enum(['none', 'light', 'heavy']).default('none'),
  contentStructure: z.enum(['discrete', 'open-world', 'procedural', 'endless', 'mission-based']).default('discrete'),
  economy: z.enum(['none', 'progression', 'monetized', 'both']).default('none'),
  onlineServices: z.array(z.enum(['leaderboards', 'accounts', 'matchmaking', 'live-ops'])).default([]),
  persistence: z.enum(['none', 'settings-only', 'profile', 'progression', 'cloud']).default('progression'),
  targetPlatforms: z.array(
    z.enum(['pc', 'web', 'ios', 'android', 'ps5', 'xbox', 'switch', 'vr', 'ar']),
  ).min(1).default(['pc']),
  supportedLocales: z.array(
    z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Must be a valid locale code (e.g. "en", "en-US", "ja", "fr-FR")'),
  ).min(1).default(['en']),
  hasModding: z.boolean().default(false),
  npcAiComplexity: z.enum(['none', 'simple', 'complex']).default('none'),
}).strict()

export const ServiceSchema = z.object({
  name: z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, {
    message: 'name must be kebab-case starting with a letter',
  }),
  description: z.string().optional(),
  projectType: ProjectTypeSchema,
  backendConfig: BackendConfigSchema.optional(),
  webAppConfig: WebAppConfigSchema.optional(),
  researchConfig: ResearchConfigSchema.optional(),
  libraryConfig: LibraryConfigSchema.optional(),
  cliConfig: CliConfigSchema.optional(),
  mobileAppConfig: MobileAppConfigSchema.optional(),
  dataPipelineConfig: DataPipelineConfigSchema.optional(),
  mlConfig: MlConfigSchema.optional(),
  gameConfig: GameConfigSchema.optional(),
  browserExtensionConfig: BrowserExtensionConfigSchema.optional(),
  path: z.string().optional(),
  exports: z.array(
    z.object({ step: z.string().regex(/^[a-z][a-z0-9-]*$/, 'exports.step must be kebab-case') }),
  ).optional(),
}).strict().superRefine((svc, ctx) => {
  // Shared per-type coupling (config present without matching projectType).
  for (const v of ALL_COUPLING_VALIDATORS) {
    v.validate(ctx, [], svc.projectType, (svc as Record<string, unknown>)[v.configKey])
  }
  // ServiceSchema-only forward rule: projectType without matching config.
  const expectedKey = configKeyFor(svc.projectType)
  if ((svc as Record<string, unknown>)[expectedKey] === undefined) {
    ctx.addIssue({
      path: [expectedKey],
      code: 'custom',
      message: `${svc.projectType} service "${svc.name}" requires ${expectedKey}`,
    })
  }
})

export const ProjectSchema = z.object({
  name: z.string().min(1).optional(),
  platforms: z.array(z.enum(['web', 'mobile', 'desktop'])).optional(),
  projectType: ProjectTypeSchema.optional(),
  gameConfig: GameConfigSchema.optional(),
  webAppConfig: WebAppConfigSchema.optional(),
  backendConfig: BackendConfigSchema.optional(),
  cliConfig: CliConfigSchema.optional(),
  libraryConfig: LibraryConfigSchema.optional(),
  mobileAppConfig: MobileAppConfigSchema.optional(),
  dataPipelineConfig: DataPipelineConfigSchema.optional(),
  mlConfig: MlConfigSchema.optional(),
  browserExtensionConfig: BrowserExtensionConfigSchema.optional(),
  researchConfig: ResearchConfigSchema.optional(),
  services: z.array(ServiceSchema).min(1).optional(),
}).passthrough()  // allow unknown fields per ADR-033
  .superRefine((data, ctx) => {
    for (const v of ALL_COUPLING_VALIDATORS) {
      v.validate(
        ctx,
        [],
        data.projectType,
        (data as Record<string, unknown>)[v.configKey],
      )
    }
    // Unique service names
    if (data.services) {
      const names = data.services.map(s => s.name)
      const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))]
      if (dupes.length > 0) {
        ctx.addIssue({
          path: ['services'],
          code: 'custom',
          message: `Duplicate service names: ${dupes.join(', ')}`,
        })
      }
    }

    // Reject global steps in service exports (Wave 3c).
    // Note: this reads the packaged multi-service-overlay.yml; user-supplied
    // methodology dirs aren't a feature yet (methodology is 'deep'|'mvp'|'custom'
    // where 'custom' only overrides per-step settings). If that changes, plumb
    // the resolved methodologyDir through ConfigSchema.superRefine instead.
    if (data.services) {
      try {
        const globalSteps = loadGlobalStepSlugs(getPackageMethodologyDir())
        for (let i = 0; i < data.services.length; i++) {
          const svc = data.services[i]
          const exps = svc.exports ?? []
          for (let j = 0; j < exps.length; j++) {
            const exp = exps[j]
            if (globalSteps.has(exp.step)) {
              ctx.addIssue({
                path: ['services', i, 'exports', j, 'step'],
                code: 'custom',
                message:
                  `Service '${svc.name}' cannot export global step '${exp.step}' ` +
                  '(global steps live in root state)',
              })
            }
          }
        }
      } catch {
        // If the multi-service overlay can't be loaded (sandboxed tests, missing file),
        // skip the check. Defense-in-depth happens at runtime in cross-reads.ts.
      }
    }
  })

export const ConfigSchema = z.object({
  version: z.literal(2),
  methodology: z.enum(['deep', 'mvp', 'custom']).default('deep'),
  custom: CustomSchema.optional(),
  platforms: z.array(z.enum(['claude-code', 'codex', 'gemini'])).min(1).default(['claude-code']),
  project: ProjectSchema.optional(),
}).passthrough()  // allow unknown fields at top level per ADR-033

export type ParsedConfig = z.infer<typeof ConfigSchema>
