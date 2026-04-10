// src/project/detectors/cli.ts
import type { SignalContext } from './context.js'
import type { CliMatch, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

export function detectCli(ctx: SignalContext): CliMatch | null {
  const ev: DetectionEvidence[] = []

  // High-tier signals (any of these qualifies as "shipping a CLI")
  const pkg = ctx.packageJson()
  const hasNodeBin = pkg?.bin !== undefined && pkg.bin !== null
  if (hasNodeBin) ev.push(evidence('pkg-bin-field', 'package.json'))

  const cargo = ctx.cargoToml()
  const hasCargoBin = !!cargo?.bin && cargo.bin.length > 0
  if (hasCargoBin) ev.push(evidence('cargo-bin', 'Cargo.toml'))

  const py = ctx.pyprojectToml()
  const hasPyScripts = !!py?.project?.scripts && Object.keys(py.project.scripts).length > 0
  if (hasPyScripts) ev.push(evidence('pyproject-scripts', 'pyproject.toml'))

  const goCmdDirs = ctx.dirExists('cmd')
  if (goCmdDirs && ctx.goMod()) ev.push(evidence('go-cmd-dir', 'cmd/'))

  // CLI framework deps (medium tier when no bin)
  const hasCliFramework =
    ctx.hasAnyDep(['commander', 'yargs', 'clipanion', 'cac', 'oclif', '@oclif/core'], 'npm')
    || ctx.hasDep('clap', 'cargo')
    || ctx.hasDep('structopt', 'cargo')
    || ctx.hasAnyDep(['typer', 'click'], 'py')
    || ctx.hasAnyDep(['github.com/spf13/cobra', 'github.com/urfave/cli'], 'go')

  const hasHighSignal = hasNodeBin || hasCargoBin || hasPyScripts || (goCmdDirs && ctx.goMod())
  if (!hasHighSignal && !hasCliFramework) return null

  const confidence: 'high' | 'medium' = hasHighSignal ? 'high' : 'medium'

  // interactivity
  const hasPrompts = ctx.hasAnyDep(['@inquirer/prompts', 'inquirer', 'enquirer', 'prompts'], 'npm')
    || ctx.hasAnyDep(['questionary', 'inquirerpy'], 'py')
    || ctx.hasAnyDep(['dialoguer', 'inquire'], 'cargo')
  const hasArgsParser = ctx.hasAnyDep(['commander', 'yargs', 'clipanion', 'cac', 'oclif', '@oclif/core'], 'npm')
    || ctx.hasDep('clap', 'cargo')
    || ctx.hasAnyDep(['typer', 'click'], 'py')
    || ctx.hasAnyDep(['github.com/spf13/cobra', 'github.com/urfave/cli'], 'go')

  let interactivity: CliMatch['partialConfig']['interactivity']
  if (hasPrompts && hasArgsParser) interactivity = 'hybrid'
  else if (hasPrompts) interactivity = 'interactive'
  else interactivity = 'args-only'

  // distributionChannels
  const channels: CliMatch['partialConfig']['distributionChannels'] = []
  if (hasNodeBin || hasCargoBin || hasPyScripts) channels.push('package-manager')
  if (goCmdDirs || (cargo?.bin && cargo.bin.length > 0)) channels.push('standalone-binary')
  if (ctx.hasFile('Dockerfile')) channels.push('container')

  // hasStructuredOutput
  const hasStructuredOutput = ctx.hasAnyDep(['ink', 'listr2', 'cli-table3'], 'npm')
    || ctx.hasAnyDep(['rich', 'tabulate'], 'py')
    || ctx.hasDep('github.com/olekukonko/tablewriter', 'go')

  const partialConfig: CliMatch['partialConfig'] = {
    interactivity,
    hasStructuredOutput,
  }
  if (channels.length > 0) partialConfig.distributionChannels = channels

  return { projectType: 'cli', confidence, partialConfig, evidence: ev }
}
