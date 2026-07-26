import { describe, it, expect } from 'vitest'
import { unreachableFloorWarning } from '../../src/core/reconciler.js'

describe('unreachableFloorWarning (review round 1, finding 4)', () => {
  // A floor above the number of channels you dispatch can never be met, so the
  // run is decided before it starts. The fix is NOT to clamp the floor to the
  // dispatched count — that silently re-opens the `pass 1/1` hole the floor
  // exists to close. Warn at dispatch instead, and let the verdict stand.
  it('warns when the floor exceeds the channels being dispatched', () => {
    const w = unreachableFloorWarning(2, ['codex'])
    expect(w).toBeTruthy()
    expect(w).toContain('min_completed_channels')
    expect(w).toContain('2')
    expect(w).toContain('1')
  })

  it('is silent when the floor is reachable', () => {
    expect(unreachableFloorWarning(2, ['codex', 'claude'])).toBeNull()
    expect(unreachableFloorWarning(1, ['codex'])).toBeNull()
  })
})
