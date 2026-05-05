import { describe, it, expect } from 'vitest'
import { parseStories } from './story-parser.js'

describe('parseStories', () => {
  it('extracts stories with priority + kind from H2 headings', () => {
    const md = `# User Stories

## Story user-auth-1: Sign in with email [priority: must] [kind: ui]

As a user, I want to sign in.

### AC 1: Login form accepts valid email/password
Given a registered user
When they submit valid credentials
Then they are signed in.

### AC 2: Login form rejects invalid credentials
Given a registered user
When they submit invalid credentials
Then they see an error.

## Story user-auth-2: Password reset [priority: should]

As a user, I want to reset my password.

### AC 1: Reset link is emailed
Given a registered user
When they request reset
Then they receive a reset email.
`
    const { stories, acs } = parseStories(md)
    expect(stories).toHaveLength(2)
    expect(stories[0]).toMatchObject({
      id: 'story:user-auth-1',
      title: 'Sign in with email',
      priority: 'must',
      kind: 'ui',
      source_anchor: 'docs/user-stories.md#story-user-auth-1',
    })
    expect(stories[1].priority).toBe('should')
    expect(stories[1].kind).toBeUndefined()

    expect(acs).toHaveLength(3)
    expect(acs[0]).toMatchObject({ id: 'ac:user-auth-1.1', story_id: 'story:user-auth-1' })
    expect(acs[0].text).toContain('Given a registered user')
    expect(acs[2].story_id).toBe('story:user-auth-2')
    expect(acs[2].id).toBe('ac:user-auth-2.1')
  })

  it('also accepts numbered-list AC format (### Acceptance Criteria)', () => {
    const md = `## Story s-1: Foo [priority: must]

As a user, I want X.

### Acceptance Criteria
1. The form validates input.
2. Errors are localized.
`
    const { acs } = parseStories(md)
    expect(acs).toHaveLength(2)
    expect(acs[0]).toMatchObject({ id: 'ac:s-1.1', story_id: 'story:s-1' })
    expect(acs[0].text).toBe('The form validates input.')
    expect(acs[1].text).toBe('Errors are localized.')
  })

  it('returns empty arrays for an empty document', () => {
    expect(parseStories('# Heading\n')).toEqual({ stories: [], acs: [] })
  })
})
