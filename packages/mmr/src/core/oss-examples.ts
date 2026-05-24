export interface OssProbeSpec {
  command: string
  args: string[]
  timeoutMs: number
}

export interface OssRuntime {
  id: 'ollama' | 'lms' | 'llama-server' | 'local-ai-delegate'
  probe: OssProbeSpec
}

/**
 * Catalog of OSS runtimes available to config-init probing. v3.28 ships
 * subprocess support only; HTTP-shaped runtimes (lms, llama-server,
 * local-ai-delegate) get commented-out stubs that note v3.30 will enable them.
 */
export const OSS_RUNTIMES: OssRuntime[] = [
  { id: 'ollama', probe: { command: 'ollama', args: ['list'], timeoutMs: 1000 } },
  { id: 'lms', probe: { command: 'lms', args: ['ps'], timeoutMs: 1000 } },
  { id: 'llama-server', probe: { command: 'llama-server', args: ['--help'], timeoutMs: 1000 } },
  {
    id: 'local-ai-delegate',
    probe: { command: 'local-ai-delegate', args: ['--version'], timeoutMs: 1000 },
  },
]

/**
 * Commented YAML block for the given runtime. The block is meant to be
 * pasted directly into a generated .mmr.yaml; every line is prefixed with
 * `# ` so the user must explicitly opt in by uncommenting and editing.
 */
export function exampleBlockFor(id: OssRuntime['id']): string {
  switch (id) {
  case 'ollama':
    return [
      '# example: ollama (subprocess, JSON output)',
      '#   Uncomment and adjust to enable a local Ollama channel.',
      '#   abstract: true                                    # template only',
      '#   command: ollama run',
      '#   flags: ["qwen2.5-coder:32b", "--format", "json"]',
      '#   auth:',
      '#     check: "ollama list"',
      '#     timeout: 5',
      '#     failure_exit_codes: [1]',
      '#     recovery: "ollama serve"',
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
      '# example: local-ai-delegate (MCP bridge, HTTP) - requires MMR v3.30+',
      '#   The local-ai-delegate MCP server proxies an OpenAI-compatible',
      '#   endpoint to a locally-hosted model. HTTP channel kind ships in',
      '#   v3.30; for v3.28 you can wrap it in a shell shim if needed.',
      '#   abstract: true                                    # template only',
      '#   command: local-ai-delegate review',
      '#   flags: ["--format", "json"]',
    ].join('\n')
  }
}
