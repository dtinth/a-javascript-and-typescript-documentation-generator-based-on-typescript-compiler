import * as fs from 'fs'
import * as path from 'path'
import ts from 'typescript'
// import { createWalker } from './ProgramWalker'
import { Project } from '@ts-morph/bootstrap'
import { typeToLinkedSymbolParts } from './LinkedSymbolPartsWriter'

export type GenerateOptions = {
  debug?: boolean
}

/**
 * The result of calling `generateDocs()`.
 */
export interface GenerateDocsResult {
  /**
   * The documentation data.
   */
  model: Model
  /**
   * The `ts.Program` instance created from generating the documentation.
   */
  program: ts.Program
  /**
   * The `ts.TypeChecker` for the `program`.
   */
  checker: ts.TypeChecker
}

export type TypeLinkPart = string | [string, string]

export type TypeInfo = {
  parts: TypeLinkPart[]
  flags: string[]
  callSignatures: SignatureInfo[]
  constructSignatures: SignatureInfo[]
  properties?: PropertyInfo[]
}

export type PropertyInfo = { name: string; symbol: string; inherited: boolean }

export type SignatureInfo = {
  declaration?: DeclarationInfo
  documentationComment: ts.SymbolDisplayPart[]
  jsDocTags: ts.JSDocTagInfo[]
  parameters: NamedSymbolInfo[]
  returnType: TypeInfo
}

export type SymbolData = {
  id: string
  name: string
  flags: string[]
  documentationComment: ts.SymbolDisplayPart[]
  jsDocTags: ts.JSDocTagInfo[]
  exports?: NamedSymbolInfo[]
  exported?: string
  declarations?: DeclarationInfo[]
  type?: TypeInfo
  static?: TypeInfo
}

export type DeclarationInfo = {
  line: number
  character: number
  position: number
  fileName: string
  moduleSymbol?: string
}

export type NamedSymbolInfo = {
  name: string
  symbol: string
}

export interface Model {
  entryModules: string[]
  symbols: SymbolData[]
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

  if (generateOptions.debug) {
    void languageService
    debugger
  }

  const entryModules: string[] = []

  function main() {
    const sourceFilesSet = new Set(sourceFiles)
    for (const file of sourceFiles) {
      if (!file) continue
      const moduleSymbol = typeChecker.getSymbolAtLocation(file)
      if (!moduleSymbol) continue
      entryModules.push(visitSymbol(moduleSymbol))
    }
    if (!entryModules.length) {
      for (const ambientModule of typeChecker.getAmbientModules()) {
        if (
          ambientModule
            .getDeclarations()
            ?.some(d => sourceFilesSet.has(d.getSourceFile()))
        ) {
          // entryModules.push(visitSymbol(ambientModule))
        }
      }
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

  let symbolsToElaborate = new Set<ts.Symbol>()
  const elaboratedSymbols = new Set<ts.Symbol>()
  const symbolToIdMap = new Map<ts.Symbol, string>()
  const symbols: { [id: string]: SymbolData } = {}
  let nextSymbolId = 1

  function getSymbolId(symbol: ts.Symbol): string {
    if (symbol.getFlags() & ts.SymbolFlags.Alias) {
      const aliasedSymbol = typeChecker.getAliasedSymbol(symbol)
      return getSymbolId(aliasedSymbol)
    }
    const existingId = symbolToIdMap.get(symbol)
    if (existingId) return existingId
    const name = symbol.getName()
    const id = `${nextSymbolId++}_${name}`
    symbolToIdMap.set(symbol, id)
    const symbolData: SymbolData = {
      id,
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
        const info = getDeclarationInfo(declaration)
        if (info) symbolData.declarations.push(info)
      }
    }
    return id
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

  function visitSymbol(symbol: ts.Symbol): string {
    if (symbol.getFlags() & ts.SymbolFlags.Alias) {
      const aliasedSymbol = typeChecker.getAliasedSymbol(symbol)
      return visitSymbol(aliasedSymbol)
    }
    const id = getSymbolId(symbol)
    const symbolData = symbols[id]
    const exportedSymbol = typeChecker.getExportSymbolOfSymbol(symbol)
    if (exportedSymbol !== symbol) {
      symbolData.exported = visitSymbol(exportedSymbol)
    }
    symbolsToElaborate.add(symbol)
    return id
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
      symbolData.exports = exported.map(visitNamedSymbol)
    }

    if (symbolFlags & ts.SymbolFlags.TypeAlias) {
      const declarationType =
        firstlyDeclared &&
        ts.isTypeAliasDeclaration(firstlyDeclared) &&
        firstlyDeclared.type
      symbolData.type =
        declarationType && ts.isTypeLiteralNode(declarationType)
          ? getElaboratedTypeInfo(declaredType, symbol)
          : getBriefTypeInfo(declaredType)
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
          name: property.getName(),
          symbol: visitSymbol(property),
          inherited,
        }
      }),
    }
  }

  function getSignatureInfo(signature: ts.Signature): SignatureInfo {
    return {
      declaration: getDeclarationInfo(signature.getDeclaration()),
      documentationComment: signature.getDocumentationComment(typeChecker),
      jsDocTags: signature.getJsDocTags(),
      parameters: signature.getParameters().map(visitNamedSymbol),
      returnType: getBriefTypeInfo(signature.getReturnType()),
      // TODO: getTypeParameters
    }
  }
  function visitNamedSymbol(symbol: ts.Symbol): NamedSymbolInfo {
    return { name: symbol.getName(), symbol: visitSymbol(symbol) }
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

  return {
    model: {
      entryModules,
      symbols: Object.values(symbols),
    },
    program,
    checker: typeChecker,
  }
}
