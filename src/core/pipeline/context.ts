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

  const metaPrompts = options?.includeTools
    ? discoverAllMetaPrompts(pipelineDir, getPackageToolsDir(projectRoot))
    : discoverMetaPrompts(pipelineDir)

  const knownSteps = [...metaPrompts.keys()]
  const { config, errors: configErrors, warnings: configWarnings } = loadConfig(projectRoot, knownSteps)
  const { deep, mvp, custom } = loadAllPresets(methodologyDir, knownSteps)

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
