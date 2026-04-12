type ValueToOptionKey<T> = T extends readonly (infer U)[] ? U : T
type OptionCopy = { label: string; short?: string }
type QuestionCopy<TValue = unknown> = {
  short?: string
  long?: string
  options?: Extract<ValueToOptionKey<TValue>, string> extends never
    ? never
    : Record<Extract<ValueToOptionKey<TValue>, string>, OptionCopy>
}

type WebAppConfig = {
  renderingStrategy: 'spa' | 'ssr' | 'ssg' | 'hybrid'
  hasTypeDefinitions: boolean
  supportedLocales: string[]
  dataStore: Array<'relational' | 'document' | 'key-value'>
}

type WebAppCopy = { [K in keyof WebAppConfig]: QuestionCopy<WebAppConfig[K]> }

// Expect compile error if strict, or let's inspect the resolved type
type ExtractOptions<K extends keyof WebAppConfig> = WebAppCopy[K]['options'];

const copy: WebAppCopy = {
  renderingStrategy: {
    options: {
      spa: { label: 'SPA' },
      ssr: { label: 'SSR' },
      ssg: { label: 'SSG' },
      hybrid: { label: 'Hybrid' }
    }
  },
  hasTypeDefinitions: {}, // options not allowed
  supportedLocales: {
    options: {
      en: { label: 'English' } // allowed because string
    }
  },
  dataStore: {
    options: {
      relational: { label: 'Relational' },
      document: { label: 'Document' },
      'key-value': { label: 'KV' }
    }
  }
}

// To check if we can ban `string` itself:
type IsStringLiteral<T> = T extends string ? (string extends T ? false : true) : false;
type BetterQuestionCopy<TValue = unknown> = {
  short?: string
  long?: string
  options?: Extract<ValueToOptionKey<TValue>, string> extends never
    ? never
    : string extends Extract<ValueToOptionKey<TValue>, string>
      ? never
      : Record<Extract<ValueToOptionKey<TValue>, string>, OptionCopy>
}

type BetterWebAppCopy = { [K in keyof WebAppConfig]: BetterQuestionCopy<WebAppConfig[K]> }

const betterCopy: BetterWebAppCopy = {
  supportedLocales: {
    // @ts-expect-error Options should be banned now
    options: {}
  }
}
