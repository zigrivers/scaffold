import { describe, it, expect } from 'vitest'
import { findBrokenAnchors } from './links.js'
import type { AnchorScope } from './links.js'

const scope = (self: string[], byTopic?: Record<string, string[]>): AnchorScope => ({
  selfIds: new Set(self),
  idsByTopic: byTopic
    ? new Map(Object.entries(byTopic).map(([k, v]) => [k, new Set(v)]))
    : undefined,
})

describe('findBrokenAnchors — same-page fragments', () => {
  it('reports a fragment with no matching heading id', () => {
    expect(findBrokenAnchors('[a](#nope)', scope(['real']))).toEqual(['#nope'])
  })

  it('passes a fragment that matches', () => {
    expect(findBrokenAnchors('[a](#real)', scope(['real']))).toEqual([])
  })

  it('treats ./ and . as the current page', () => {
    expect(findBrokenAnchors('[a](./#nope) [b](.#real)', scope(['real']))).toEqual(['./#nope'])
  })

  it('accepts an id containing repeated hyphens (the --fix trap)', () => {
    // "### The `--fix` flow" really does render id="the---fix-flow": the space
    // collapses to one hyphen and the flag's own "--" survives. A checker that
    // normalised repeated hyphens would reject this correct anchor.
    expect(findBrokenAnchors('[a](#the---fix-flow)', scope(['the---fix-flow']))).toEqual([])
  })

  it('ignores a bare "#", which is a placeholder rather than a claim', () => {
    expect(findBrokenAnchors('[a](#)', scope([]))).toEqual([])
  })

  it('ignores external URLs, protocol-relative URLs, and fragmentless links', () => {
    const md = '[a](https://x.com#f) [b](mailto:a@b.c) [c](//cdn.example#f) [d](../mmr/index.md)'
    expect(findBrokenAnchors(md, scope([]))).toEqual([])
  })

  it('does not read anchors out of fenced or inline code', () => {
    expect(findBrokenAnchors('```\n[x](#fake)\n```\n\n`[y](#fake2)`\n', scope([]))).toEqual([])
  })
})

describe('findBrokenAnchors — cross-guide fragments', () => {
  const byTopic = { mmr: ['channel-architecture'] }

  it('reports a fragment missing from the sibling guide', () => {
    expect(findBrokenAnchors('[a](../mmr/index.md#nope)', scope([], byTopic))).toEqual([
      '../mmr/index.md#nope',
    ])
  })

  it('passes a fragment the sibling guide really has', () => {
    expect(
      findBrokenAnchors('[a](../mmr/index.md#channel-architecture)', scope([], byTopic)),
    ).toEqual([])
  })

  it('accepts the index.html, bare-directory and no-slash spellings of a sibling', () => {
    const md =
      '[a](../mmr/index.html#channel-architecture) [b](../mmr/#channel-architecture) [c](../mmr#channel-architecture)'
    expect(findBrokenAnchors(md, scope([], byTopic))).toEqual([])
  })

  it('reports through the bare-directory spelling too (no EISDIR, no silent pass)', () => {
    expect(findBrokenAnchors('[a](../mmr/#nope)', scope([], byTopic))).toEqual(['../mmr/#nope'])
  })

  it('skips a topic that is not in scope rather than guessing', () => {
    expect(findBrokenAnchors('[a](../unbuilt/index.md#x)', scope([], byTopic))).toEqual([])
  })

  it('skips files outside the guides tree — they use a different slugger', () => {
    // GitHub slugs h1-h6, suffixes duplicates and keeps unicode; judging a repo
    // doc by the guide renderer's rule would be wrong in both directions.
    const md = '[a](../../../docs/git-workflow.md#the-workflow) [b](./other.md#x)'
    expect(findBrokenAnchors(md, scope([], byTopic))).toEqual([])
  })
})

describe('findBrokenAnchors — encoding and node types', () => {
  it('percent-decodes the fragment before comparing', () => {
    expect(findBrokenAnchors('[a](#channel%2Darchitecture)', scope(['channel-architecture']))).toEqual([])
  })

  it('percent-decodes the file part when resolving the sibling topic', () => {
    expect(findBrokenAnchors('[a](../mmr/index%2Emd#x)', scope([], { mmr: ['x'] }))).toEqual([])
  })

  it('never treats an image fragment as a heading anchor', () => {
    // An image fragment is an SVG view spec or a PDF page, not a heading.
    const md = '![d](diagram.svg#svgView(viewBox(0,0,10,10))) ![e](../mmr/index.md#nope)'
    expect(findBrokenAnchors(md, scope([], { mmr: [] }))).toEqual([])
  })

  it('checks reference-style definitions', () => {
    expect(findBrokenAnchors('[a][ref]\n\n[ref]: #nope\n', scope(['real']))).toEqual(['#nope'])
  })
})
