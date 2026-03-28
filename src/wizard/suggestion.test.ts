import { describe, it, expect } from 'vitest'
import { suggestMethodology } from './suggestion.js'

describe('suggestMethodology', () => {
  // -----------------------------------------------------------------------
  // MVP keyword detection
  // -----------------------------------------------------------------------

  describe('MVP keyword signals in idea text', () => {
    const mvpKeywords = ['prototype', 'mvp', 'quick', 'hack', 'simple', 'basic', 'minimal', 'poc']

    for (const keyword of mvpKeywords) {
      it(`returns 'mvp' when idea contains "${keyword}"`, () => {
        expect(
          suggestMethodology({ idea: `Build a ${keyword} app`, mode: 'greenfield' }),
        ).toBe('mvp')
      })
    }

    it('returns \'mvp\' when keyword is uppercase (case-insensitive)', () => {
      expect(
        suggestMethodology({ idea: 'Build a PROTOTYPE dashboard', mode: 'greenfield' }),
      ).toBe('mvp')
    })

    it('returns \'mvp\' when keyword is mixed case', () => {
      expect(
        suggestMethodology({ idea: 'Quick MVP for demo', mode: 'greenfield' }),
      ).toBe('mvp')
    })

    it('returns \'mvp\' when keyword is embedded in a longer word', () => {
      // 'simple' is embedded in 'simplest'
      expect(
        suggestMethodology({ idea: 'The simplest possible API', mode: 'greenfield' }),
      ).toBe('mvp')
    })

    it('returns \'mvp\' for MVP keyword even in brownfield mode', () => {
      expect(
        suggestMethodology({
          idea: 'quick fix for legacy code',
          mode: 'brownfield',
          sourceFileCount: 100,
        }),
      ).toBe('mvp')
    })

    it('returns \'mvp\' for MVP keyword even in v1-migration mode', () => {
      expect(
        suggestMethodology({ idea: 'minimal migration script', mode: 'v1-migration' }),
      ).toBe('mvp')
    })
  })

  // -----------------------------------------------------------------------
  // Brownfield + large codebase → deep
  // -----------------------------------------------------------------------

  describe('brownfield mode with large codebase', () => {
    it('returns \'deep\' when brownfield and sourceFileCount > 10', () => {
      expect(
        suggestMethodology({ mode: 'brownfield', sourceFileCount: 11 }),
      ).toBe('deep')
    })

    it('returns \'deep\' when brownfield and sourceFileCount is very large', () => {
      expect(
        suggestMethodology({ mode: 'brownfield', sourceFileCount: 500 }),
      ).toBe('deep')
    })

    it('returns \'deep\' (default) when brownfield and sourceFileCount is exactly 10', () => {
      // sourceFileCount > 10 is the condition — 10 does NOT trigger the brownfield branch
      const result = suggestMethodology({ mode: 'brownfield', sourceFileCount: 10 })
      expect(result).toBe('deep')
    })

    it('returns \'deep\' (default) when brownfield and sourceFileCount is small', () => {
      // Falls through to the default, not the brownfield branch
      expect(
        suggestMethodology({ mode: 'brownfield', sourceFileCount: 3 }),
      ).toBe('deep')
    })

    it('returns \'deep\' (default) when brownfield and sourceFileCount is 0', () => {
      expect(
        suggestMethodology({ mode: 'brownfield', sourceFileCount: 0 }),
      ).toBe('deep')
    })
  })

  // -----------------------------------------------------------------------
  // Default behavior → deep
  // -----------------------------------------------------------------------

  describe('default behavior', () => {
    it('returns \'deep\' for greenfield with no idea', () => {
      expect(
        suggestMethodology({ mode: 'greenfield' }),
      ).toBe('deep')
    })

    it('returns \'deep\' for greenfield with non-MVP idea', () => {
      expect(
        suggestMethodology({ idea: 'Build an enterprise platform', mode: 'greenfield' }),
      ).toBe('deep')
    })

    it('returns \'deep\' for v1-migration with no idea', () => {
      expect(
        suggestMethodology({ mode: 'v1-migration' }),
      ).toBe('deep')
    })

    it('returns \'deep\' for v1-migration with non-MVP idea', () => {
      expect(
        suggestMethodology({
          idea: 'Migrate the entire authentication system',
          mode: 'v1-migration',
        }),
      ).toBe('deep')
    })
  })

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('returns \'deep\' when idea is an empty string', () => {
      expect(
        suggestMethodology({ idea: '', mode: 'greenfield' }),
      ).toBe('deep')
    })

    it('returns \'deep\' when idea is undefined (omitted)', () => {
      expect(
        suggestMethodology({ mode: 'greenfield' }),
      ).toBe('deep')
    })

    it('returns \'deep\' when sourceFileCount is undefined (omitted)', () => {
      expect(
        suggestMethodology({ mode: 'brownfield' }),
      ).toBe('deep')
    })

    it('MVP keywords take priority over brownfield + large codebase', () => {
      // keyword check runs first, so even with brownfield + large codebase,
      // an MVP keyword in the idea should return 'mvp'
      expect(
        suggestMethodology({
          idea: 'prototype integration test',
          mode: 'brownfield',
          sourceFileCount: 200,
        }),
      ).toBe('mvp')
    })

    it('returns \'deep\' with all options explicitly provided but no MVP keywords', () => {
      expect(
        suggestMethodology({
          idea: 'Full-featured dashboard with analytics',
          mode: 'greenfield',
          sourceFileCount: 0,
        }),
      ).toBe('deep')
    })

    it('returns \'deep\' when idea contains only whitespace', () => {
      expect(
        suggestMethodology({ idea: '   ', mode: 'greenfield' }),
      ).toBe('deep')
    })

    it('returns \'mvp\' when idea has keyword surrounded by punctuation', () => {
      expect(
        suggestMethodology({ idea: '(mvp)', mode: 'greenfield' }),
      ).toBe('mvp')
    })
  })
})
