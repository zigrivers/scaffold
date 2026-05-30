import { describe, it, expect } from 'vitest'
import { renderGuideBody } from './render.js'
import { remarkCite } from './directives.js'

describe('remarkCite', () => {
  it('renders a blocking citation as an fp span the citation checker matches', async () => {
    const { body } = await renderGuideBody('See :cite[src/foo.ts:42] for details.\n', {
      plugins: [remarkCite],
    })
    expect(body).toContain('class="fp"')
    expect(body).toContain('data-path="src/foo.ts:42"')
    expect(body).toContain('>src/foo.ts:42<')
  })

  it('preserves a line range in data-path', async () => {
    const { body } = await renderGuideBody(':cite[src/bar.ts:10-20]\n', { plugins: [remarkCite] })
    expect(body).toContain('data-path="src/bar.ts:10-20"')
  })

  it('renders an advisory citation without the fp class so the gate does not block on it', async () => {
    const { body } = await renderGuideBody(':cite[docs/x.md:3]{mode=advisory}\n', {
      plugins: [remarkCite],
    })
    expect(body).toContain('class="cite-advisory"')
    expect(body).toContain('data-path="docs/x.md:3"')
    expect(body).not.toContain('class="fp"')
  })
})
