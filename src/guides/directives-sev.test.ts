import { describe, it, expect } from 'vitest'
import { renderGuideBody } from './render.js'
import { remarkSev } from './directives.js'

describe('remarkSev', () => {
  it('renders an inline severity chip', async () => {
    const { body } = await renderGuideBody('A :sev[P0]{level=p0} finding.\n', { plugins: [remarkSev] })
    expect(body).toContain('class="sev sev-p0"')
    expect(body).toContain('>P0<')
  })

  it('falls back to p2 for an unknown level', async () => {
    const { body } = await renderGuideBody('x :sev[P9]{level=p9} y\n', { plugins: [remarkSev] })
    expect(body).toContain('class="sev sev-p2"')
  })
})
