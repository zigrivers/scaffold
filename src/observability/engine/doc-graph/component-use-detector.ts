import { builtinModules } from 'node:module'
import { parse as babelParse } from '@babel/parser'
import traverseDefault from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import type { CallExpression, Identifier, ImportDeclaration, StringLiteral } from '@babel/types'
import type { SanctionedComponent } from '../types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const traverse = ((traverseDefault as unknown as { default: unknown }).default ?? traverseDefault) as (ast: unknown, visitors: Record<string, (path: NodePath<any>) => void>) => void

export interface ComponentUse {
  file: string
  specifier: string
  component_id: string
}

function packageNameOf(component: SanctionedComponent): string {
  const s = component.package_or_url
  if (s.startsWith('@')) {
    const parts = s.split('/')
    return parts.length >= 2 ? `${parts[0]}/${parts[1].split('@')[0]}` : s
  }
  return s.split('/')[0].split('@')[0] || s
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith('.') || specifier.startsWith('/')
}

function isBuiltin(specifier: string): boolean {
  return specifier.startsWith('node:') || builtinModules.includes(specifier)
}

function normalizeSpecifier(specifier: string): string {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier
  }
  return specifier.split('/')[0]
}

export function detectComponentUses(
  source: string,
  components: SanctionedComponent[],
  filePath: string,
): ComponentUse[] {
  const out: ComponentUse[] = []
  let ast
  try {
    ast = babelParse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  } catch {
    try {
      ast = babelParse(source, { sourceType: 'script', plugins: ['typescript', 'jsx'] })
    } catch { return out }
  }
  function pushUse(specifier: string) {
    if (isRelative(specifier) || isBuiltin(specifier)) return
    const normalized = normalizeSpecifier(specifier)
    const match = components.find((c) => packageNameOf(c) === normalized)
    out.push({ file: filePath, specifier, component_id: match ? match.id : 'unsanctioned' })
  }
  traverse(ast, {
    ImportDeclaration(path: NodePath<ImportDeclaration>) {
      pushUse((path.node as ImportDeclaration).source.value)
    },
    CallExpression(path: NodePath<CallExpression>) {
      const node = path.node as CallExpression
      if (node.callee.type !== 'Identifier' || (node.callee as Identifier).name !== 'require') return
      if (node.arguments.length === 0 || node.arguments[0].type !== 'StringLiteral') return
      pushUse((node.arguments[0] as StringLiteral).value)
    },
  })
  return out
}
