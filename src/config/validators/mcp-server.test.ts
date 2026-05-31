import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { mcpServerCouplingValidator } from './mcp-server.js'
import type { McpServerConfig } from '../../types/config.js'

function runValidate(projectType: any, config: Partial<McpServerConfig> | undefined) {
  const issues: { path: (string | number)[]; message: string }[] = []
  const ctx = {
    addIssue: (i: any) => issues.push({ path: i.path, message: i.message }),
  } as unknown as z.RefinementCtx
  mcpServerCouplingValidator.validate(ctx, [], projectType, config as McpServerConfig | undefined)
  return issues
}

describe('mcpServerCouplingValidator', () => {
  it('rejects mcpServerConfig without projectType mcp-server', () => {
    const issues = runValidate('cli', { language: 'python' })
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toMatch(/requires projectType: mcp-server/)
  })

  it('accepts mcpServerConfig with matching projectType', () => {
    expect(runValidate('mcp-server', { language: 'python' })).toHaveLength(0)
  })

  it('rejects auth other than none on stdio transport', () => {
    const issues = runValidate('mcp-server', { language: 'python', transport: 'stdio', auth: 'oauth' })
    expect(issues.some(i => /stdio.*auth|auth.*stdio/i.test(i.message))).toBe(true)
  })

  it('allows oauth on a non-stdio transport', () => {
    expect(runValidate('mcp-server', {
      language: 'typescript', transport: 'streamable-http', auth: 'oauth',
    })).toHaveLength(0)
  })
})
