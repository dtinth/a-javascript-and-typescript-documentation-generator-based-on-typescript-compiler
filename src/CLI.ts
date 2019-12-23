import * as fs from 'fs'
import * as tkt from 'tkt'
import generateDocs from './generateDocs'

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
        moduleName: {
          alias: ['n'],
          desc: 'Name of the module',
          default: '.',
        },
      },
      async args => {
        const rootFileNames = args.rootFileNames as string[]
        const moduleName = args.moduleName as string
        const { documentation } = generateDocs(rootFileNames, moduleName)
        if (args.output) {
          fs.writeFileSync(args.output, JSON.stringify(documentation, null, 2))
        } else {
          console.log(JSON.stringify(documentation, null, 2))
        }
      },
    )
    .parse()
}
