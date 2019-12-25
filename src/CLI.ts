import * as fs from 'fs'
import * as tkt from 'tkt'
import { generateDocs } from './ModelGenerator'

/**
 * Runs the CLI.
 */
export function startCli() {
  return tkt
    .cli()
    .command(
      '$0 <rootFileNames..>',
      'Generates a documentation model',
      {
        rootFileNames: {
          demand: true,
          desc: 'Path to files',
        },
        output: {
          alias: ['o'],
          desc: 'Output JSON file',
          type: 'string',
        },
        debug: {
          desc:
            'Invoke "debugger;" before start processing docs. For use with "--inspect-brk".',
          type: 'boolean',
        },
      },
      async args => {
        const rootFileNames = args.rootFileNames as string[]
        const { model } = generateDocs(rootFileNames, {
          debug: args.debug,
        })
        if (args.output) {
          fs.writeFileSync(args.output, JSON.stringify(model, null, 2))
        } else {
          console.log(JSON.stringify(model, null, 2))
        }
      },
    )
    .parse()
}
