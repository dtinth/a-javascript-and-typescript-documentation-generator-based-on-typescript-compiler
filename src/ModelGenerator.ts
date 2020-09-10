import * as fs from 'fs'
import * as path from 'path'
import ts from 'typescript'
import { createProject } from '@ts-morph/bootstrap'
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

type ヤバい = any

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
export async function generateDocs(
  rootFileNames: string[],
  generateOptions: GenerateOptions = {},
): Promise<GenerateDocsResult> {
  rootFileNames = rootFileNames.map((n) => fs.realpathSync(n))
  const basePath = require('commondir')(
    rootFileNames.map((f) => path.dirname(f)),
  )

  const { options } = ts.convertCompilerOptionsFromJson(
    { allowJs: true },
    basePath,
  )
  const project = await createProject({
    compilerOptions: options,
  })
  const entrySourceFiles = await project.addSourceFilesByPaths(rootFileNames)
  // const referenceSourceFile = project.createSourceFile(
  //   basePath + '/doc-gen-root',
  //   'export {}',
  // )
  project.resolveSourceFileDependencies()

  const program = project.createProgram()
  const checker = program.getTypeChecker()
  // const host = (project as ヤバい).languageServiceHost

  if (generateOptions.debug) {
    debugger
  }

  enum DocPageKind {
    Root = 'root',
    Module = 'module',
    Namespace = 'namespace',
    Class = 'class',
    Function = 'function',
    Interface = 'interface',
  }

  class DocPage {
    constructor(
      public kind: DocPageKind,
      public parent: DocEntry<any> | null,
      public name: string,
    ) {}

    subpages: DocPage[] = []
    modules = new DocSection(this, 'Modules')
    globals = new DocSection<null>(this, 'Globals')
    namespaces = new DocSection(this, 'Namespaces')
    classes = new DocSection(this, 'Classes')
    enumerations = new DocSection(this, 'Enumerations')
    types = new DocSection(this, 'Interfaces and Types')
    callSignatures = new DocSection(this, 'Call Signatures')
    constructors = new DocSection(this, 'Constructors')
    instanceCallSignatures = new DocSection(this, 'Instance Call Signatures')
    instanceConstructors = new DocSection(this, 'Instance Constructors')
    instanceProperties = new DocSection(this, 'Instance Properties')
    properties = new DocSection(
      this,
      this.kind === DocPageKind.Class ? 'Static Members' : 'Members',
    )

    getBreadcrumb(): string {
      return (
        (this.parent && this.parent.section.page.kind !== DocPageKind.Root
          ? `${this.parent.section.page.getBreadcrumb()} > `
          : '') + this.name
      )
    }
  }

  class DocSection<T = ts.Symbol> {
    constructor(public page: DocPage, public title: string) {}
    entries: DocEntry<T>[] = []
    addEntry(name: string, target: T) {
      const entry: DocEntry<T> = new DocEntry(this, name, target)
      this.entries.push(entry)
      console.log(`     Adding ${entry}`)
      return entry
    }
  }

  class DocEntry<T> {
    constructor(
      public section: DocSection<T>,
      public name: string,
      public target: T,
    ) {}
    toString() {
      let prefix = ''
      if (this.section.page.parent) {
        prefix = this.section.page.parent.toString() + ' » '
      }
      return prefix + this.section.title + ' » ' + this.name
    }
  }

  function main() {
    const sourceFilesSet = new Set(entrySourceFiles)

    const root = new DocPage(DocPageKind.Root, null, '(root)')
    const elaborationQueue = new Set<DocEntry<ts.Symbol>>()
    const symbolPageMap = new Map<ts.Symbol, DocPage>()
    const typeEntryMap = new Map<ts.Type, DocEntry<ts.Symbol>>()
    const classificationCache = new Map<ts.Symbol, ClassificationResult>()

    const enqueue = (entry: DocEntry<ts.Symbol>) => {
      elaborationQueue.add(entry)
    }

    function getTargetSymbol(symbol: ts.Symbol) {
      symbol = skipAlias(symbol)
      return resolveExternalModuleSymbol(symbol) || symbol
    }

    // Enqueue modules that are source files.
    for (const sourceFile of entrySourceFiles) {
      if (!sourceFile) continue
      const moduleSymbol = checker.getSymbolAtLocation(sourceFile)
      if (!moduleSymbol) continue
      enqueue(root.modules.addEntry(getSymbolName(moduleSymbol), moduleSymbol))
    }

    // Enqueue ambient modules declared inside the entry source files
    for (const moduleSymbol of checker.getAmbientModules()) {
      if (isDeclaredInsideEntryFile(moduleSymbol)) {
        enqueue(
          root.modules.addEntry(getSymbolName(moduleSymbol), moduleSymbol),
        )
      }
    }

    // Enqueue global symbols declared inside the entry source files
    const globalThisSymbol = (checker as any).resolveName(
      'globalThis',
      /*location*/ undefined,
      ts.SymbolFlags.Value,
      /*excludeGlobals*/ false,
    )
    let globalNamespacePage: DocPage | null = null
    for (const globalSymbol of checker.getExportsOfModule(globalThisSymbol)) {
      if (isDeclaredInsideEntryFile(globalSymbol)) {
        const classification = classifySymbol(globalSymbol)
        if (!globalNamespacePage) {
          const entry = root.globals.addEntry('(globals)', null)
          globalNamespacePage = new DocPage(
            DocPageKind.Namespace,
            entry,
            '(globals)',
          )
        }
        classification.addToPage?.(globalNamespacePage, globalSymbol)
      }
    }

    for (const entry of elaborationQueue) {
      processEntry(entry)
    }

    function isDeclaredInsideEntryFile(symbol: ts.Symbol) {
      return (
        !!symbol.declarations &&
        symbol.declarations.some((d) => sourceFilesSet.has(d.getSourceFile()))
      )
    }

    type ClassificationResult = {
      description: string
      newPageOptions?: { kind: DocPageKind; name: string }
      addToPage?: (page: DocPage, sourceSymbol: ts.Symbol) => void
      populatePage?: (page: DocPage) => void
    }

    function classifySymbol(symbol: ts.Symbol): ClassificationResult {
      symbol = getTargetSymbol(symbol)
      let classification = classificationCache.get(symbol)
      if (!classification) {
        classification = doClassifySymbol(symbol)
        classificationCache.set(symbol, classification)
      }
      return classification
    }

    function doClassifySymbol(symbol: ts.Symbol): ClassificationResult {
      const declaration = symbol.declarations?.[0]
      if (!declaration) {
        return { description: 'Unclassified' }
      }

      // Pure type...
      if (!symbol.valueDeclaration) {
        const type = checker.getTypeAtLocation(declaration)
        if (
          type.flags & ts.TypeFlags.Object &&
          type.getProperties().length + type.getCallSignatures().length > 0
        ) {
          return {
            description: 'Interface',
            addToPage: (page, originSymbol) => {
              enqueue(page.types.addEntry(getSymbolName(originSymbol), symbol))
            },
            newPageOptions: createPageOptions(DocPageKind.Interface),
            populatePage: populateInterfacePage,
          }
        } else {
          return {
            description: 'Type Alias',
            addToPage: (page, originSymbol) => {
              page.types.addEntry(getSymbolName(originSymbol), symbol)
            },
          }
        }
      }

      const type = checker.getTypeOfSymbolAtLocation(symbol, declaration)

      // If an object with this exact type has been seen before...
      // redirect it!
      let previouslyDocumentedEntry = typeEntryMap.get(type)
      if (previouslyDocumentedEntry) {
        const targetSymbol = previouslyDocumentedEntry.target
        const classification = classifySymbol(targetSymbol)
        return {
          description: classification.description,
          addToPage: (page, originSymbol) => {
            page.properties.addEntry(getSymbolName(originSymbol), targetSymbol)
          },
          // Do not populate new pages
        }
      }

      const typeIsObject = type.flags & ts.TypeFlags.Object
      // console.log(getSymbolName(symbol), checker.typeToString(type), getType)
      const properties = type.getProperties()
      const exportedSymbols = checker.getExportsOfModule(symbol)
      const callSignatures = type.getCallSignatures()
      const constructSignatures = type.getConstructSignatures()

      if (
        typeIsObject &&
        constructSignatures.length +
          exportedSymbols.length +
          properties.length >
          0
      ) {
        const constructable = constructSignatures.length > 0
        const callable = callSignatures.length > 0
        return {
          description: constructable
            ? 'Class'
            : callable
            ? 'Function'
            : 'Namespace',
          newPageOptions: createPageOptions(
            constructable
              ? DocPageKind.Class
              : callable
              ? DocPageKind.Function
              : DocPageKind.Namespace,
          ),
          populatePage: populateValuePage,
          addToPage: (page, originSymbol) => {
            const category = constructable
              ? page.classes
              : callable
              ? page.properties
              : page.namespaces
            const entry = category.addEntry(getSymbolName(originSymbol), symbol)
            typeEntryMap.set(type, entry)

            const instanceType =
              constructable && checker.getTypeAtLocation(declaration)
            if (instanceType && instanceType !== type) {
              typeEntryMap.set(instanceType, entry)
            }

            const prototypeSymbol =
              constructable && type.getProperty('prototype')
            const prototypeType =
              prototypeSymbol &&
              checker.getTypeOfSymbolAtLocation(prototypeSymbol, declaration)
            if (prototypeType && prototypeType !== type) {
              typeEntryMap.set(prototypeType, entry)
            }

            enqueue(entry)
          },
        }
      } else if (typeIsObject && callSignatures.length > 0) {
        return {
          description: 'Function',
          addToPage: (page, originSymbol) => {
            page.properties.addEntry(getSymbolName(originSymbol), symbol)
          },
        }
      } else {
        return {
          description: 'Member',
          addToPage: (page, originSymbol) => {
            page.properties.addEntry(getSymbolName(originSymbol), symbol)
          },
        }
      }

      function createPageOptions(kind: DocPageKind) {
        return { kind, name: getSymbolName(symbol) }
      }

      function populateValuePage(page: DocPage) {
        const members = new Set([...properties, ...exportedSymbols])
        for (const member of members) {
          const memberClassification = classifySymbol(member)
          memberClassification.addToPage?.(page, member)
        }
        populateInterfacePage(page)
      }

      function populateInterfacePage(page: DocPage) {
        const instanceType =
          declaration.parent && checker.getTypeAtLocation(declaration)
        if (!instanceType) {
          return
        }
        if (instanceType.isClassOrInterface()) {
          const properties = instanceType.getProperties()
          for (const property of properties) {
            page.instanceProperties.addEntry(getSymbolName(property), property)
          }
        } else if (!symbol.valueDeclaration) {
          const members: ts.Symbol[] = [
            ...(symbol.members?.values() || ([] as any)),
          ]
          for (const member of members) {
            page.instanceProperties.addEntry(getSymbolName(member), member)
          }
        }
      }
    }

    function processEntry(entry: DocEntry<ts.Symbol>) {
      const symbol = getTargetSymbol(entry.target)
      const classification = classifySymbol(symbol)
      console.log(
        `Elaborating ${entry}:`,
        `${getSymbolName(symbol)} [${getSymbolFlags(symbol)} -> ${
          classification.description
        }]`,
      )

      if (!classification.newPageOptions) {
        return
      }

      const { kind, name } = classification.newPageOptions
      let page = symbolPageMap.get(symbol)
      if (!page) {
        page = new DocPage(kind, entry, name)
        symbolPageMap.set(symbol, page)
        classification.populatePage?.(page)
      }

      // const symbolFlags = symbol.getFlags()
      // for (const exportedSymbol of checker.getExportsOfModule(symbol)) {
      //   if (exportedSymbol.declarations?.length) {
      //     processNamespaceExport(
      //       getOrCreatePageForSymbol(symbol, entry, DocPageKind.Namespace),
      //       exportedSymbol,
      //     )
      //   }
      // }

      // checker.resolve
      // for (const exportedSymbol of checker.getExportsOfModule(symbol)) {
      //   // enqueue(exportedSymbol, docNode)
      // }
      // const members: ts.Symbol[] = [
      //   ...(symbol.members?.values() || ([] as any)),
      // ]
      // for (const memberSymbol of members) {
      //   console.log(`   -> Member ${memberSymbol.getName()}`)
      // }

      // const declaration = symbol.declarations?.[0]
      // if (!declaration) {
      //   console.log(`  -> No declaration, skipping...`)
      // }

      // const type =
      //   declaration.parent && !(symbolFlags & ts.SymbolFlags.Class)
      //     ? checker.getTypeAtLocation(declaration)
      //     : checker.getTypeOfSymbolAtLocation(symbol, declaration)
      // console.log(`   -> Type is ${checker.typeToString(type)}`)

      // const constructSignatures = type.getConstructSignatures()
      // const callSignatures = type.getCallSignatures()
      // const properties = type.getProperties()
      // for (const property of properties) {
      //   if (withInternals(property).parent === symbol) {
      //     enqueue(property, docNode)
      //   }
      // }
    }
  }

  function skipAlias(symbol: ts.Symbol) {
    return symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol
  }

  // function getSymbolId(symbol: ts.Symbol): string {
  //   if (symbol.getFlags() & ts.SymbolFlags.Alias) {
  //     const aliasedSymbol = typeChecker.getAliasedSymbol(symbol)
  //     return getSymbolId(aliasedSymbol)
  //   }
  //   const existingId = symbolToIdMap.get(symbol)
  //   if (existingId) return existingId
  //   const name = symbol.getName()
  //   const id = `${nextSymbolId++}_${name}`
  //   symbolToIdMap.set(symbol, id)
  //   const symbolData: SymbolData = {
  //     id,
  //     name: name,
  //     flags: getSymbolFlags(symbol),
  //     documentationComment: symbol.getDocumentationComment(typeChecker),
  //     jsDocTags: symbol.getJsDocTags(),
  //   }
  //   symbolDataById[id] = symbolData
  //   console.log('Reading', id, `[${symbolData.flags}]`)
  //   const declarations = symbol.getDeclarations()
  //   if (declarations) {
  //     symbolData.declarations = []
  //     for (const declaration of declarations) {
  //       const info = getDeclarationInfo(declaration)
  //       if (info) symbolData.declarations.push(info)
  //     }
  //   }
  //   return id
  // }
  // function getDeclarationInfo(declaration: ts.Declaration) {
  //   if (!declaration) return
  //   const startPosition = declaration.getStart()
  //   const sourceFile = declaration.getSourceFile()
  //   const start = sourceFile.getLineAndCharacterOfPosition(startPosition)
  //   const declaredAt: DeclarationInfo = {
  //     line: start.line,
  //     character: start.character,
  //     position: startPosition,
  //     sourceFile: getSourceFileId(sourceFile),
  //   }
  //   return declaredAt
  // }

  // function visitSymbol(symbol: ts.Symbol): string {
  //   if (symbol.getFlags() & ts.SymbolFlags.Alias) {
  //     const aliasedSymbol = typeChecker.getAliasedSymbol(symbol)
  //     return visitSymbol(aliasedSymbol)
  //   }
  //   const id = getSymbolId(symbol)
  //   symbolsToElaborate.add(symbol)
  //   return id
  // }

  // function elaborateOnSymbol(symbol: ts.Symbol) {
  //   const id = getSymbolId(symbol)
  //   const symbolData = symbolDataById[id]
  //   console.log('Elaborating', id)

  //   const declaredType = typeChecker.getDeclaredTypeOfSymbol(symbol)
  //   Object.assign(symbolData, {
  //     _declaredType: typeChecker.typeToString(declaredType),
  //   })

  //   const firstlyDeclared = symbol.getDeclarations()?.[0]
  //   const symbolType =
  //     firstlyDeclared &&
  //     typeChecker.getTypeOfSymbolAtLocation(symbol, firstlyDeclared)
  //   if (symbolType) {
  //     Object.assign(symbolData, {
  //       _symbolType: typeChecker.typeToString(symbolType, firstlyDeclared),
  //     })
  //   }

  //   const symbolFlags = symbol.getFlags()
  //   if (symbolFlags & ts.SymbolFlags.Module) {
  //     const exported = typeChecker.getExportsOfModule(symbol)
  //     symbolData.exports = exported.map(visitNamedSymbol)
  //   }

  //   if (symbolFlags & ts.SymbolFlags.TypeAlias) {
  //     const declarationType =
  //       firstlyDeclared &&
  //       ts.isTypeAliasDeclaration(firstlyDeclared) &&
  //       firstlyDeclared.type
  //     symbolData.type =
  //       declarationType && ts.isTypeLiteralNode(declarationType)
  //         ? getElaboratedTypeInfo(declaredType, symbol)
  //         : getBriefTypeInfo(declaredType)
  //   }

  //   if (symbolFlags & ts.SymbolFlags.Variable && symbolType) {
  //     symbolData.type = getBriefTypeInfo(symbolType)
  //   }

  //   if (symbolFlags & ts.SymbolFlags.Function && symbolType) {
  //     symbolData.type = getBriefTypeInfo(symbolType)
  //   }

  //   if (symbolFlags & ts.SymbolFlags.Interface) {
  //     symbolData.type = getElaboratedTypeInfo(declaredType, symbol)
  //   }

  //   if (symbolFlags & ts.SymbolFlags.Class && symbolType) {
  //     symbolData.type = getElaboratedTypeInfo(declaredType, symbol)
  //     symbolData.static = getElaboratedTypeInfo(symbolType, symbol)
  //   }

  //   if (symbolFlags & ts.SymbolFlags.Method && symbolType) {
  //     symbolData.type = getBriefTypeInfo(symbolType)
  //   }
  // }

  // function getBriefTypeInfo(type: ts.Type): TypeInfo {
  //   return {
  //     parts: protectFromFailure(
  //       () =>
  //         typeToLinkedSymbolParts(typeChecker, type).map((x) =>
  //           x.symbol ? [getSymbolId(x.symbol), x.text] : x.text,
  //         ),
  //       (e) => [`Failed to generate parts: ${e}`],
  //     ),
  //     flags: getTypeFlags(type),
  //   }
  // }

  // function protectFromFailure<T>(f: () => T, fallback: (e: Error) => T) {
  //   try {
  //     return f()
  //   } catch (e) {
  //     return fallback(e)
  //   }
  // }

  // function getElaboratedTypeInfo(
  //   type: ts.Type,
  //   parentSymbol: ts.Symbol,
  // ): TypeInfo {
  //   const parentSymbolDeclarations = new Set<ts.Node>(
  //     parentSymbol.getDeclarations() || [],
  //   )
  //   const properties = typeChecker.getPropertiesOfType(type)
  //   const callSignatures = typeChecker.getSignaturesOfType(
  //     type,
  //     ts.SignatureKind.Call,
  //   )
  //   const constructSignatures = typeChecker.getSignaturesOfType(
  //     type,
  //     ts.SignatureKind.Construct,
  //   )
  //   return {
  //     ...getBriefTypeInfo(type),
  //     callSignatures: callSignatures.map(getSignatureInfo),
  //     constructSignatures: constructSignatures.map(getSignatureInfo),
  //     properties: properties.map((property) => {
  //       const declaration = property.getDeclarations()?.[0]
  //       let inherited = true
  //       for (
  //         let node: ts.Node | undefined = declaration;
  //         node;
  //         node = node.parent
  //       ) {
  //         if (parentSymbolDeclarations.has(node)) {
  //           inherited = false
  //           break
  //         }
  //       }
  //       return {
  //         name: property.getName(),
  //         symbol: visitSymbol(property),
  //         inherited,
  //       }
  //     }),
  //   }
  // }

  // function getSignatureInfo(signature: ts.Signature): SignatureInfo {
  //   return {
  //     declaration: getDeclarationInfo(signature.getDeclaration()),
  //     documentationComment: signature.getDocumentationComment(typeChecker),
  //     jsDocTags: signature.getJsDocTags(),
  //     parameters: signature.getParameters().map(visitNamedSymbol),
  //     returnType: getBriefTypeInfo(signature.getReturnType()),
  //     // TODO: getTypeParameters
  //   }
  // }
  // function visitNamedSymbol(symbol: ts.Symbol): NamedSymbolInfo {
  //   return { name: symbol.getName(), symbol: visitSymbol(symbol) }
  // }

  // function getTypeFlags(type: ts.Type): string[] {
  //   const flags = type.getFlags()
  //   const out: string[] = []
  //   for (const [key, value] of Object.entries(ts.TypeFlags)) {
  //     if (
  //       typeof value === 'number' &&
  //       value.toString(2).match(/^10*$/) &&
  //       flags & value
  //     ) {
  //       out.push(key)
  //     }
  //   }
  //   return out
  // }

  // main()
  // console.log(
  //   `Symbol stats: ` +
  //     `${program.getSymbolCount()} total, ` +
  //     `${Object.keys(symbolDataById).length} read, ` +
  //     `${elaboratedSymbols.size} elaborated`,
  // )
  function resolveExternalModuleSymbol(symbol: ts.Symbol): ts.Symbol {
    return (checker as ヤバい).resolveExternalModuleSymbol(symbol)
  }

  function getSymbolName(symbol: ts.Symbol): string {
    const symbolName = symbol.getName()
    const declaration = symbol.declarations?.[0]
    if (
      symbolName.startsWith('"') &&
      symbolName.endsWith('"') &&
      ts.isSourceFile(declaration)
    ) {
      const relativePath: string = require('path').relative(
        process.cwd(),
        declaration.fileName,
      )
      return relativePath
        .replace(/(?:\.d)?\.[tj]sx?$/, '')
        .replace(/\/index$/, '')
    }
    return symbol.getName()
  }

  main()

  return {
    model: {
      // entryModules: entryModuleSymbolIds,
      // entrySourceFiles: entrySourceFileIds,
      // symbols: Object.values(symbolDataById),
      // sourceFiles: Object.values(sourceFileDataById),
    },
    program,
    checker: checker,
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

function getSymbolParent(symbol: ts.Symbol): ts.Symbol | undefined {
  return (symbol as ヤバい).parent
}
