import { discoverMetaPrompts, discoverAllMetaPrompts } from '../assembly/meta-prompt-loader.js'
import { loadAllPresets } from '../assembly/preset-loader.js'
import { loadConfig } from '../../config/loader.js'
import { getPackagePipelineDir, getPackageToolsDir, getPackageMethodologyDir } from '../../utils/fs.js'
import type { PipelineContext } from './types.js'

export function loadPipelineContext(
  projectRoot: string,
  options?: {
    includeTools?: boolean
  },
): PipelineContext {
  const pipelineDir = getPackagePipelineDir(projectRoot)
  const methodologyDir = getPackageMethodologyDir(projectRoot)

  // Always discover pipeline steps first for config/preset validation
  const pipelineMetaPrompts = discoverMetaPrompts(pipelineDir)
  const pipelineStepNames = [...pipelineMetaPrompts.keys()]

  // Optionally extend with tools for prompt lookup (run.ts needs tools)
  const metaPrompts = options?.includeTools
    ? discoverAllMetaPrompts(pipelineDir, getPackageToolsDir(projectRoot))
    : pipelineMetaPrompts

  // Validate config and presets against pipeline steps only (not tools)
  const { config, errors: configErrors, warnings: configWarnings } = loadConfig(projectRoot, pipelineStepNames)
  const { deep, mvp, custom } = loadAllPresets(methodologyDir, pipelineStepNames)

  return {
    projectRoot,
    metaPrompts,
    config,
    configErrors,
    configWarnings,
    presets: { deep, mvp, custom },
    methodologyDir,
  }
}
