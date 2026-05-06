export const COLOR_PROPS = new Set([
  'color', 'background', 'background-color', 'border-color', 'border-top-color',
  'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'text-decoration-color', 'fill', 'stroke', 'caret-color',
  'column-rule-color', 'box-shadow', 'text-shadow',
])

export const SPACING_PROPS = new Set([
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'gap', 'row-gap', 'column-gap', 'top', 'right', 'bottom', 'left',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-radius', 'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
  'outline-width', 'outline-offset', 'inset', 'flex-basis',
])

export const TYPOGRAPHY_PROPS = new Set([
  'font-size', 'font-family', 'font-weight', 'font-style', 'font-variant',
  'line-height', 'letter-spacing', 'word-spacing', 'text-indent',
  'text-decoration', 'text-transform', 'vertical-align',
])

export type DesignCategory = 'color' | 'spacing' | 'typography'

export function categoryOfProp(prop: string | undefined): DesignCategory | null {
  if (!prop) return null
  const p = prop.toLowerCase()
  if (COLOR_PROPS.has(p)) return 'color'
  if (SPACING_PROPS.has(p)) return 'spacing'
  if (TYPOGRAPHY_PROPS.has(p)) return 'typography'
  return null
}
