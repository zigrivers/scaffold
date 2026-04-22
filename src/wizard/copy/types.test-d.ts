import { describe, it, expectTypeOf } from 'vitest'
import type {
  WebAppCopy, LibraryCopy, GameCopy, BackendCopy, ProjectCopyMap, OptionCopy, CoreCopy,
  DataScienceCopy,
} from './types.js'
import type { ProjectType } from '../../types/index.js'

describe('QuestionCopy type-level tests', () => {
  it('WebAppCopy.renderingStrategy.options requires exact enum keys', () => {
    expectTypeOf<NonNullable<WebAppCopy['renderingStrategy']['options']>>()
      .toEqualTypeOf<Record<'spa' | 'ssr' | 'ssg' | 'hybrid', OptionCopy>>()
  })

  it('BackendCopy.dataStore.options requires array element enum keys', () => {
    expectTypeOf<NonNullable<BackendCopy['dataStore']['options']>>()
      .toEqualTypeOf<Record<'relational' | 'document' | 'key-value', OptionCopy>>()
  })

  it('LibraryCopy.hasTypeDefinitions cannot have options (boolean field)', () => {
    const _: LibraryCopy['hasTypeDefinitions'] = {
      short: 'x',
      // @ts-expect-error -- options on boolean-typed fields should be forbidden
      options: { 'true': { label: 'Yes' } },
    }
    void _
  })

  it('GameCopy.supportedLocales cannot have options (bare string[])', () => {
    const _: GameCopy['supportedLocales'] = {
      short: 'x',
      // @ts-expect-error -- options on free-text string[] fields should be forbidden
      options: { 'en': { label: 'English' } },
    }
    void _
  })

  it('CoreCopy.projectType.options requires exact ProjectType enum keys', () => {
    expectTypeOf<NonNullable<CoreCopy['projectType']['options']>>()
      .toEqualTypeOf<Record<ProjectType, OptionCopy>>()
  })

  it('getCopyForType narrows to the correct type', () => {
    expectTypeOf<ProjectCopyMap['web-app']>().toEqualTypeOf<WebAppCopy>()
    expectTypeOf<ProjectCopyMap['game']>().toEqualTypeOf<GameCopy>()
  })

  it('DataScienceCopy.audience.options requires exact enum keys', () => {
    expectTypeOf<NonNullable<DataScienceCopy['audience']['options']>>()
      .toEqualTypeOf<Record<'solo', OptionCopy>>()
  })

  it('ProjectCopyMap["data-science"] narrows to DataScienceCopy', () => {
    expectTypeOf<ProjectCopyMap['data-science']>().toEqualTypeOf<DataScienceCopy>()
  })
})
