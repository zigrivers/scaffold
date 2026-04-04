import yargs from 'yargs'

export async function runCli(argv: string[]): Promise<void> {
  await yargs(argv)
    .scriptName('mmr')
    .usage('$0 <command> [options]')
    .demandCommand(1, 'Run mmr --help for usage')
    .strict()
    .help()
    .argv
}
