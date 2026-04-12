import type { CliCopy } from './types.js'

export const cliCopy: CliCopy = {
  interactivity: {
    short: 'How users interact with the tool.',
    long: 'Args-only is best for scripting; interactive suits human-first workflows; hybrid supports both.',
    options: {
      'args-only':   { label: 'Args only',   short: 'All input via flags and arguments — ideal for scripts and CI.' },
      'interactive':  { label: 'Interactive',  short: 'Prompts and menus guide the user through each step.' },
      'hybrid': {
        label: 'Hybrid',
        short: 'Interactive when run by a human, flags-only when piped or scripted.',
      },
    },
  },
  distributionChannels: {
    short: 'How users will install the CLI.',
    long: 'You can select more than one. Each channel adds packaging and release automation.',
    options: {
      'package-manager': {
        label: 'Package manager (npm/yarn/pnpm)',
        short: 'Published to a JS registry and installed via npm or similar.',
      },
      'system-package-manager': {
        label: 'System package manager (Homebrew/apt)',
        short: 'Distributed through OS-level package managers.',
      },
      'standalone-binary': {
        label: 'Standalone binary',
        short: 'Single executable with no runtime dependencies.',
      },
      'container': {
        label: 'Container (Docker)',
        short: 'Packaged as a Docker image for isolated execution.',
      },
    },
  },
  hasStructuredOutput: {
    short: 'Emit machine-readable output (JSON/YAML) alongside human text.',
  },
}
