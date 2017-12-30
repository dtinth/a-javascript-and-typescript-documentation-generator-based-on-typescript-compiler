import * as doc from '../generator/doc'
import * as fs from 'fs'
import * as minimist from 'minimist'
import * as path from 'path'
import * as ts from 'typescript'

import generateDocs from '../generator/generateDocs'

const args = minimist(process.argv.slice(2))

const rootFileNames = args._

if (!rootFileNames.length) {
  console.error('No input files specified.')
  console.log()
  console.log('Usage:')
  console.log('    a-javascript-and-typescript-documentation-generator-based-on-typescript-compiler <inputfile.ts ...> [--json <docs/api.json>] [--html <docs/api>]')
  console.log('')
  console.log('Arguments:')
  console.log('    --json FILE    Generates a JSON file.')
  console.log('    --html DIR     Generates a documentation site into DIR.')
  console.log('')
  console.log('Have fun ^_^')
  process.exit(1)
}

const moduleName = args.moduleName || '.'

const { documentation, program, checker } = generateDocs(rootFileNames, moduleName)

if (typeof args.json === 'string') {
  fs.writeFileSync(args.json, JSON.stringify(documentation, null, 2))
} else if (args.html) {
  require('mkdirp').sync(args.html)
  const generateDocumentationSite = require('../web/generateDocumentationSite').default
  const renderPageToString = require('../web/renderPageToString').default
  const result = generateDocumentationSite(documentation)
  for (const page of result.pages) {
    const outname = path.join(args.html, page.filename)
    console.error('*', outname)
    const html = renderPageToString(page)
    fs.writeFileSync(outname, html)
  }
} else {
  console.log(JSON.stringify(documentation, null, 2))
}
