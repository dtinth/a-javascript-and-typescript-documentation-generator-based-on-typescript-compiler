import * as doc from './doc'
import * as fs from 'fs'
import * as minimist from 'minimist'
import * as ts from 'typescript'

import createWalker from './createWalker'

const args = minimist(process.argv.slice(2))

const rootFileNames = (args._.length > 0
  ? args._
  : [ require.resolve('./test/fixtures/index.ts') ]
).map(n => fs.realpathSync(n))

const basePath = require('commondir')(rootFileNames)

const { options } = ts.convertCompilerOptionsFromJson({
  allowJs: true
}, basePath)

const program = ts.createProgram(rootFileNames, options)
const checker = program.getTypeChecker()
const walker = createWalker(program, basePath)

for (const filename of program.getRootFileNames()) {
  const file = program.getSourceFile(filename)
  const moduleSymbol = (file as any).symbol
  if (!moduleSymbol) continue
  walker.readModule(moduleSymbol)
}

if (!walker.getState().publicModules.length) {
  for (const ambientModule of checker.getAmbientModules()) {
    walker.readModule(ambientModule)
  }
}

if (typeof args.json === 'string') {
  fs.writeFileSync(args.json, JSON.stringify(walker.getState(), null, 2))
} else if (args.out) {
  throw new Error('TODO: Generate HTML')
} else {
  console.log(JSON.stringify(walker.getState(), null, 2))
}

// For further testing in REPL...
Object.assign(global, {
  ts,
  program,
  checker
})
