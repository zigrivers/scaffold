import { loadConfig, loadConfigWithProvenance, type ProvenanceSource } from './loader.js'
import { resolveConfigPaths } from './paths.js'

/**
 * Decide which config file a *disable* of a not-installed channel should land
 * in, and whether that file may be a symlink. Shared by `mmr config disable`
 * (auto-routing) and `mmr doctor --fix` so both make the identical, correct
 * choice:
 *
 *   global  ⇔  the channel resolves from global-only config (built-in or
 *              user-defined) AND its command value is not a project override —
 *              i.e. the absence is machine-level. Global files may be a
 *              dotfiles-managed symlink (allowSymlink).
 *   project ⇔  otherwise (project-only channel, or a project command override);
 *              the project file must not be written through a symlink.
 */
export function resolveDisableScope(opts: { projectRoot: string }): {
  forChannel(channel: string): { file: string; global: boolean; allowSymlink: boolean }
} {
  const paths = resolveConfigPaths(opts)
  const globalOnly = loadConfig({ projectRoot: opts.projectRoot, skipProjectConfig: true })
  const { provenance } = loadConfigWithProvenance({ projectRoot: opts.projectRoot })
  return {
    forChannel(channel: string) {
      const cmdSource = provenance.channels[channel]?.command as ProvenanceSource | undefined
      const resolvesGlobally = globalOnly.channels[channel] !== undefined
      const machineLevel = cmdSource === 'default' || cmdSource === 'user'
      if (resolvesGlobally && machineLevel) {
        return { file: paths.user, global: true, allowSymlink: true }
      }
      return { file: paths.project, global: false, allowSymlink: false }
    },
  }
}
