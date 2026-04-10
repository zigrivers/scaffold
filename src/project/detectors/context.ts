// src/project/detectors/context.ts
import fs from 'node:fs'
import path from 'node:path'
import { parse as parseTOML } from 'smol-toml'
import { z } from 'zod'
import type { ScaffoldWarning } from '../../types/index.js'

export type ManifestKind = 'npm' | 'py' | 'cargo' | 'go'
export type ManifestStatus = 'missing' | 'parsed' | 'unparseable'
export type NpmDepScope = 'deps' | 'dev' | 'peer' | 'optional'
export type DepScope = NpmDepScope | 'all'

export interface PackageJson {
  readonly name?: string
  readonly version?: string
  readonly private?: boolean
  readonly main?: string
  readonly module?: string
  readonly types?: string
  readonly typings?: string
  readonly browser?: string | Readonly<Record<string, string>>
  readonly exports?: unknown
  readonly bin?: string | Readonly<Record<string, string>>
  readonly type?: 'module' | 'commonjs'
  readonly engines?: Readonly<Record<string, string>>
  readonly scripts?: Readonly<Record<string, string>>
  readonly dependencies?: Readonly<Record<string, string>>
  readonly devDependencies?: Readonly<Record<string, string>>
  readonly peerDependencies?: Readonly<Record<string, string>>
  readonly optionalDependencies?: Readonly<Record<string, string>>
  readonly workspaces?: readonly string[] | { readonly packages?: readonly string[] }
}

export interface PyprojectToml {
  readonly project?: {
    readonly name?: string
    readonly dependencies?: readonly string[]
    readonly 'optional-dependencies'?: Readonly<Record<string, readonly string[]>>
    readonly scripts?: Readonly<Record<string, string>>
  }
  readonly tool?: {
    readonly poetry?: {
      readonly dependencies?: Readonly<Record<string, unknown>>
      readonly 'dev-dependencies'?: Readonly<Record<string, unknown>>
      readonly group?: Readonly<Record<string, {
        readonly dependencies?: Readonly<Record<string, unknown>>
      }>>
    }
    readonly [k: string]: unknown
  }
  readonly 'build-system'?: { readonly requires?: readonly string[] }
}

export interface CargoToml {
  readonly package?: { readonly name?: string; readonly version?: string }
  readonly dependencies?: Readonly<Record<string, unknown>>
  readonly 'dev-dependencies'?: Readonly<Record<string, unknown>>
  readonly lib?: Readonly<Record<string, unknown>>
  readonly bin?: readonly { readonly name: string; readonly path?: string }[]
}

export interface GoMod {
  readonly module?: string
  readonly goVersion?: string
  readonly requires?: readonly GoModRequire[]
}
export interface GoModRequire {
  readonly path: string
  readonly version: string
  readonly indirect: boolean
}

export interface SignalContext {
  readonly projectRoot: string
  readonly warnings: readonly ScaffoldWarning[]

  hasFile(relPath: string): boolean
  dirExists(relPath: string): boolean
  rootEntries(): readonly string[]
  /** List entries in a subdirectory (depth-1, sorted, includes dotfiles, returns [] on missing/unreadable). */
  listDir(relPath: string): readonly string[]
  readFileText(relPath: string, maxBytes?: number): string | undefined

  manifestStatus(kind: ManifestKind): ManifestStatus
  packageJson(): PackageJson | undefined
  pyprojectToml(): PyprojectToml | undefined
  cargoToml(): CargoToml | undefined
  goMod(): GoMod | undefined

  hasDep(name: string, where?: ManifestKind | readonly ManifestKind[], scope?: DepScope): boolean
  hasAnyDep(names: readonly string[], where?: ManifestKind | readonly ManifestKind[], scope?: DepScope): boolean
}

// PEP 503 name normalization
function normalizePep503(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-')
}

