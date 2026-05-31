import { defaultSchema } from 'rehype-sanitize'
import type { Schema } from 'hast-util-sanitize'

// Cloned default schema; directive tasks extend this object's allowances.
export const guideSanitizeSchema: Schema = {
  ...defaultSchema,
  // Disable id-rewriting (defaultSchema sets clobberPrefix:'user-content-', which
  // rewrites heading ids to 'user-content-<slug>' and breaks scrollspy/TOC anchor
  // links). Safe here because guide content is in-repo and passes code review —
  // DOM-clobber protection on our own generated heading ids is unnecessary.
  clobberPrefix: '',
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'button',
    'input',
    // mermaid inline SVG support
    'figure',
    'svg',
    'g',
    'path',
    'rect',
    'circle',
    'ellipse',
    'line',
    'polygon',
    'polyline',
    'text',
    'tspan',
    'marker',
    'defs',
    'use',
  ],
  attributes: {
    ...defaultSchema.attributes,
    // Global: add directive attrs + SVG geometry/presentation attrs.
    // hast-util-sanitize only supports '*' as a wildcard key (no '*svg' etc.).
    // Geometry and presentation attrs (d, fill, stroke, transform, etc.) are
    // harmless — they carry no script execution risk.
    '*': [
      ...(defaultSchema.attributes?.['*'] ?? []),
      'id',
      'className',
      'role',
      'dataTab',
      'dataPath',
      'ariaLabel',
      'ariaSelected',
      'ariaControls',
      'ariaLabelledBy',
      'tabIndex',
      'style',
      // SVG geometry & presentation (safe; no execution risk)
      'd',
      'x',
      'y',
      'x1',
      'y1',
      'x2',
      'y2',
      'cx',
      'cy',
      'r',
      'rx',
      'ry',
      'points',
      'transform',
      'fill',
      'stroke',
      'strokeWidth',
      'markerEnd',
      'markerStart',
      'markerMid',
      'textAnchor',
    ],
    input: ['type', 'placeholder', 'className', 'ariaLabel'],
    // SVG root element attributes
    svg: ['viewBox', 'width', 'height', 'xmlns', 'preserveAspectRatio', 'role', 'ariaLabel'],
    // mermaid arrowhead structure
    marker: ['id', 'markerWidth', 'markerHeight', 'markerUnits', 'orient', 'refX', 'refY', 'viewBox', 'className'],
    use: ['href', 'xlinkHref', 'x', 'y', 'width', 'height', 'className'],
  },
}
