import * as doc from './doc'
import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'

import createWalker from './createWalker'

/**
 * Generates a documentation data.
 *
 * @param rootFilename An array representing filepaths of public modules.
 * @param moduleName The module name that you are generating a documentation for.
 */
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

/**
 * The result of calling `generateDocs()`.
 */
export interface GenerateDocsResult {
  /**
   * The documentation data.
   */
  documentation: doc.DocumentationData
  /**
   * The `ts.Program` instance created from generating the documentation.
   */
  program: ts.Program
  /**
   * The `ts.TypeChecker` for the `program`.
   */
  checker: ts.TypeChecker
}
