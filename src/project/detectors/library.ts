import type { SignalContext } from './context.js'
import type { LibraryMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

export function detectLibrary(ctx: SignalContext): LibraryMatch | null {
  const ev: DetectionEvidence[] = []

  const pkg = ctx.packageJson()
  const cargo = ctx.cargoToml()
  const py = ctx.pyprojectToml()

  // High-tier: exports a library AND doesn't also export a CLI
  const isPureNpmLib = pkg && (pkg.main || pkg.module || pkg.exports) && !pkg.bin
  const isPureRustLib = cargo?.lib && (!cargo.bin || cargo.bin.length === 0)
  const isPurePyLib = py && (py.project?.name || py.tool?.poetry) && !py.project?.scripts

  // Medium-tier: dual-purpose (library exports + CLI bin) — detectCli also fires high,
  // disambiguate() lets the user pick
  const isDualNpm = pkg && (pkg.main || pkg.module || pkg.exports) && pkg.bin
  const isDualRust = cargo?.lib && cargo.bin && cargo.bin.length > 0

  if (!isPureNpmLib && !isPureRustLib && !isPurePyLib && !isDualNpm && !isDualRust) return null

  if (isPureNpmLib) ev.push(evidence('npm-main-or-module', 'package.json'))
  if (isPureRustLib) ev.push(evidence('cargo-lib', 'Cargo.toml'))
  if (isPurePyLib) ev.push(evidence('python-package', 'pyproject.toml'))
  if (isDualNpm) ev.push(evidence('npm-main-plus-bin', 'package.json', 'dual-purpose library + CLI'))
  if (isDualRust) ev.push(evidence('cargo-lib-plus-bin', 'Cargo.toml', 'dual-purpose crate'))

  const confidence: 'high' | 'medium' = (isDualNpm || isDualRust) ? 'medium' : 'high'

  const partialConfig: LibraryMatch['partialConfig'] = {
    visibility: 'public',  // default
  }

  // visibility
  if (pkg?.private === true) {
    partialConfig.visibility = 'internal'
  } else {
    const cargoPkg = cargo?.package as Record<string, unknown> | undefined
    if (cargoPkg?.publish === false) partialConfig.visibility = 'internal'
  }

  // runtimeTarget
  if (pkg?.engines?.node && !pkg.exports) {
    partialConfig.runtimeTarget = 'node'
    ev.push(evidence('engines-node', 'package.json'))
  } else if (pkg?.exports && typeof pkg.exports === 'object') {
    const exportsAny = pkg.exports as Record<string, unknown>
    const main = (exportsAny['.'] ?? exportsAny) as Record<string, unknown> | undefined
    if (main && 'edge' in main) partialConfig.runtimeTarget = 'edge'
    else if (main && 'browser' in main && 'node' in main) partialConfig.runtimeTarget = 'isomorphic'
    else if (main && 'browser' in main) partialConfig.runtimeTarget = 'browser'
  }

  // bundleFormat
  if (pkg) {
    if (pkg.type === 'module' && pkg.exports) partialConfig.bundleFormat = 'esm'
    else if (pkg.main?.endsWith('.cjs') || pkg.type !== 'module') partialConfig.bundleFormat = 'cjs'
  }

  // hasTypeDefinitions
  if (pkg?.types || pkg?.typings) {
    partialConfig.hasTypeDefinitions = true
    ev.push(evidence('pkg-types-field', 'package.json'))
  }

  // documentationLevel — CRITICAL: never set 'none', always omit if no evidence
  const hasFullSite = ctx.hasFile('mkdocs.yml')
    || ctx.hasFile('docusaurus.config.js') || ctx.hasFile('docusaurus.config.ts')
    || ctx.dirExists('.vitepress')
    || (ctx.hasDep('sphinx', 'py') && ctx.hasFile('docs/conf.py'))
    || ctx.hasFile('book.toml')
  const hasStorybook = ctx.dirExists('.storybook')
    || ctx.hasDep('@storybook/react', 'npm')
    || ctx.hasDep('@storybook/core', 'npm')
  const hasTypedoc = ctx.hasDep('typedoc', 'npm') || ctx.hasFile('typedoc.json')
  const hasDocsDir = ctx.dirExists('docs')
  const hasReadme = ctx.hasFile('README.md')

  if (hasFullSite) partialConfig.documentationLevel = 'full-site'
  else if (hasStorybook) partialConfig.documentationLevel = 'api-docs'
  else if (hasTypedoc) partialConfig.documentationLevel = 'api-docs'
  else if (hasDocsDir) partialConfig.documentationLevel = 'api-docs'
  else if (hasReadme) partialConfig.documentationLevel = 'readme'
  // else: omit; Zod default 'readme' applies

  // Warning: public library with no README
  if (partialConfig.visibility === 'public' && !hasReadme) {
    ;(ctx.warnings as ScaffoldWarning[]).push({
      code: 'ADOPT_PUBLIC_LIBRARY_NO_README',
      message: 'Detected public library but no README.md found.'
        + ' Defaulting documentationLevel to readme;'
        + ' add a README.md before publishing.',
      context: { project: pkg?.name },
    })
  }

  return {
    projectType: 'library',
    confidence,
    partialConfig,
    evidence: ev,
  }
}

// Type-only import for the warning push (not exported from types module)
type ScaffoldWarning = import('../../types/index.js').ScaffoldWarning
