export interface OssProbeSpec {
  command: string
  args: string[]
  timeoutMs: number
}

export type OssRuntimeId = 'ollama' | 'lms' | 'llama-server' | 'local-ai-delegate'

export interface OssRuntime {
  id: OssRuntimeId
  probe: OssProbeSpec
}

/**
 * Catalog of OSS runtimes available to config-init probing. v3.28 ships
 * subprocess support only; HTTP-shaped runtimes (lms, llama-server) get
 * commented-out stubs that note v3.30 will enable them. local-ai-delegate
 * documents a subprocess shim users can adapt in v3.28.
 */
const OSS_RUNTIME_PROBES: Record<OssRuntimeId, OssProbeSpec> = {
  ollama: { command: 'ollama', args: ['list'], timeoutMs: 1000 },
  lms: { command: 'lms', args: ['ps'], timeoutMs: 1000 },
  'llama-server': { command: 'llama-server', args: ['--help'], timeoutMs: 1000 },
  'local-ai-delegate': { command: 'local-ai-delegate', args: ['--version'], timeoutMs: 1000 },
}

export const OSS_RUNTIMES: OssRuntime[] = (
  Object.entries(OSS_RUNTIME_PROBES) as Array<[OssRuntimeId, OssProbeSpec]>
).map(([id, probe]) => ({ id, probe }))

/**
 * Commented YAML block for the given runtime. The block is meant to be
 * pasted directly into a generated .mmr.yaml; every line is prefixed with
 * `# ` so the user must explicitly opt in by uncommenting and editing.
 */
export function exampleBlockFor(id: OssRuntimeId): string {
  switch (id) {
  case 'ollama':
    return [
      '# example: ollama (subprocess, JSON output)',
      '#   Uncomment and adjust to enable a local Ollama channel.',
      '#   ollama-base:',
      '#     abstract: true                                  # template only',
      '#     command: ollama run',
      '#     auth:',
      '#       check: "ollama list"',
      '#       timeout: 5                                    # seconds',
      '#       failure_exit_codes: [1]',
      '#       recovery: "ollama serve"',
      '#   qwen-local:',
      '#     extends: ollama-base',
      '#     flags: ["qwen2.5-coder:32b", "--format", "json"]',
    ].join('\n')
  case 'lms':
    return [
      '# example: lms (LM Studio, HTTP) - requires MMR v3.30+',
      '#   LM Studio exposes /v1/chat/completions only; HTTP channel kind',
      '#   ships in v3.30. Leaving as a placeholder for now.',
    ].join('\n')
  case 'llama-server':
    return [
      '# example: llama-server (llama.cpp HTTP) - requires MMR v3.30+',
      '#   llama-server exposes /v1/chat/completions only; HTTP channel',
      '#   kind ships in v3.30. Leaving as a placeholder for now.',
    ].join('\n')
  case 'local-ai-delegate':
    return [
      '# example: local-ai-delegate (MCP bridge subprocess shim)',
      '#   The local-ai-delegate MCP server proxies an OpenAI-compatible',
      '#   endpoint to a locally-hosted model. Native HTTP channel kind ships',
      '#   in v3.30; this v3.28 example assumes a shell shim wrapper.',
      '#   local-ai-delegate-base:',
      '#     abstract: true                                  # template only',
      '#     command: local-ai-delegate review',
      '#   local-ai-delegate-local:',
      '#     extends: local-ai-delegate-base',
      '#     flags: ["--format", "json"]',
    ].join('\n')
  }
  const exhaustive: never = id
  return exhaustive
}
