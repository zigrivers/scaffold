/**
 * Renders the gap-signal tail appended to a pipeline step's Knowledge
 * Base section. The tail instructs downstream agents to emit a
 * knowledge_gap_signal observability event when they search the
 * knowledge base for a topic and find nothing.
 *
 * Returns the empty string when SCAFFOLD_GAP_SIGNAL_QUIET=1 so test
 * fixtures and CI stay deterministic.
 *
 * Called from two sites:
 *  - src/core/assembly/engine.ts (runtime assembly path)
 *  - src/core/adapters/claude-code.ts (generated-command path)
 */

const GAP_SIGNAL_TAIL_TEMPLATE = `### When this knowledge base lacks what you need

If you search this section for a topic and find nothing — and you'd want
guidance to confidently proceed — emit a gap signal so the topic shows up
in the knowledge-base freshness audit:

\`\`\`bash
PROJECT_KEY=$(git remote get-url origin 2>/dev/null || pwd -P)
PROJECT_ID=$(printf '%s' "$PROJECT_KEY" \\
  | { command -v shasum >/dev/null 2>&1 && shasum -a 256 || sha256sum; } \\
  | awk '{print $1}')
scaffold observe event knowledge_gap_signal \\
  --branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)" \\
  --topic="<kebab-case-slug-of-missing-topic>" \\
  --source=agent_search \\
  --project-id="$PROJECT_ID" \\
  --step-name="{{step_name}}" \\
  --agent-excerpt="<≤200 chars of what you were looking for>"
\`\`\`

Use a kebab-case slug like \`agent-eval-harnesses\`, not a full sentence.
Skip emission if you find adequate guidance (this is not for incomplete
coverage of a topic that IS present — it's for topics that aren't covered
at all).`

export interface RenderGapSignalTailOptions {
  stepName: string
}

export function renderGapSignalTail(opts: RenderGapSignalTailOptions): string {
  if (process.env['SCAFFOLD_GAP_SIGNAL_QUIET'] === '1') return ''
  return GAP_SIGNAL_TAIL_TEMPLATE.replace(/\{\{step_name\}\}/g, opts.stepName)
}
