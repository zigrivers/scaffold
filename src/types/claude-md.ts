export interface ReservedSection {
  id: string
  heading: string
  content: string
  tokenCount: number
}

export interface SectionRegistry {
  sections: ReservedSection[]
  totalTokens: number
}
