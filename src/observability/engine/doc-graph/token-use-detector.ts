import postcss from 'postcss'
import { parse as babelParse } from '@babel/parser'
import traverseDefault from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import type {
  JSXAttribute, ObjectExpression, ObjectProperty, Identifier, StringLiteral,
} from '@babel/types'
import type { DesignToken } from '../types.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const traverse = ((traverseDefault as unknown as { default: unknown }).default ?? traverseDefault) as (ast: unknown, visitors: Record<string, (path: NodePath<any>) => void>) => void

export interface TokenUse {
  file: string
  property: string
  value: string
  token_id: string
}

const COLOR_PROPS = /^(color|background(-color)?|border(-color)?|fill|stroke)$/i
const SPACING_PROPS = /^(margin|padding)(-(top|right|bottom|left))?$|^(gap|top|right|bottom|left)$/i
const TYPOGRAPHY_PROPS = /^(font-size|font-family|font-weight|line-height)$/i

function isLiteral(value: string): boolean {
  return !/^var\(/i.test(value.trim()) && value.trim().length > 0
}

function tokenIdFor(value: string, tokens: DesignToken[], category: DesignToken['category'] | null): string {
  if (!category) return 'ad_hoc'
  const v = value.trim().toLowerCase()
  const match = tokens.find((t) => t.category === category && t.value.trim().toLowerCase() === v)
  return match ? match.id : `ad_hoc:${category}`
}

function categoryOfProp(prop: string): DesignToken['category'] | null {
  if (COLOR_PROPS.test(prop)) return 'color'
  if (SPACING_PROPS.test(prop)) return 'spacing'
  if (TYPOGRAPHY_PROPS.test(prop)) return 'typography'
  return null
}

function splitShorthand(prop: string, value: string): { property: string; value: string }[] {
  if (!/^(margin|padding|gap)$/i.test(prop)) return [{ property: prop, value }]
  return value.split(/\s+/).filter(Boolean).map((v) => ({ property: prop, value: v }))
}

export function detectCssTokenUses(source: string, tokens: DesignToken[], filePath: string): TokenUse[] {
  const out: TokenUse[] = []
  let root: postcss.Root
  try {
    root = postcss.parse(source, { from: filePath })
  } catch {
    return out
  }
  root.walkDecls((decl) => {
    const cat = categoryOfProp(decl.prop)
    if (!cat) return
    if (!isLiteral(decl.value)) return
    for (const piece of splitShorthand(decl.prop, decl.value)) {
      if (!isLiteral(piece.value)) continue
      out.push({
        file: filePath,
        property: piece.property,
        value: piece.value,
        token_id: tokenIdFor(piece.value, tokens, cat),
      })
    }
  })
  return out
}

function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

export function detectJsxTokenUses(source: string, tokens: DesignToken[], filePath: string): TokenUse[] {
  const out: TokenUse[] = []
  let ast
  try {
    ast = babelParse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] })
  } catch {
    return out
  }
  // Only inline `style={{ key: 'value' }}` object literals are analyzed.
  // Variable-referenced styles (style={styles.btn}) are out of scope.
  traverse(ast, {
    JSXAttribute(path: NodePath<JSXAttribute>) {
      const node = path.node as JSXAttribute
      const nameNode = node.name
      if (nameNode.type !== 'JSXIdentifier' || nameNode.name !== 'style') return
      const expr = node.value
      if (!expr || expr.type !== 'JSXExpressionContainer') return
      if (expr.expression.type !== 'ObjectExpression') return
      for (const prop of (expr.expression as ObjectExpression).properties) {
        if (prop.type !== 'ObjectProperty') continue
        const op = prop as ObjectProperty
        const keyName = op.key.type === 'Identifier' ? (op.key as Identifier).name
                      : op.key.type === 'StringLiteral' ? (op.key as StringLiteral).value
                      : null
        if (!keyName) continue
        const valueNode = op.value
        if (valueNode.type !== 'StringLiteral') continue
        const property = camelToKebab(keyName)
        for (const piece of splitShorthand(property, (valueNode as StringLiteral).value)) {
          const cat = categoryOfProp(piece.property)
          if (!cat) continue
          if (!isLiteral(piece.value)) continue
          out.push({
            file: filePath,
            property: piece.property,
            value: piece.value,
            token_id: tokenIdFor(piece.value, tokens, cat),
          })
        }
      }
    },
  })
  return out
}
