export type ProjectMode = 'greenfield' | 'brownfield' | 'v1-migration'

export interface ProjectSignal {
  category: 'package-manifest' | 'source-directory' | 'documentation' | 'test-config' | 'ci-config' | 'v1-tracking'
  file: string
  detected: boolean
}

export interface DetectionResult {
  mode: ProjectMode
  signals: ProjectSignal[]
  methodologySuggestion: 'deep' | 'mvp' | 'custom'
  sourceFileCount: number
}
