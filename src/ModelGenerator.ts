import * as fs from 'fs'
import * as path from 'path'
import ts from 'typescript'
// import { createWalker } from './ProgramWalker'
import { Project } from '@ts-morph/bootstrap'
import { typeToLinkedSymbolParts } from './LinkedSymbolPartsWriter'
import {
  Model,
  SymbolData,
  DeclarationInfo,
  TypeInfo,
  SignatureInfo,
  NamedSymbolInfo,
  SourceFileData,
} from './Model'

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
  const entrySourceFiles = project.addSourceFilesByPaths(rootFileNames)
  const program = project.createProgram()
  const typeChecker = program.getTypeChecker()
  const languageService = project.getLanguageService()

  if (generateOptions.debug) {
    void languageService
    debugger
  }

  const entryModuleSymbolIds: string[] = []
  const entrySourceFileIds: string[] = []

  function main() {
    const sourceFilesSet = new Set(entrySourceFiles)
    for (const file of entrySourceFiles) {
      if (!file) continue
      entrySourceFileIds.push(getSourceFileId(file))
      const moduleSymbol = typeChecker.getSymbolAtLocation(file)
      if (!moduleSymbol) continue
      entryModuleSymbolIds.push(visitSymbol(moduleSymbol))
    }
    if (!entryModuleSymbolIds.length) {
      for (const ambientModule of typeChecker.getAmbientModules()) {
        if (
          ambientModule
            .getDeclarations()
            ?.some(d => sourceFilesSet.has(d.getSourceFile()))
        ) {
          entryModuleSymbolIds.push(visitSymbol(ambientModule))
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
  const symbolDataById: { [id: string]: SymbolData } = {}
  let nextSymbolId = 1

  const sourceFileToIdMap = new Map<ts.SourceFile, string>()
  const sourceFileDataById: { [id: string]: SourceFileData } = {}
  let nextSourceFileId = 1

  function getSourceFileId(sourceFile: ts.SourceFile): string {
    const existingId = sourceFileToIdMap.get(sourceFile)
    if (existingId) return existingId
    const id = `${nextSourceFileId++}`
    sourceFileToIdMap.set(sourceFile, id)
    const sourceFileData: SourceFileData = {
      id,
      fileName: sourceFile.fileName,
    }
    sourceFileDataById[id] = sourceFileData
    return id
  }

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
    symbolDataById[id] = symbolData
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
      sourceFile: getSourceFileId(sourceFile),
    }
    return declaredAt
  }

  function visitSymbol(symbol: ts.Symbol): string {
    if (symbol.getFlags() & ts.SymbolFlags.Alias) {
      const aliasedSymbol = typeChecker.getAliasedSymbol(symbol)
      return visitSymbol(aliasedSymbol)
    }
    const id = getSymbolId(symbol)
    symbolsToElaborate.add(symbol)
    return id
  }

  function elaborateOnSymbol(symbol: ts.Symbol) {
    const id = getSymbolId(symbol)
    const symbolData = symbolDataById[id]
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
    return {
      parts: protectFromFailure(
        () =>
          typeToLinkedSymbolParts(typeChecker, type).map(x =>
            x.symbol ? [getSymbolId(x.symbol), x.text] : x.text,
          ),
        e => [`Failed to generate parts: ${e}`],
      ),
      flags: getTypeFlags(type),
    }
  }

  function protectFromFailure<T>(f: () => T, fallback: (e: Error) => T) {
    try {
      return f()
    } catch (e) {
      return fallback(e)
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
    const callSignatures = typeChecker.getSignaturesOfType(
      type,
      ts.SignatureKind.Call,
    )
    const constructSignatures = typeChecker.getSignaturesOfType(
      type,
      ts.SignatureKind.Construct,
    )
    return {
      ...getBriefTypeInfo(type),
      callSignatures: callSignatures.map(getSignatureInfo),
      constructSignatures: constructSignatures.map(getSignatureInfo),
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
  console.log(
    `Symbol stats: ` +
      `${program.getSymbolCount()} total, ` +
      `${Object.keys(symbolDataById).length} read, ` +
      `${elaboratedSymbols.size} elaborated`,
  )

  return {
    model: {
      entryModules: entryModuleSymbolIds,
      entrySourceFiles: entrySourceFileIds,
      symbols: Object.values(symbolDataById),
      sourceFiles: Object.values(sourceFileDataById),
    },
    program,
    checker: typeChecker,
  }
}
