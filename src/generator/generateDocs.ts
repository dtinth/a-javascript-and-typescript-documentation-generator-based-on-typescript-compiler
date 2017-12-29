import * as doc from './doc'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

import createWalker from './createWalker'

interface GenerateDocsResult {
  documentation: doc.DocumentationData
  program: ts.Program
  checker: ts.TypeChecker
}

export default function generateDocs (rootFileNames: string[], moduleName: string = '.'): GenerateDocsResult {
  rootFileNames = rootFileNames.map(n => fs.realpathSync(n))
  const basePath = require('commondir')(rootFileNames.map(f => path.dirname(f)))

  const { options } = ts.convertCompilerOptionsFromJson({
    allowJs: true
  }, basePath)
  const program = ts.createProgram(rootFileNames, options)
  const checker = program.getTypeChecker()
  const walker = createWalker(program, basePath, moduleName)

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

  return {
    documentation: walker.getState(),
    program,
    checker
  }
}
