import type { SignalContext } from './context.js'
import type { BrowserExtensionMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

type ScaffoldWarning = import('../../types/index.js').ScaffoldWarning

interface ManifestShape {
  manifest_version?: unknown
  content_scripts?: unknown[]
  background?: { service_worker?: string; scripts?: unknown[] }
  action?: { default_popup?: string }
  browser_action?: { default_popup?: string }
  options_ui?: unknown
  options_page?: unknown
  chrome_url_overrides?: { newtab?: unknown }
  devtools_page?: unknown
  side_panel?: unknown
}

export function detectBrowserExtension(ctx: SignalContext): BrowserExtensionMatch | null {
  if (!ctx.hasFile('manifest.json')) return null
  const text = ctx.readFileText('manifest.json', 16384)
  if (text === undefined) return null

  let manifest: ManifestShape
  try {
    manifest = JSON.parse(text) as ManifestShape
  } catch {
    // SignalContext already emits ADOPT_FILE_UNREADABLE / unparseable warnings if applicable
    return null
  }

  // CRITICAL: strict integer check (rejects PWA manifests + string "3")
  const mv = manifest.manifest_version
  if (mv !== 2 && mv !== 3) return null

  const ev: DetectionEvidence[] = [evidence('manifest-version', 'manifest.json', `MV${mv}`)]
  const partialConfig: BrowserExtensionMatch['partialConfig'] = {
    manifestVersion: mv === 2 ? '2' : '3',
  }

  // CRITICAL: only set fields when positive evidence — omit otherwise so Zod defaults apply
  if (Array.isArray(manifest.content_scripts) && manifest.content_scripts.length > 0) {
    partialConfig.hasContentScript = true
    ev.push(evidence('content-scripts'))
  }
  const bgScripts = Array.isArray(manifest.background?.scripts) && manifest.background.scripts.length > 0
  if (manifest.background?.service_worker || bgScripts) {
    partialConfig.hasBackgroundWorker = true
    ev.push(evidence('background-worker'))
  }

  const uiSurfaces: BrowserExtensionMatch['partialConfig']['uiSurfaces'] = []
  if (manifest.action?.default_popup || manifest.browser_action?.default_popup) uiSurfaces.push('popup')
  if (manifest.options_ui || manifest.options_page) uiSurfaces.push('options')
  if (manifest.chrome_url_overrides?.newtab) uiSurfaces.push('newtab')
  if (manifest.devtools_page) uiSurfaces.push('devtools')
  if (manifest.side_panel) uiSurfaces.push('sidepanel')
  if (uiSurfaces.length > 0) partialConfig.uiSurfaces = uiSurfaces

  // Minimal extension warning (e.g. theme extensions with no UI/scripts/worker)
  if (
    !partialConfig.hasContentScript
    && !partialConfig.hasBackgroundWorker
    && (!partialConfig.uiSurfaces || partialConfig.uiSurfaces.length === 0)
  ) {
    ;(ctx.warnings as ScaffoldWarning[]).push({
      code: 'ADOPT_MINIMAL_EXTENSION',
      message: 'Detected a minimal browser extension with no UI surfaces, content scripts, '
        + 'or background worker. Defaulting fields via Zod defaults — adjust config.yml if needed.',
      context: { manifest_version: String(mv) },
    })
  }

  return { projectType: 'browser-extension', confidence: 'high', partialConfig, evidence: ev }
}
