import type { CommandModule } from 'yargs'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext, exitNotInitialized } from '../output/context.js'
import { ExitCode } from '../../types/enums.js'
import { displayErrors } from '../output/error-display.js'
import { runValidation } from '../../validation/index.js'
import type { ValidationScope } from '../../validation/index.js'

interface ValidateArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
  scope?: string
}

const validateCommand: CommandModule<Record<string, unknown>, ValidateArgs> = {
  command: 'validate',
  describe: 'Validate meta-prompts and config',
  builder: (yargs) => {
    return yargs.option('scope', {
      type: 'string',
      description: 'Comma-separated list of validation scopes: config,frontmatter,state,dependencies',
    })
  },
  handler: async (argv) => {
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    if (!projectRoot) {
      exitNotInitialized(argv)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    // Parse --scope flag
    const scopeArg = argv.scope
    const scopes: ValidationScope[] = scopeArg
      ? (scopeArg.split(',').map(s => s.trim()) as ValidationScope[])
      : ['config', 'frontmatter', 'state', 'dependencies']

    const result = runValidation(projectRoot, scopes)

    if (outputMode === 'json') {
      output.result({
        valid: result.errors.length === 0,
        errors: result.errors.map(e => ({
          code: e.code,
          message: e.message,
          file: e.context?.file ?? null,
        })),
        warnings: result.warnings.map(w => ({
          code: w.code,
          message: w.message,
        })),
        scopes: result.scopes,
        files: {
          valid: result.validFilesCount,
          total: result.totalFilesCount,
        },
      })
    } else {
      if (result.errors.length > 0) {
        displayErrors(result.errors, result.warnings, output)
        output.fail([{
          code: 'VALIDATION_FAILED',
          message:
            `Validation failed: ${result.errors.length} error(s), ${result.warnings.length} warning(s)`,
          exitCode: ExitCode.ValidationError,
          recovery: 'Fix the errors listed above; each names the file and field that failed',
        }])
      } else {
        displayErrors([], result.warnings, output)
        output.success(
          `Validation passed: ${result.validFilesCount}/${result.totalFilesCount} files valid` +
          (result.warnings.length > 0 ? `, ${result.warnings.length} warning(s)` : ''),
        )
      }
    }

    process.exitCode = result.errors.length > 0 ? ExitCode.ValidationError : 0
  },
}

export default validateCommand