// Extract bare package name from a PEP 508 dep spec
function extractPyName(spec: string): string {
  // Strip environment marker
  let s = spec.split(';')[0]
  // Strip URL fragment
  s = s.split('@')[0]
  // Strip version specs — include `(` for PEP 508 parenthesis form,
  // e.g. `Django (>=2.0)` which should normalize to `django`.
  s = s.replace(/[(=<>!~].*$/, '')
  // Strip extras
  s = s.replace(/\[.*?\]/, '')
  return normalizePep503(s.trim())
}

// Module-private dep matchers — shared by real and fake contexts

const NPM_ALL_SCOPES: readonly NpmDepScope[] = ['deps', 'dev', 'peer', 'optional']

function npmBucket(pkg: PackageJson, s: NpmDepScope): Readonly<Record<string, string>> | undefined {
  return s === 'deps' ? pkg.dependencies
    : s === 'dev' ? pkg.devDependencies
      : s === 'peer' ? pkg.peerDependencies
        : pkg.optionalDependencies
}

function resolveNpmScopes(scope: DepScope): readonly NpmDepScope[] {
  if (scope === 'all') return NPM_ALL_SCOPES
  if (scope === 'deps' || scope === 'dev' || scope === 'peer' || scope === 'optional') return [scope]
  return NPM_ALL_SCOPES   // defensive fallback — matches old real-context behavior
}

function matchNpmDep(pkg: PackageJson | undefined, name: string, scope: DepScope): boolean {
  if (!pkg) return false
  for (const s of resolveNpmScopes(scope)) {
    const bucket = npmBucket(pkg, s)
    if (bucket && name in bucket) return true
  }
  return false
}

function matchPyDep(py: PyprojectToml | undefined, name: string): boolean {
  if (!py) return false
  const normalized = normalizePep503(name)
  const pep621 = py.project?.dependencies ?? []
  for (const spec of pep621) {
    if (extractPyName(spec) === normalized) return true
  }
  const poetryDeps = py.tool?.poetry?.dependencies
  if (poetryDeps) {
    for (const key of Object.keys(poetryDeps)) {
      if (key === 'python') continue
      if (normalizePep503(key) === normalized) return true
    }
  }
  const poetryDev = py.tool?.poetry?.['dev-dependencies']
  if (poetryDev) {
    for (const key of Object.keys(poetryDev)) {
      if (normalizePep503(key) === normalized) return true
    }
  }
  const groups = py.tool?.poetry?.group ?? {}
  for (const group of Object.values(groups)) {
    if (group.dependencies) {
      for (const key of Object.keys(group.dependencies)) {
        if (normalizePep503(key) === normalized) return true
      }
    }
  }
  return false
}

function matchCargoDep(cargo: CargoToml | undefined, name: string): boolean {
  if (!cargo) return false
  if (cargo.dependencies && name in cargo.dependencies) return true
  if (cargo['dev-dependencies'] && name in cargo['dev-dependencies']) return true
  return false
}

function matchGoDep(go: GoMod | undefined, name: string): boolean {
  if (!go) return false
  for (const req of go.requires ?? []) {
    if (req.indirect) continue
    if (req.path === name) return true
    if (req.path.startsWith(`${name}/`)) return true
  }
  return false
}

// go.mod parser (handles multi-line require blocks + // indirect)
function parseGoMod(content: string): GoMod {
  const result: { module?: string; goVersion?: string; requires: GoModRequire[] } = { requires: [] }
  const lines = content.split('\n')
  let inRequireBlock = false
  for (const rawLine of lines) {
    const line = rawLine.replace(/\/\/.*$/, '').trim()
    if (!line) continue

    if (line.startsWith('module ')) {
      result.module = line.slice(7).trim()
      continue
    }
    if (line.startsWith('go ')) {
      result.goVersion = line.slice(3).trim()
      continue
    }
    if (line.startsWith('require (')) {
      inRequireBlock = true
      continue
    }
    if (inRequireBlock && line === ')') {
      inRequireBlock = false
      continue
    }
    if (inRequireBlock || line.startsWith('require ')) {
      const body = line.startsWith('require ') ? line.slice(8) : line
      const indirect = /\/\/\s*indirect\b/.test(rawLine)
      const parts = body.trim().split(/\s+/)
      if (parts.length >= 2) {
        result.requires.push({ path: parts[0], version: parts[1], indirect })
      }
    }
    // replace/exclude directives parsed-and-discarded per spec
  }
  return result
}

export function createSignalContext(projectRoot: string): SignalContext {
  const warnings: ScaffoldWarning[] = []
  const fileCache = new Map<string, boolean>()
  const dirCache = new Map<string, boolean>()
  const textCache = new Map<string, string | undefined>()
  const parseCache: {
    packageJson?: PackageJson | undefined
    pyprojectToml?: PyprojectToml | undefined
    cargoToml?: CargoToml | undefined
    goMod?: GoMod | undefined
  } = {}
  const status: Record<ManifestKind, ManifestStatus> = {
    npm: 'missing', py: 'missing', cargo: 'missing', go: 'missing',
  }

  // Eager root readdir + manifest probes
  let rootEntriesCache: readonly string[]
  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true })
    rootEntriesCache = entries.map(e => e.name).sort()
  } catch (err) {
    warnings.push({
      code: 'ADOPT_FS_INACCESSIBLE',
      message: `Cannot read project root: ${(err as Error).message}`,
      context: { path: projectRoot },
    })
    rootEntriesCache = []
  }

  // Eager-stat probe list
  const PROBE = ['package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod',
    'app.json', 'project.godot', 'manifest.json']
  for (const p of PROBE) {
    try {
      const stat = fs.statSync(path.join(projectRoot, p), { throwIfNoEntry: false })
      fileCache.set(p, !!stat && stat.isFile())
    } catch {
      fileCache.set(p, false)
    }
  }

  function hasFile(relPath: string): boolean {
    const cached = fileCache.get(relPath)
    if (cached !== undefined) return cached
    try {
      const stat = fs.statSync(path.join(projectRoot, relPath), { throwIfNoEntry: false })
      const exists = !!stat && stat.isFile()
      fileCache.set(relPath, exists)
      return exists
    } catch (err) {
      // ENOENT/ENOTDIR are normal "not present" probe results — silent.
      // Only emit a warning on real access failures (EACCES, EIO, etc.).
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        warnings.push({
          code: 'ADOPT_FS_INACCESSIBLE',
          message: `Cannot stat file: ${(err as Error).message}`,
          context: { path: relPath },
        })
      }
      fileCache.set(relPath, false)
      return false
    }
  }

  function dirExists(relPath: string): boolean {
    const cached = dirCache.get(relPath)
    if (cached !== undefined) return cached
    try {
      const stat = fs.statSync(path.join(projectRoot, relPath), { throwIfNoEntry: false })
      const exists = !!stat && stat.isDirectory()
      dirCache.set(relPath, exists)
      return exists
    } catch (err) {
      // ENOENT/ENOTDIR are normal "not present" probe results — silent.
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        warnings.push({
          code: 'ADOPT_FS_INACCESSIBLE',
          message: `Cannot stat directory: ${(err as Error).message}`,
          context: { path: relPath },
        })
      }
      dirCache.set(relPath, false)
      return false
    }
  }

  function rootEntries(): readonly string[] {
    return rootEntriesCache
  }

  const listDirCache = new Map<string, readonly string[]>()
  function listDir(relPath: string): readonly string[] {
    const cached = listDirCache.get(relPath)
    if (cached !== undefined) return cached
    try {
      const entries = fs.readdirSync(path.join(projectRoot, relPath), { withFileTypes: true })
      const names = entries.map(e => e.name).sort()
      listDirCache.set(relPath, names)
      return names
    } catch (err) {
      // ENOENT/ENOTDIR are expected for detectors probing optional paths
      // like app/, ios/, android/ — silent. Only warn on real access failures.
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        warnings.push({
          code: 'ADOPT_FS_INACCESSIBLE',
          message: `Cannot list directory: ${(err as Error).message}`,
          context: { path: relPath },
        })
      }
      const empty: readonly string[] = []
      listDirCache.set(relPath, empty)
      return empty
    }
  }

  function readFileText(relPath: string, maxBytes: number = 262144): string | undefined {
    // Cache stores FULL content (or undefined for missing/unreadable). Truncated
    // reads are never cached — otherwise a later call with a larger maxBytes
    // would receive the stale truncated value.
    if (textCache.has(relPath)) return textCache.get(relPath)
    try {
      const full = path.join(projectRoot, relPath)
      const stat = fs.statSync(full, { throwIfNoEntry: false })
      if (!stat || !stat.isFile()) {
        textCache.set(relPath, undefined)
        return undefined
      }
      if (stat.size > maxBytes) {
        const fd = fs.openSync(full, 'r')
        const buf = Buffer.alloc(maxBytes)
        let bytesRead = 0
        try {
          bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0)
        } finally {
          fs.closeSync(fd)
        }
        warnings.push({
          code: 'ADOPT_FILE_TRUNCATED',
          message: `File truncated to ${maxBytes} bytes`,
          context: { path: relPath, size: stat.size },
        })
        // Trim to bytesRead so a short read doesn't leave trailing null bytes.
        // Do NOT cache — we only have a partial read and a future caller may
        // request a larger slice.
        return buf.toString('utf8', 0, bytesRead)
      }
      const content = fs.readFileSync(full, 'utf8')
      textCache.set(relPath, content)
      return content
    } catch (err) {
      warnings.push({
        code: 'ADOPT_FILE_UNREADABLE',
        message: `Cannot read file: ${(err as Error).message}`,
        context: { path: relPath },
      })
      textCache.set(relPath, undefined)
      return undefined
    }
  }

  function manifestStatus(kind: ManifestKind): ManifestStatus {
    // Lazily trigger parse so the status reflects reality regardless of call order.
    // Without this, a detector that calls manifestStatus() as a pre-check before
    // calling the parser accessor would see 'missing' even when the file exists.
    if (kind === 'npm' && !('packageJson' in parseCache)) packageJson()
    else if (kind === 'py' && !('pyprojectToml' in parseCache)) pyprojectToml()
    else if (kind === 'cargo' && !('cargoToml' in parseCache)) cargoToml()
    else if (kind === 'go' && !('goMod' in parseCache)) goMod()
    return status[kind]
  }

  // Zod schemas for manifest slices — runtime validation prevents type errors
  // from malformed manifests (e.g., `dependencies: []` instead of an object)
  const zDepRecord = z.record(z.string(), z.string()).optional()
  const PackageJsonSchema = z.object({
    name: z.string().optional(),
    version: z.string().optional(),
    private: z.boolean().optional(),
    main: z.string().optional(),
    module: z.string().optional(),
    types: z.string().optional(),
    typings: z.string().optional(),
    // browser can be a string OR a map; map values can be string OR false (npm spec
    // allows `{"fs": false}` to mean "exclude this module from browser builds").
    // Use z.unknown() at the value level to be permissive.
    browser: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    exports: z.unknown().optional(),
    bin: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
    type: z.enum(['module', 'commonjs']).optional(),
    engines: z.record(z.string(), z.string()).optional(),
    scripts: z.record(z.string(), z.string()).optional(),
    dependencies: zDepRecord,
    devDependencies: zDepRecord,
    peerDependencies: zDepRecord,
    optionalDependencies: zDepRecord,
    // workspaces: array form OR object form with .passthrough() so extras like
    // `nohoist`, `overrides`, or package-manager-specific keys don't reject.
    workspaces: z.union([
      z.array(z.string()),
      z.object({ packages: z.array(z.string()).optional() }).passthrough(),
    ]).optional(),
  }).passthrough()

  const PyprojectTomlSchema = z.object({
    project: z.object({
      name: z.string().optional(),
      dependencies: z.array(z.string()).optional(),
      'optional-dependencies': z.record(z.string(), z.array(z.string())).optional(),
      scripts: z.record(z.string(), z.string()).optional(),
    }).passthrough().optional(),
    tool: z.record(z.string(), z.unknown()).optional(),
    'build-system': z.object({ requires: z.array(z.string()).optional() }).passthrough().optional(),
  }).passthrough()

  const CargoTomlSchema = z.object({
    package: z.object({
      name: z.string().optional(),
      version: z.string().optional(),
      publish: z.union([z.boolean(), z.array(z.string())]).optional(),
    }).passthrough().optional(),
    dependencies: z.record(z.string(), z.unknown()).optional(),
    'dev-dependencies': z.record(z.string(), z.unknown()).optional(),
    lib: z.record(z.string(), z.unknown()).optional(),
    bin: z.array(z.object({ name: z.string(), path: z.string().optional() }).passthrough()).optional(),
  }).passthrough()

  function packageJson(): PackageJson | undefined {
    if ('packageJson' in parseCache) return parseCache.packageJson
    if (!hasFile('package.json')) {
      status.npm = 'missing'
      parseCache.packageJson = undefined
      return undefined
    }
    const text = readFileText('package.json')
    if (text === undefined) {
      status.npm = 'unparseable'
      parseCache.packageJson = undefined
      return undefined
    }
    try {
      const raw = JSON.parse(text) as unknown
      const parsed = PackageJsonSchema.safeParse(raw)
      if (!parsed.success) {
        warnings.push({
          code: 'ADOPT_MANIFEST_UNPARSEABLE',
          message: `package.json schema validation failed: ${parsed.error.errors[0]?.message ?? 'unknown'}`,
          context: { path: 'package.json' },
        })
        status.npm = 'unparseable'
        parseCache.packageJson = undefined
        return undefined
      }
      status.npm = 'parsed'
      parseCache.packageJson = parsed.data as PackageJson
      return parsed.data as PackageJson
    } catch (err) {
      warnings.push({
        code: 'ADOPT_MANIFEST_UNPARSEABLE',
        message: `package.json parse failed: ${(err as Error).message}`,
        context: { path: 'package.json' },
      })
      status.npm = 'unparseable'
      parseCache.packageJson = undefined
      return undefined
    }
  }

  function pyprojectToml(): PyprojectToml | undefined {
    if ('pyprojectToml' in parseCache) return parseCache.pyprojectToml
    if (!hasFile('pyproject.toml')) {
      status.py = 'missing'
      parseCache.pyprojectToml = undefined
      return undefined
    }
    const text = readFileText('pyproject.toml')
    if (text === undefined) {
      status.py = 'unparseable'
      parseCache.pyprojectToml = undefined
      return undefined
    }
    try {
      const raw = parseTOML(text) as unknown
      const parsed = PyprojectTomlSchema.safeParse(raw)
      if (!parsed.success) {
        warnings.push({
          code: 'ADOPT_MANIFEST_UNPARSEABLE',
          message: `pyproject.toml schema validation failed: ${parsed.error.errors[0]?.message ?? 'unknown'}`,
          context: { path: 'pyproject.toml' },
        })
        status.py = 'unparseable'
        parseCache.pyprojectToml = undefined
        return undefined
      }
      status.py = 'parsed'
      parseCache.pyprojectToml = parsed.data as PyprojectToml
      return parsed.data as PyprojectToml
    } catch (err) {
      warnings.push({
        code: 'ADOPT_MANIFEST_UNPARSEABLE',
        message: `pyproject.toml parse failed: ${(err as Error).message}`,
        context: { path: 'pyproject.toml' },
      })
      status.py = 'unparseable'
      parseCache.pyprojectToml = undefined
      return undefined
    }
  }

  function cargoToml(): CargoToml | undefined {
    if ('cargoToml' in parseCache) return parseCache.cargoToml
    if (!hasFile('Cargo.toml')) {
      status.cargo = 'missing'
      parseCache.cargoToml = undefined
      return undefined
    }
    const text = readFileText('Cargo.toml')
    if (text === undefined) {
      status.cargo = 'unparseable'
      parseCache.cargoToml = undefined
      return undefined
    }
    try {
      const raw = parseTOML(text) as unknown
      const parsed = CargoTomlSchema.safeParse(raw)
      if (!parsed.success) {
        warnings.push({
          code: 'ADOPT_MANIFEST_UNPARSEABLE',
          message: `Cargo.toml schema validation failed: ${parsed.error.errors[0]?.message ?? 'unknown'}`,
          context: { path: 'Cargo.toml' },
        })
        status.cargo = 'unparseable'
        parseCache.cargoToml = undefined
        return undefined
      }
      status.cargo = 'parsed'
      parseCache.cargoToml = parsed.data as CargoToml
      return parsed.data as CargoToml
    } catch (err) {
      warnings.push({
        code: 'ADOPT_MANIFEST_UNPARSEABLE',
        message: `Cargo.toml parse failed: ${(err as Error).message}`,
        context: { path: 'Cargo.toml' },
      })
      status.cargo = 'unparseable'
      parseCache.cargoToml = undefined
      return undefined
    }
  }

  function goMod(): GoMod | undefined {
    if ('goMod' in parseCache) return parseCache.goMod
    if (!hasFile('go.mod')) {
      status.go = 'missing'
      parseCache.goMod = undefined
      return undefined
    }
    const text = readFileText('go.mod')
    if (text === undefined) {
      status.go = 'unparseable'
      parseCache.goMod = undefined
      return undefined
    }
    try {
      const parsed = parseGoMod(text)
      // Minimal structural validation: a valid go.mod must declare a module.
      // Without this check, completely malformed input like "<<garbage>>" would
      // silently produce an empty GoMod object — every other manifest accessor
      // marks malformed input as 'unparseable'.
      if (!parsed.module) {
        warnings.push({
          code: 'ADOPT_MANIFEST_UNPARSEABLE',
          message: 'go.mod parse failed: missing module directive',
          context: { path: 'go.mod' },
        })
        status.go = 'unparseable'
        parseCache.goMod = undefined
        return undefined
      }
      status.go = 'parsed'
      parseCache.goMod = parsed
      return parsed
    } catch (err) {
      warnings.push({
        code: 'ADOPT_MANIFEST_UNPARSEABLE',
        message: `go.mod parse failed: ${(err as Error).message}`,
        context: { path: 'go.mod' },
      })
      status.go = 'unparseable'
      parseCache.goMod = undefined
      return undefined
    }
  }

  function hasDep(name: string, where?: ManifestKind | readonly ManifestKind[], scope: DepScope = 'all'): boolean {
    const kinds: ManifestKind[] = where
      ? Array.isArray(where) ? [...where] : [where as ManifestKind]
      : ['npm', 'py', 'cargo', 'go']
    for (const kind of kinds) {
      if (kind === 'npm' && matchNpmDep(packageJson(), name, scope)) return true
      if (kind === 'py' && matchPyDep(pyprojectToml(), name)) return true
      if (kind === 'cargo' && matchCargoDep(cargoToml(), name)) return true
      if (kind === 'go' && matchGoDep(goMod(), name)) return true
    }
    return false
  }

  function hasAnyDep(
    names: readonly string[],
    where?: ManifestKind | readonly ManifestKind[],
    scope: DepScope = 'all',
  ): boolean {
    for (const name of names) {
      if (hasDep(name, where, scope)) return true
    }
    return false
  }

  return {
    projectRoot,
    get warnings() { return warnings },
    hasFile,
    dirExists,
    rootEntries,
    listDir,
    readFileText,
    manifestStatus,
    packageJson,
    pyprojectToml,
    cargoToml,
    goMod,
    hasDep,
    hasAnyDep,
  }
}

