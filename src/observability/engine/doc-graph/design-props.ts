export const COLOR_PROPS = new Set([
  'color', 'background', 'background-color', 'border-color', 'border-top-color',
  'border-right-color', 'border-bottom-color', 'border-left-color',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'outline-color', 'text-decoration-color', 'fill', 'stroke', 'caret-color',
  'column-rule-color', 'accent-color',
])

export const SPACING_PROPS = new Set([
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'gap', 'row-gap', 'column-gap', 'top', 'right', 'bottom', 'left',
  'border-width', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'outline-width', 'outline-offset', 'inset', 'flex-basis', 'border-spacing',
])

export const TYPOGRAPHY_PROPS = new Set([
  'font', 'font-size', 'font-family', 'font-weight', 'font-style', 'font-variant',
  'line-height', 'letter-spacing', 'word-spacing', 'text-indent',
  'text-decoration', 'text-transform', 'vertical-align',
])

export const SHADOW_PROPS = new Set([
  'box-shadow', 'text-shadow',
])

export const RADIUS_PROPS = new Set([
  'border-radius', 'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
])

export const MOTION_PROPS = new Set([
  'transition', 'transition-duration', 'transition-property', 'transition-timing-function',
  'transition-delay', 'animation', 'animation-duration', 'animation-name',
  'animation-timing-function', 'animation-delay', 'transform',
])

export type DesignCategory = 'color' | 'spacing' | 'typography' | 'shadow' | 'radius' | 'motion'

export function categoryOfProp(prop: string | undefined): DesignCategory | null {
  if (!prop) return null
  const p = prop.toLowerCase()
  if (COLOR_PROPS.has(p)) return 'color'
  if (SPACING_PROPS.has(p)) return 'spacing'
  if (TYPOGRAPHY_PROPS.has(p)) return 'typography'
  if (SHADOW_PROPS.has(p)) return 'shadow'
  if (RADIUS_PROPS.has(p)) return 'radius'
  if (MOTION_PROPS.has(p)) return 'motion'
  return null
}
