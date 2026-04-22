import type {
  ProjectType, MethodologyName,
  WebAppConfig, BackendConfig, CliConfig, LibraryConfig,
  MobileAppConfig, DataPipelineConfig, MlConfig, BrowserExtensionConfig,
  GameConfig, ResearchConfig, DataScienceConfig,
} from '../../types/index.js'

export type ValueToOptionKey<T> = T extends readonly (infer U)[] ? U : T

export type OptionCopy = {
  label: string
  short?: string
}

export type QuestionCopy<TValue = unknown> = {
  short?: string
  long?: string
  options?: Extract<ValueToOptionKey<TValue>, string> extends never
    ? never
    : string extends Extract<ValueToOptionKey<TValue>, string>
      ? never
      : Record<Extract<ValueToOptionKey<TValue>, string>, OptionCopy>
}

export type WebAppCopy           = { [K in keyof WebAppConfig]:           QuestionCopy<WebAppConfig[K]> }
export type BackendCopy          = { [K in keyof BackendConfig]:          QuestionCopy<BackendConfig[K]> }
export type CliCopy              = { [K in keyof CliConfig]:              QuestionCopy<CliConfig[K]> }
export type LibraryCopy          = { [K in keyof LibraryConfig]:          QuestionCopy<LibraryConfig[K]> }
export type MobileAppCopy        = { [K in keyof MobileAppConfig]:        QuestionCopy<MobileAppConfig[K]> }
export type DataPipelineCopy     = { [K in keyof DataPipelineConfig]:     QuestionCopy<DataPipelineConfig[K]> }
export type MlCopy               = { [K in keyof MlConfig]:               QuestionCopy<MlConfig[K]> }
export type BrowserExtensionCopy = { [K in keyof BrowserExtensionConfig]: QuestionCopy<BrowserExtensionConfig[K]> }
export type GameCopy             = { [K in keyof GameConfig]:             QuestionCopy<GameConfig[K]> }
export type ResearchCopy         = { [K in keyof ResearchConfig]:         QuestionCopy<ResearchConfig[K]> }
export type DataScienceCopy      = { [K in keyof DataScienceConfig]:      QuestionCopy<DataScienceConfig[K]> }

// CoreCopy is individually typed — NOT Record<..., QuestionCopy<string>>
// because QuestionCopy<string> makes `options` always `never` (the bare-string ban).
// projectType needs QuestionCopy<ProjectType> to allow per-option copy.
export type CoreCopy = {
  methodology: QuestionCopy<MethodologyName>
  depth: QuestionCopy<string> // depth is numeric (1-5); options are never regardless of type param
  codexAdapter: QuestionCopy<string>   // yes/no confirm — no enum options
  geminiAdapter: QuestionCopy<string>  // yes/no confirm — no enum options
  webTrait: QuestionCopy<string>       // yes/no confirm — no enum options
  mobileTrait: QuestionCopy<string>    // yes/no confirm — no enum options
  projectType: QuestionCopy<ProjectType>
  advancedGameGate: QuestionCopy<string> // yes/no confirm — no enum options
}

export interface ProjectCopyMap {
  'web-app':           WebAppCopy
  'backend':           BackendCopy
  'cli':               CliCopy
  'library':           LibraryCopy
  'mobile-app':        MobileAppCopy
  'data-pipeline':     DataPipelineCopy
  'ml':                MlCopy
  'browser-extension': BrowserExtensionCopy
  'game':              GameCopy
  'research':          ResearchCopy
  'data-science':      DataScienceCopy
}
