import { describe, it, expect } from 'vitest'
import { parseFeatures } from './feature-parser.js'

describe('parseFeatures', () => {
  it('extracts features from a "## Features" section with priority tags', () => {
    const md = `# PRD

## Problem

Users can't authenticate.

## Features

### User Auth [priority: must]

Users sign in with email/password.

### Password Reset [priority: should]

Users reset forgotten passwords.

### Social Login [priority: could]

Users sign in with Google.

## Constraints

…
`
    const features = parseFeatures(md)
    expect(features).toHaveLength(3)
    expect(features[0]).toMatchObject({ id: 'feature:user-auth', title: 'User Auth', priority: 'must' })
    expect(features[1]).toMatchObject({ id: 'feature:password-reset', priority: 'should' })
    expect(features[2]).toMatchObject({ id: 'feature:social-login', priority: 'could' })
    expect(features[0].source_anchor).toBe('docs/plan.md#user-auth')
    expect(features[0].prose).toContain('email/password')
  })

  it('defaults priority to "should" when no tag is present', () => {
    const md = `## Features\n\n### Bare Feature\n\nNo priority tag.\n`
    const features = parseFeatures(md)
    expect(features[0].priority).toBe('should')
  })

  it('returns empty list when no Features section exists', () => {
    expect(parseFeatures('# PRD\n\n## Problem\nFoo\n')).toEqual([])
  })

  it("handles MoSCoW words in heading without explicit tag (Must, Should, Could, Won't)", () => {
    const md = "## Features\n\n### Login (Must)\n\n### Reports (Could)\n\n### Multi-tenant (Won't)\n"
    const features = parseFeatures(md)
    expect(features.map((f) => f.priority)).toEqual(['must', 'could', 'wont'])
  })
})
