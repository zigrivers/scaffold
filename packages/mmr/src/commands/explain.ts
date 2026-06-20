import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import { EXPLAIN_TOPICS } from '../core/explain.js'

interface ExplainArgs {
  topic?: string
}

function topicList(): string {
  return Object.keys(EXPLAIN_TOPICS).sort().join(', ')
}

export const explainCommand: CommandModule<object, ExplainArgs> = {
  command: 'explain [topic]',
  describe: 'Print inline docs for an MMR concept (channels, config, compensation, …)',
  builder: (yargs) =>
    yargs
      .positional('topic', { type: 'string', describe: 'Concept to explain' })
      .example('mmr explain', 'List available topics')
      .example('mmr explain compensation', 'Explain how compensation works'),
  handler: (args: ArgumentsCamelCase<ExplainArgs>) => {
    if (!args.topic) {
      console.log(`Topics: ${topicList()}`)
      console.log('Run `mmr explain <topic>` for any of them.')
      return
    }
    const body = EXPLAIN_TOPICS[args.topic.toLowerCase()]
    if (!body) {
      console.error(`Unknown topic '${args.topic}'. Available: ${topicList()}`)
      process.exit(1)
      return
    }
    console.log(body)
  },
}
