// src/config/schema.ts

import { z } from 'zod'

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
}).strict()

export const CliConfigSchema = z.object({
  interactivity: z.enum(['args-only', 'interactive', 'hybrid']),
  distributionChannels: z.array(z.enum(['package-manager', 'system-package-manager', 'standalone-binary', 'container'])).min(1).default(['package-manager']),
  hasStructuredOutput: z.boolean().default(false),
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

const ProjectSchema = z.object({
  name: z.string().min(1).optional(),
  platforms: z.array(z.enum(['web', 'mobile', 'desktop'])).optional(),
  projectType: ProjectTypeSchema.optional(),
  gameConfig: GameConfigSchema.optional(),
  webAppConfig: WebAppConfigSchema.optional(),
  backendConfig: BackendConfigSchema.optional(),
  cliConfig: CliConfigSchema.optional(),
}).passthrough()  // allow unknown fields per ADR-033
  .superRefine((data, ctx) => {
    if (data.gameConfig !== undefined && data.projectType !== 'game') {
      ctx.addIssue({ path: ['gameConfig'], code: 'custom',
        message: 'gameConfig is only valid when projectType is "game"' })
    }
    if (data.webAppConfig !== undefined && data.projectType !== 'web-app') {
      ctx.addIssue({ path: ['webAppConfig'], code: 'custom',
        message: 'webAppConfig requires projectType: web-app' })
    }
    if (data.backendConfig !== undefined && data.projectType !== 'backend') {
      ctx.addIssue({ path: ['backendConfig'], code: 'custom',
        message: 'backendConfig requires projectType: backend' })
    }
    if (data.cliConfig !== undefined && data.projectType !== 'cli') {
      ctx.addIssue({ path: ['cliConfig'], code: 'custom',
        message: 'cliConfig requires projectType: cli' })
    }
    if (data.webAppConfig) {
      const { renderingStrategy, deployTarget, authFlow } = data.webAppConfig
      if (['ssr', 'hybrid'].includes(renderingStrategy) && deployTarget === 'static') {
        ctx.addIssue({ path: ['webAppConfig', 'deployTarget'], code: 'custom',
          message: 'SSR/hybrid rendering requires compute, not static hosting' })
      }
      if (authFlow === 'session' && deployTarget === 'static') {
        ctx.addIssue({ path: ['webAppConfig', 'authFlow'], code: 'custom',
          message: 'Session auth requires server state, incompatible with static hosting' })
      }
    }
  })

export const ConfigSchema = z.object({
  version: z.literal(2),
  methodology: z.enum(['deep', 'mvp', 'custom']),
  custom: CustomSchema.optional(),
  platforms: z.array(z.enum(['claude-code', 'codex', 'gemini'])).min(1),
  project: ProjectSchema.optional(),
}).passthrough()  // allow unknown fields at top level per ADR-033

export type ParsedConfig = z.infer<typeof ConfigSchema>
