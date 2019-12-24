import * as DataModel from './DataModel'
import * as fs from 'fs'
import * as path from 'path'
import ts from 'typescript'
// import { createWalker } from './ProgramWalker'
import { Project } from '@ts-morph/bootstrap'
import { typeToLinkedSymbolParts } from './LinkedSymbolPartsWriter'

type GenerateOptions = {
  debug?: boolean
}

/**
 * Generates a documentation data.
 *
 * @param rootFilename An array representing filepaths of public modules.
 */
export function generateDocs(
  rootFileNames: string[],
  generateOptions: GenerateOptions = {},
): GenerateDocsResult {
  rootFileNames = rootFileNames.map(n => fs.realpathSync(n))
  const basePath = require('commondir')(rootFileNames.map(f => path.dirname(f)))

  const { options } = ts.convertCompilerOptionsFromJson(
    { allowJs: true },
    basePath,
  )
  const project = new Project({
    compilerOptions: options,
  })
  const sourceFiles = project.addSourceFilesByPaths(rootFileNames)
  const program = project.createProgram()
  const typeChecker = program.getTypeChecker()
  const languageService = project.getLanguageService()
  const log = (text: string) => {
    console.log(text)
  }
  // const walker = createWalker(program, basePath, '~')

  if (generateOptions.debug) {
    void languageService
    debugger
  }

  const entryModules: string[] = []

  function main() {
    for (const file of sourceFiles) {
      if (!file) continue
      const moduleSymbol = typeChecker.getSymbolAtLocation(file)
      if (!moduleSymbol) continue
      entryModules.push(getSymbolId(moduleSymbol))
      markSymbolToBeElaborated(moduleSymbol)
    }
    while (symbolsToElaborate.size > 0) {
      const symbols = [...symbolsToElaborate]
      symbolsToElaborate = new Set()
      for (const symbol of symbols) {
        if (!elaboratedSymbols.has(symbol)) {
          elaboratedSymbols.add(symbol)
          elaborateOnSymbol(symbol)
        }
      }
    }
  }

  type SymbolData = {
    name: string
    flags: string[]
    documentationComment: ts.SymbolDisplayPart[]
    jsDocTags: ts.JSDocTagInfo[]
    exports?: string[]
    aliased?: string
    exported?: string
    declarations?: any[]
    type?: TypeInfo
    static?: TypeInfo
  }

  let symbolsToElaborate = new Set<ts.Symbol>()
  const elaboratedSymbols = new Set<ts.Symbol>()
  const symbolToIdMap = new Map<ts.Symbol, string>()
  const symbols: { [id: string]: SymbolData } = {}
  let nextSymbolId = 1

  function getSymbolId(symbol: ts.Symbol): string {
    const existingId = symbolToIdMap.get(symbol)
    if (existingId) return existingId
    const name = symbol.getName()
    const id = `${nextSymbolId++}_${name}`
    symbolToIdMap.set(symbol, id)
    const symbolData: SymbolData = {
      name: name,
      flags: getSymbolFlags(symbol),
      documentationComment: symbol.getDocumentationComment(typeChecker),
      jsDocTags: symbol.getJsDocTags(),
    }
    symbols[id] = symbolData
    console.log('Reading', id, `[${symbolData.flags}]`)
    const declarations = symbol.getDeclarations()
    if (declarations) {
      symbolData.declarations = []
      for (const declaration of declarations) {
        symbolData.declarations.push(getDeclarationInfo(declaration))
      }
    }
    return id
  }

  type DeclarationInfo = {
    line: number
    character: number
    position: number
    fileName: string
    moduleSymbol?: string
  }
  function getDeclarationInfo(declaration: ts.Declaration) {
    if (!declaration) return
    const startPosition = declaration.getStart()
    const sourceFile = declaration.getSourceFile()
    const start = sourceFile.getLineAndCharacterOfPosition(startPosition)
    const declaredAt: DeclarationInfo = {
      line: start.line,
      character: start.character,
      position: startPosition,
      fileName: sourceFile.fileName,
    }
    const moduleSymbol = typeChecker.getSymbolAtLocation(sourceFile)
    if (moduleSymbol) {
      declaredAt.moduleSymbol = getSymbolId(moduleSymbol)
    }
    return declaredAt
  }

  function visitSymbol(symbol: ts.Symbol) {
    const id = getSymbolId(symbol)
    const symbolData = symbols[id]
    if (symbol.getFlags() & ts.SymbolFlags.Alias) {
      const aliasedSymbol = typeChecker.getAliasedSymbol(symbol)
      if (aliasedSymbol !== symbol) {
        symbolData.aliased = visitSymbol(aliasedSymbol)
      }
    }
    const exportedSymbol = typeChecker.getExportSymbolOfSymbol(symbol)
    if (exportedSymbol !== symbol) {
      symbolData.exported = visitSymbol(exportedSymbol)
    }
    markSymbolToBeElaborated(symbol)
    return id
  }

  function markSymbolToBeElaborated(symbol: ts.Symbol) {
    symbolsToElaborate.add(symbol)
  }

  function elaborateOnSymbol(symbol: ts.Symbol) {
    const id = getSymbolId(symbol)
    const symbolData = symbols[id]
    console.log('Elaborating', id)

    const declaredType = typeChecker.getDeclaredTypeOfSymbol(symbol)
    Object.assign(symbolData, {
      _declaredType: typeChecker.typeToString(declaredType),
    })

    const firstlyDeclared = symbol.getDeclarations()?.[0]
    const symbolType =
      firstlyDeclared &&
      typeChecker.getTypeOfSymbolAtLocation(symbol, firstlyDeclared)
    if (symbolType) {
      Object.assign(symbolData, {
        _symbolType: typeChecker.typeToString(symbolType, firstlyDeclared),
      })
    }

    const symbolFlags = symbol.getFlags()
    if (symbolFlags & ts.SymbolFlags.Module) {
      const exported = typeChecker.getExportsOfModule(symbol)
      symbolData.exports = []
      for (const exportSymbol of exported) {
        symbolData.exports.push(visitSymbol(exportSymbol))
      }
    }

    if (symbolFlags & ts.SymbolFlags.TypeAlias) {
      symbolData.type = getBriefTypeInfo(declaredType)
    }

    if (symbolFlags & ts.SymbolFlags.Variable && symbolType) {
      symbolData.type = getBriefTypeInfo(symbolType)
    }

    if (symbolFlags & ts.SymbolFlags.Function && symbolType) {
      symbolData.type = getBriefTypeInfo(symbolType)
    }

    if (symbolFlags & ts.SymbolFlags.Interface) {
      symbolData.type = getElaboratedTypeInfo(declaredType, symbol)
    }

    if (symbolFlags & ts.SymbolFlags.Class && symbolType) {
      symbolData.type = getElaboratedTypeInfo(declaredType, symbol)
      symbolData.static = getElaboratedTypeInfo(symbolType, symbol)
    }

    if (symbolFlags & ts.SymbolFlags.Method && symbolType) {
      symbolData.type = getBriefTypeInfo(symbolType)
    }
  }

  type TypeInfo = any
  function getBriefTypeInfo(type: ts.Type): TypeInfo {
    const callSignatures = typeChecker.getSignaturesOfType(
      type,
      ts.SignatureKind.Call,
    )
    const constructSignatures = typeChecker.getSignaturesOfType(
      type,
      ts.SignatureKind.Construct,
    )
    return {
      parts: typeToLinkedSymbolParts(typeChecker, type).map(x =>
        x.symbol ? [getSymbolId(x.symbol), x.text] : x.text,
      ),
      flags: getTypeFlags(type),
      callSignatures: callSignatures.map(getSignatureInfo),
      constructSignatures: constructSignatures.map(getSignatureInfo),
    }
  }

  function getElaboratedTypeInfo(
    type: ts.Type,
    parentSymbol: ts.Symbol,
  ): TypeInfo {
    const parentSymbolDeclarations = new Set<ts.Node>(
      parentSymbol.getDeclarations() || [],
    )
    const properties = typeChecker.getPropertiesOfType(type)
    return {
      ...getBriefTypeInfo(type),
      properties: properties.map(property => {
        const declaration = property.getDeclarations()?.[0]
        let inherited = true
        for (
          let node: ts.Node | undefined = declaration;
          node;
          node = node.parent
        ) {
          if (parentSymbolDeclarations.has(node)) {
            inherited = false
            break
          }
        }
        return {
          symbol: visitSymbol(property),
          inherited,
        }
      }),
    }
  }

  function getSignatureInfo(signature: ts.Signature) {
    return {
      declaration: getDeclarationInfo(signature.getDeclaration()),
      documentationComment: signature.getDocumentationComment(typeChecker),
      jsDocTags: signature.getJsDocTags(),
      parameters: signature.getParameters().map(visitSymbol),
      returnType: getBriefTypeInfo(signature.getReturnType()),
      // TODO: getTypeParameters
    }
  }

  function getSymbolFlags(symbol: ts.Symbol): string[] {
    const flags = symbol.getFlags()
    const out: string[] = []
    for (const [key, value] of Object.entries(ts.SymbolFlags)) {
      if (
        typeof value === 'number' &&
        value.toString(2).match(/^10*$/) &&
        !key.match(/Excludes/) &&
        flags & value
      ) {
        out.push(key)
      }
    }
    return out
  }

  function getTypeFlags(type: ts.Type): string[] {
    const flags = type.getFlags()
    const out: string[] = []
    for (const [key, value] of Object.entries(ts.TypeFlags)) {
      if (
        typeof value === 'number' &&
        value.toString(2).match(/^10*$/) &&
        flags & value
      ) {
        out.push(key)
      }
    }
    return out
  }

  main()

  // for (const file of sourceFiles) {
  //   if (!file) continue
  //   const moduleSymbol = typeChecker.getSymbolAtLocation(file)
  //   if (!moduleSymbol) continue
  //   readModule(moduleSymbol)
  // }
  // if (!walker.getState().publicModules.length) {
  //   for (const ambientModule of typeChecker.getAmbientModules()) {
  //     readModule(ambientModule)
  //   }
  // }

  return {
    // documentation: walker.getState(),
    documentation: { symbols } as any,
    program,
    checker: typeChecker,
  }
}

/**
 * The result of calling `generateDocs()`.
 */
export interface GenerateDocsResult {
  /**
   * The documentation data.
   */
  documentation: DataModel.Documentation
  /**
   * The `ts.Program` instance created from generating the documentation.
   */
  program: ts.Program
  /**
   * The `ts.TypeChecker` for the `program`.
   */
  checker: ts.TypeChecker
}
