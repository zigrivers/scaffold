import type { MethodologyName } from './enums.js'

export interface WizardAnswers {
  projectName: string
  methodology: MethodologyName
  platforms: Array<'claude-code' | 'codex' | 'gemini'>
  projectPlatforms?: Array<'web' | 'mobile' | 'desktop'>
}

export interface DetectionResult {
  hasExistingCode: boolean
  hasScaffoldConfig: boolean
  hasV1Config: boolean
  suggestedMode: 'greenfield' | 'brownfield' | 'v1-migration'
}
