import { parse as babelParse } from '@babel/parser'
import traverseDefault from '@babel/traverse'
import type { ImportDeclaration } from '@babel/types'
import type { SanctionedComponent } from '../types.js'

const traverse = (traverseDefault as unknown as { default: typeof traverseDefault }).default ?? traverseDefault

export interface ComponentUse {
  file: string
  specifier: string
  component_id: string
}

function packageNameOf(component: SanctionedComponent): string {
  const m = component.package_or_url.match(/^(@?[^@]+(?:\/[^@]+)?)(?:@.+)?$/)
  return m ? m[1] : component.package_or_url
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith('.') || specifier.startsWith('/')
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
    return out
  }
  traverse(ast, {
    ImportDeclaration(path) {
      const specifier = (path.node as ImportDeclaration).source.value
      if (isRelative(specifier)) return
      const match = components.find((c) => packageNameOf(c) === specifier)
      out.push({
        file: filePath,
        specifier,
        component_id: match ? match.id : 'unsanctioned',
      })
    },
  })
  return out
}
