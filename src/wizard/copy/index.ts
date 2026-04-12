import type { ProjectType } from '../../types/index.js'
import type { SelectOption } from '../../cli/output/context.js'
import type { OptionCopy, ProjectCopyMap } from './types.js'
import { coreCopy } from './core.js'
import { webAppCopy } from './web-app.js'
import { backendCopy } from './backend.js'
import { cliCopy } from './cli.js'
import { libraryCopy } from './library.js'
import { mobileAppCopy } from './mobile-app.js'
import { dataPipelineCopy } from './data-pipeline.js'
import { mlCopy } from './ml.js'
import { browserExtensionCopy } from './browser-extension.js'
import { gameCopy } from './game.js'
import { researchCopy } from './research.js'

const PROJECT_COPY: ProjectCopyMap = {
  'web-app': webAppCopy,
  'backend': backendCopy,
  'cli': cliCopy,
  'library': libraryCopy,
  'mobile-app': mobileAppCopy,
  'data-pipeline': dataPipelineCopy,
  'ml': mlCopy,
  'browser-extension': browserExtensionCopy,
  'game': gameCopy,
  'research': researchCopy,
}

export function getCopyForType<T extends ProjectType>(type: T): ProjectCopyMap[T] {
  return PROJECT_COPY[type]
}

export function optionsFromCopy<T extends string>(
  copy: Record<T, OptionCopy> | undefined,
  values: readonly T[],
): SelectOption[] {
  if (!copy) {
    throw new Error(
      'optionsFromCopy called with undefined copy — check that the copy file defines options for this field',
    )
  }
  return values.map(v => ({ value: v, label: copy[v].label, short: copy[v].short }))
}

export { coreCopy }
