import { describe, it, expect } from 'vitest'
import { ExitCode } from './enums.js'

describe('ExitCode enum', () => {
  it('has correct exit code values per ADR-025', () => {
    expect(ExitCode.Success).toBe(0)
    expect(ExitCode.ValidationError).toBe(1)
    expect(ExitCode.MissingDependency).toBe(2)
    expect(ExitCode.StateCorruption).toBe(3)
    expect(ExitCode.UserCancellation).toBe(4)
    expect(ExitCode.BuildError).toBe(5)
  })
})
