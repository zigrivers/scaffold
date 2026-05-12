import type { SignalContext } from './context.js'
import type { Web3Match, DetectionEvidence } from './types.js'
import { evidence } from './types.js'

export function detectWeb3(ctx: SignalContext): Web3Match | null {
  const ev: DetectionEvidence[] = []

  const hasFoundryToml = ctx.hasFile('foundry.toml')
  const hasHardhatTs = ctx.hasFile('hardhat.config.ts')
  const hasHardhatJs = ctx.hasFile('hardhat.config.js')
  const hasHardhatCjs = ctx.hasFile('hardhat.config.cjs')
  const hasHardhatMjs = ctx.hasFile('hardhat.config.mjs')
  const hasHardhatConfig = hasHardhatTs || hasHardhatJs || hasHardhatCjs || hasHardhatMjs

  const hasRemappings = ctx.hasFile('remappings.txt')
  const hasForgeStdDir = ctx.dirExists('lib/forge-std')

  const hasMediumSignal = hasFoundryToml || hasHardhatConfig
  const hasLowSignal = hasRemappings || hasForgeStdDir

  if (!hasMediumSignal && !hasLowSignal) return null

  if (hasFoundryToml) ev.push(evidence('foundry-toml', 'foundry.toml'))
  if (hasHardhatTs) ev.push(evidence('hardhat-config', 'hardhat.config.ts'))
  if (hasHardhatJs) ev.push(evidence('hardhat-config', 'hardhat.config.js'))
  if (hasHardhatCjs) ev.push(evidence('hardhat-config', 'hardhat.config.cjs'))
  if (hasHardhatMjs) ev.push(evidence('hardhat-config', 'hardhat.config.mjs'))
  if (hasRemappings) ev.push(evidence('remappings-txt', 'remappings.txt'))
  if (hasForgeStdDir) ev.push(evidence('forge-std-lib', 'lib/forge-std'))

  return {
    projectType: 'web3',
    confidence: hasMediumSignal ? 'medium' : 'low',
    partialConfig: {},
    evidence: ev,
  }
}
