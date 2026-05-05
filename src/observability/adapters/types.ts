import type { AdapterId, AdapterStatus } from '../engine/types.js'

export type { AdapterId, AdapterStatus }

export interface BaseAdapter {
  readonly id: AdapterId
  probe(cwd: string): Promise<AdapterStatus>
}
