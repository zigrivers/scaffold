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

    // Failure is decided BEFORE the output-mode branch. Keeping the decision
    // inside the non-JSON branch is what let `--format json` return the
    // success-shaped payload with exit 1 — a caller branching on `success`
    // would have read a failed validation as a pass.
    if (result.errors.length > 0) {
      // Warnings only: fail() already renders every error for humans, so
      // passing the errors here too printed each one twice.
      if (outputMode !== 'json') displayErrors([], result.warnings, output)
      output.fail(result.errors.map(e => ({
        code: e.code,
        message: e.context?.file ? `${e.context.file}: ${e.message}` : e.message,
        exitCode: ExitCode.ValidationError,
        recovery: 'Fix the reported field in the named file, then re-run `scaffold validate`',
      })))
      process.exitCode = ExitCode.ValidationError
      return
    }

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
      displayErrors([], result.warnings, output)
      output.success(
        `Validation passed: ${result.validFilesCount}/${result.totalFilesCount} files valid` +
        (result.warnings.length > 0 ? `, ${result.warnings.length} warning(s)` : ''),
      )
    }

    process.exitCode = 0
  },
}

export default validateCommand
