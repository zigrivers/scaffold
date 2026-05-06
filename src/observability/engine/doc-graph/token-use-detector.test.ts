import { describe, it, expect } from 'vitest'
import { detectCssTokenUses, detectJsxTokenUses } from './token-use-detector.js'
import type { DesignToken } from '../types.js'

const tokens: DesignToken[] = [
  { id: 'token:--color-primary', category: 'color',    value: '#4f46e5', priority: 'must',   source_anchor: '' },
  { id: 'token:--color-danger',  category: 'color',    value: '#ef4444', priority: 'must',   source_anchor: '' },
  { id: 'token:--sp-2',          category: 'spacing',  value: '8px',     priority: 'should', source_anchor: '' },
]

describe('detectCssTokenUses', () => {
  it('matches CSS literals against design tokens', () => {
    const css = '.btn { color: #4f46e5; padding: 8px; background: #abcdef; }'
    const uses = detectCssTokenUses(css, tokens, 'src/styles/btn.css')
    expect(uses).toEqual([
      { file: 'src/styles/btn.css', property: 'color',      value: '#4f46e5', token_id: 'token:--color-primary' },
      { file: 'src/styles/btn.css', property: 'padding',    value: '8px',     token_id: 'token:--sp-2' },
      { file: 'src/styles/btn.css', property: 'background', value: '#abcdef', token_id: 'ad_hoc:color' },
    ])
  })

  it('walks shorthand properties (margin/padding) and emits one use per side that is a literal', () => {
    const css = '.box { padding: 8px 16px; margin: 4px; }'
    const uses = detectCssTokenUses(css, tokens, 'src/styles/box.css')
    expect(uses.find((u) => u.value === '8px' && u.token_id === 'token:--sp-2')).toBeDefined()
    expect(uses.find((u) => u.value === '16px' && u.token_id === 'ad_hoc:spacing')).toBeDefined()
    expect(uses.find((u) => u.value === '4px' && u.token_id === 'ad_hoc:spacing')).toBeDefined()
  })

  it('ignores values that are CSS variables (var(--…))', () => {
    const css = '.btn { color: var(--color-primary); }'
    expect(detectCssTokenUses(css, tokens, 'src/styles/btn.css')).toEqual([])
  })

  it('handles SCSS nested selectors without crashing', () => {
    const scss = '.btn { color: #4f46e5; &:hover { color: #ef4444; } }'
    const uses = detectCssTokenUses(scss, tokens, 'src/styles/btn.scss')
    expect(uses.map((u) => u.token_id)).toEqual(['token:--color-primary', 'token:--color-danger'])
  })
})

describe('detectJsxTokenUses', () => {
  it('extracts CSS-like values from JSX style={{ … }} props', () => {
    const tsx = `
      export const Btn = () => (
        <button style={{ color: '#4f46e5', padding: '8px', background: '#abcdef' }}>X</button>
      )
    `
    const uses = detectJsxTokenUses(tsx, tokens, 'src/components/Btn.tsx')
    expect(uses).toEqual([
      { file: 'src/components/Btn.tsx', property: 'color',      value: '#4f46e5', token_id: 'token:--color-primary' },
      { file: 'src/components/Btn.tsx', property: 'padding',    value: '8px',     token_id: 'token:--sp-2' },
      { file: 'src/components/Btn.tsx', property: 'background', value: '#abcdef', token_id: 'ad_hoc:color' },
    ])
  })

  it('converts camelCase style keys (backgroundColor) to kebab-case for token matching', () => {
    const tsx = '<div style={{ backgroundColor: \'#ef4444\' }} />'
    const uses = detectJsxTokenUses(tsx, tokens, 'a.tsx')
    expect(uses[0]).toMatchObject({ property: 'background-color', value: '#ef4444', token_id: 'token:--color-danger' })
  })

  it('skips non-literal values (variable references) instead of matching them', () => {
    const tsx = 'const c = \'#4f46e5\'; export default () => <div style={{ color: c }} />'
    const uses = detectJsxTokenUses(tsx, tokens, 'a.tsx')
    expect(uses).toEqual([])
  })
})
