import type { DepthLevel } from './enums.js'

export interface DecisionEntry {
  id: string
  prompt: string
  decision: string
  at: string
  completed_by: string
  step_completed: boolean
  category?: string
  tags?: string[]
  review_status?: 'pending' | 'approved' | 'rejected'
  depth?: DepthLevel
}
