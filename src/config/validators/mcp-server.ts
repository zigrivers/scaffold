import type { CouplingValidator } from './types.js'
import type { McpServerConfig } from '../../types/config.js'

export const mcpServerCouplingValidator: CouplingValidator<McpServerConfig> = {
  configKey: 'mcpServerConfig',
  projectType: 'mcp-server',
  validate(ctx, path, projectType, config) {
    if (config !== undefined && projectType !== 'mcp-server') {
      ctx.addIssue({
        path: [...path, 'mcpServerConfig'],
        code: 'custom',
        message: 'mcpServerConfig requires projectType: mcp-server',
      })
    }
    if (config) {
      const { transport, auth, deployment } = config
      // Only check EXPLICIT stdio — undefined transport is already handled by the
      // schema-level superRefine (which runs after Zod applies the 'stdio' default).
      // Checking undefined here would produce misleading errors for configs that
      // never specified a transport at all.
      const transportIsStdio = transport === 'stdio'
      if (auth !== undefined && auth !== 'none' && transportIsStdio) {
        ctx.addIssue({
          path: [...path, 'mcpServerConfig', 'auth'],
          code: 'custom',
          message: 'stdio transport cannot use network auth (set auth: none or use a non-stdio transport)',
        })
      }
      if (deployment === 'hosted' && transportIsStdio) {
        ctx.addIssue({
          path: [...path, 'mcpServerConfig', 'deployment'],
          code: 'custom',
          message:
            'stdio transport runs locally and cannot be hosted'
            + ' (set deployment: local or use a non-stdio transport)',
        })
      }
    }
  },
}