// Test helper
export interface FakeContextInput {
  projectRoot?: string
  rootEntries?: readonly string[]
  files?: Readonly<Record<string, string>>
  dirs?: readonly string[]
  /** Per-directory listing — keys are relative paths, values are sorted entry names. */
  dirListings?: Readonly<Record<string, readonly string[]>>
  packageJson?: PackageJson | 'unparseable' | 'missing'
  pyprojectToml?: PyprojectToml | 'unparseable' | 'missing'
  cargoToml?: CargoToml | 'unparseable' | 'missing'
  goMod?: GoMod | 'unparseable' | 'missing'
  /** Override individual manifest statuses (e.g., to test 'unparseable' edge cases). */
  manifestStatuses?: Partial<Record<ManifestKind, ManifestStatus>>
}

export function createFakeSignalContext(input: FakeContextInput = {}): SignalContext {
  const warnings: ScaffoldWarning[] = []
  const rootEntriesCache = [...(input.rootEntries ?? [])].sort()
  const filesMap = input.files ?? {}
  const dirsSet = new Set(input.dirs ?? [])

  function manifestVal<T>(
    v: T | 'unparseable' | 'missing' | undefined,
    _kind: ManifestKind,
  ): { val: T | undefined; status: ManifestStatus } {
    if (v === 'missing' || v === undefined) return { val: undefined, status: 'missing' }
    if (v === 'unparseable') return { val: undefined, status: 'unparseable' }
    return { val: v as T, status: 'parsed' }
  }

  const pkg = manifestVal<PackageJson>(input.packageJson, 'npm')
  const py = manifestVal<PyprojectToml>(input.pyprojectToml, 'py')
  const cargo = manifestVal<CargoToml>(input.cargoToml, 'cargo')
  const go = manifestVal<GoMod>(input.goMod, 'go')

  // Reuses the same module-private matchers as the real context,
  // so fake and real behaviors stay in lockstep.
  function hasDep(name: string, where?: ManifestKind | readonly ManifestKind[], scope: DepScope = 'all'): boolean {
    const kinds: ManifestKind[] = where
      ? Array.isArray(where) ? [...where] : [where as ManifestKind]
      : ['npm', 'py', 'cargo', 'go']
    for (const kind of kinds) {
      if (kind === 'npm' && matchNpmDep(pkg.val, name, scope)) return true
      if (kind === 'py' && matchPyDep(py.val, name)) return true
      if (kind === 'cargo' && matchCargoDep(cargo.val, name)) return true
      if (kind === 'go' && matchGoDep(go.val, name)) return true
    }
    return false
  }

  function hasAnyDep(
    names: readonly string[],
    where?: ManifestKind | readonly ManifestKind[],
    scope: DepScope = 'all',
  ): boolean {
    return names.some(n => hasDep(n, where, scope))
  }

  const dirListings = input.dirListings ?? {}
  const statusOverrides = input.manifestStatuses ?? {}

  return {
    projectRoot: input.projectRoot ?? '/fake',
    get warnings() { return warnings },
    // Only consult filesMap — entries in rootEntries may be directories,
    // and the real context's hasFile() returns false for directory paths.
    // Tests that need "file exists at root" behavior should add the path
    // to `files`, not just `rootEntries`.
    hasFile: (p: string) => p in filesMap,
    dirExists: (p: string) => dirsSet.has(p),
    rootEntries: () => rootEntriesCache,
    listDir: (p: string) => dirListings[p] ?? [],
    readFileText: (p: string, maxBytes?: number) => {
      const content = filesMap[p]
      if (content === undefined) return undefined
      return maxBytes !== undefined && content.length > maxBytes
        ? content.slice(0, maxBytes)
        : content
    },
    manifestStatus: (kind: ManifestKind) =>
      statusOverrides[kind]
      ?? (kind === 'npm' ? pkg.status
        : kind === 'py' ? py.status
          : kind === 'cargo' ? cargo.status
            : go.status),
    packageJson: () => pkg.val,
    pyprojectToml: () => py.val,
    cargoToml: () => cargo.val,
    goMod: () => go.val,
    hasDep,
    hasAnyDep,
  }
}
