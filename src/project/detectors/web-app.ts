// src/project/detectors/web-app.ts
import type { SignalContext } from './context.js'
import type { WebAppMatch } from './types.js'
import { evidence } from './types.js'

type RenderingStrategy = 'spa' | 'ssr' | 'ssg' | 'hybrid'
type DeployTarget = 'static' | 'serverless' | 'container' | 'edge' | 'long-running'
type Realtime = 'none' | 'websocket' | 'sse'
type AuthFlow = 'none' | 'session' | 'oauth' | 'passkey'

/** Web framework config files — presence of any means "web project at root". */
const WEB_FRAMEWORK_CONFIGS = [
  'next.config.js', 'next.config.mjs', 'next.config.ts',
  'astro.config.mjs', 'astro.config.ts',
  'remix.config.js', 'remix.config.ts',
  'nuxt.config.ts', 'nuxt.config.js',
  'svelte.config.js', 'svelte.config.ts',
  'vite.config.ts', 'vite.config.js', 'vite.config.mjs',
  'angular.json',
] as const

interface FrameworkResult {
  framework: string
  renderingStrategy: RenderingStrategy
  deployTarget?: DeployTarget
  evidenceList: ReturnType<typeof evidence>[]
}

/**
 * Returns true when the project looks like a mobile-only project (Flutter,
 * Expo, or React Native with ios/ + android/ dirs). Returns false when a web
 * framework config file is present at root (monorepo case — the web detector
 * should still fire).
 */
function isMobileProject(ctx: SignalContext): boolean {
  // If any web framework config file exists, this is a monorepo — skip disqualifier.
  for (const cfg of WEB_FRAMEWORK_CONFIGS) {
    if (ctx.hasFile(cfg)) return false
  }

  // Flutter
  if (ctx.hasFile('pubspec.yaml')) return true

  // Expo
  if (ctx.hasFile('app.json') && ctx.hasDep('expo', 'npm')) return true

  // React Native — both native dirs present
  if (ctx.dirExists('ios') && ctx.dirExists('android')) return true

  return false
}

/** Reads the first existing file from a list, returning its content. */
function readFirst(ctx: SignalContext, paths: readonly string[]): string | undefined {
  for (const p of paths) {
    const content = ctx.readFileText(p)
    if (content !== undefined) return content
  }
  return undefined
}

