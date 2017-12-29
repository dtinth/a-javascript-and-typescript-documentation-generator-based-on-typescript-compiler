import * as doc from './doc'
import * as fs from 'fs'
import * as minimist from 'minimist'
import * as path from 'path'
import * as ts from 'typescript'

import generateDocs from './generateDocs'

const args = minimist(process.argv.slice(2))

const rootFileNames = (args._.length > 0
  ? args._
  : [ require.resolve('./test/fixtures/index.ts') ]
)

const moduleName = args.moduleName || '.'

const { documentation, program, checker } = generateDocs(rootFileNames, moduleName)

if (typeof args.json === 'string') {
  fs.writeFileSync(args.json, JSON.stringify(documentation, null, 2))
} else if (args.out) {
  throw new Error('TODO: Generate HTML')
} else {
  console.log(JSON.stringify(documentation, null, 2))
}

// For further testing in REPL...
Object.assign(global, {
  ts,
  program,
  checker
})