function detectNextJs(ctx: SignalContext): FrameworkResult | null {
  if (!ctx.hasDep('next', 'npm')) return null

  const configContent = readFirst(ctx, ['next.config.mjs', 'next.config.ts', 'next.config.js'])
  const evidenceList = [evidence('next-dep', 'package.json')]

  let renderingStrategy: RenderingStrategy = 'ssr'

  if (configContent) {
    if (/output\s*:\s*['"]export['"]/.test(configContent)) {
      renderingStrategy = 'ssg'
    } else if (/output\s*:\s*['"]standalone['"]/.test(configContent)) {
      renderingStrategy = 'ssr'
    }
    evidenceList.push(evidence('next-config', 'next.config.mjs'))
  }

  // Hybrid detection: both app/ and pages/ directories present
  if (ctx.dirExists('app') && ctx.dirExists('pages')) {
    renderingStrategy = 'hybrid'
    evidenceList.push(evidence('next-hybrid', 'app/ + pages/'))
  }

  return { framework: 'next', renderingStrategy, evidenceList }
}

function detectAstro(ctx: SignalContext): FrameworkResult | null {
  if (!ctx.hasDep('astro', 'npm')) return null

  const configContent = readFirst(ctx, ['astro.config.mjs', 'astro.config.ts'])
  const evidenceList = [evidence('astro-dep', 'package.json')]

  let renderingStrategy: RenderingStrategy = 'ssg'

  if (configContent) {
    if (/output\s*:\s*['"]server['"]/.test(configContent)) {
      renderingStrategy = 'ssr'
    } else if (/output\s*:\s*['"]hybrid['"]/.test(configContent)) {
      renderingStrategy = 'hybrid'
    }
    evidenceList.push(evidence('astro-config', 'astro.config.mjs'))
  }

  return { framework: 'astro', renderingStrategy, evidenceList }
}

function detectRemix(ctx: SignalContext): FrameworkResult | null {
  if (!ctx.hasDep('@remix-run/react', 'npm') && !ctx.hasDep('@remix-run/node', 'npm')) return null
  return {
    framework: 'remix',
    renderingStrategy: 'ssr',
    evidenceList: [evidence('remix-dep', 'package.json')],
  }
}

function detectNuxt(ctx: SignalContext): FrameworkResult | null {
  if (!ctx.hasDep('nuxt', 'npm')) return null

  const configContent = readFirst(ctx, ['nuxt.config.ts', 'nuxt.config.js'])
  const evidenceList = [evidence('nuxt-dep', 'package.json')]

  let renderingStrategy: RenderingStrategy = 'ssr'

  if (configContent && /ssr\s*:\s*false/.test(configContent)) {
    renderingStrategy = 'spa'
  }

  return { framework: 'nuxt', renderingStrategy, evidenceList }
}

function detectSvelteKit(ctx: SignalContext): FrameworkResult | null {
  if (!ctx.hasDep('@sveltejs/kit', 'npm')) return null

  const evidenceList = [evidence('sveltekit-dep', 'package.json')]
  let renderingStrategy: RenderingStrategy = 'ssr'
  let deployTarget: DeployTarget | undefined

  // Adapter-based deploy target inference
  if (ctx.hasDep('@sveltejs/adapter-static', 'npm')) {
    renderingStrategy = 'ssg'
    deployTarget = 'static'
  } else if (
    ctx.hasDep('@sveltejs/adapter-vercel', 'npm')
    || ctx.hasDep('@sveltejs/adapter-netlify', 'npm')
    || ctx.hasDep('@sveltejs/adapter-auto', 'npm')
  ) {
    deployTarget = 'serverless'
  } else if (ctx.hasDep('@sveltejs/adapter-cloudflare', 'npm')) {
    deployTarget = 'edge'
  } else if (ctx.hasDep('@sveltejs/adapter-node', 'npm')) {
    deployTarget = 'container'
  }

  return { framework: 'sveltekit', renderingStrategy, deployTarget, evidenceList }
}

function detectVite(ctx: SignalContext): FrameworkResult | null {
  if (!ctx.hasDep('vite', 'npm')) return null

  // Vite requires an HTML entry point to be considered a web app
  if (!ctx.hasFile('index.html') && !ctx.hasFile('public/index.html')) return null

  return {
    framework: 'vite',
    renderingStrategy: 'spa',
    evidenceList: [evidence('vite-dep', 'package.json'), evidence('vite-html', 'index.html')],
  }
}

function detectAngular(ctx: SignalContext): FrameworkResult | null {
  if (!ctx.hasFile('angular.json')) return null

  return {
    framework: 'angular',
    renderingStrategy: 'spa',
    evidenceList: [evidence('angular-json', 'angular.json')],
  }
}

/** Deploy target fallback from platform-specific config files. */
function inferDeployTarget(ctx: SignalContext): DeployTarget | undefined {
  if (ctx.hasFile('vercel.json')) return 'serverless'
  if (ctx.hasFile('netlify.toml')) return 'serverless'
  if (ctx.hasFile('wrangler.toml')) return 'edge'
  if (ctx.hasFile('Dockerfile')) return 'container'
  return undefined
}

/** Detect realtime capabilities from dependencies. */
function inferRealtime(ctx: SignalContext): Realtime {
  if (ctx.hasDep('socket.io', 'npm') || ctx.hasDep('socket.io-client', 'npm')) return 'websocket'
  if (ctx.hasDep('ws', 'npm')) return 'websocket'
  return 'none'
}

/** Detect auth flow from dependencies. */
function inferAuthFlow(ctx: SignalContext): AuthFlow {
  // Session-based auth libraries
  const sessionDeps = ['next-auth', '@auth/core', 'lucia', '@supabase/supabase-js']
  if (ctx.hasAnyDep(sessionDeps, 'npm')) return 'session'
  // OAuth-specific libraries
  const oauthDeps = [
    '@clerk/nextjs', '@clerk/clerk-react',
    '@auth0/nextjs-auth0', '@auth0/auth0-react',
  ]
  if (ctx.hasAnyDep(oauthDeps, 'npm')) return 'oauth'
  return 'none'
}

/**
 * Detects web-app projects by framework signature.
 *
 * Framework cascade: Next.js > Astro > Remix > Nuxt > SvelteKit > Vite > Angular.
 * First match wins. Also infers rendering strategy, deploy target, realtime, and auth flow.
 *
 * Mobile disqualifier: returns null if the project looks mobile-only (Flutter,
 * Expo, React Native) UNLESS a web framework config file is present (monorepo).
 *
 * IMPORTANT: this detector ONLY uses the SignalContext API — no direct fs/path imports.
 */
export function detectWebApp(ctx: SignalContext): WebAppMatch | null {
  // Mobile disqualifier — but not if web framework configs are present
  if (isMobileProject(ctx)) return null

  // Framework detection cascade
  const frameworkDetectors = [
    detectNextJs, detectAstro, detectRemix, detectNuxt,
    detectSvelteKit, detectVite, detectAngular,
  ]

  let framework: FrameworkResult | null = null
  for (const detect of frameworkDetectors) {
    framework = detect(ctx)
    if (framework) break
  }

  if (!framework) return null

  // Deploy target: use framework-specific if available, else infer from config files
  const deployTarget = framework.deployTarget ?? inferDeployTarget(ctx)

  // Realtime + auth
  const realtime = inferRealtime(ctx)
  const authFlow = inferAuthFlow(ctx)

  return {
    projectType: 'web-app',
    confidence: 'high',
    partialConfig: {
      renderingStrategy: framework.renderingStrategy,
      ...(deployTarget && { deployTarget }),
      ...(realtime !== 'none' && { realtime }),
      ...(authFlow !== 'none' && { authFlow }),
    },
    evidence: [...framework.evidenceList],
  }
}
