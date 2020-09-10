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
  const generatedAt = new Date().toJSON()

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
  const classifier = createClassifier()
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
    ) {
      if (parent) {
        parent.section.page.subpages.push(this)
      }
    }

    subpages: DocPage[] = []
    sections: DocSection<any>[] = []
    modules = this.addSection('Modules')
    globals = this.addSection<DocPage | null>('Globals')
    namespaces = this.addSection('Namespaces')
    classes = this.addSection('Classes')
    enumerations = this.addSection('Enumerations')
    types = this.addSection('Interfaces and Types')
    callSignatures = this.addSection('Call Signatures')
    constructors = this.addSection('Constructors')
    properties = this.addSection(
      this.kind === DocPageKind.Class ? 'Static Members' : 'Members',
    )
    instanceCallSignatures = this.addSection('Instance Call Signatures')
    instanceConstructors = this.addSection('Instance Constructors')
    instanceProperties = this.addSection('Instance Properties')

    private addSection<T = ts.Symbol>(title: string): DocSection<T> {
      const section = new DocSection<T>(this, title)
      this.sections.push(section)
      return section
    }

    getBreadcrumb(): string {
      return (
        (this.parent && this.parent.section.page.kind !== DocPageKind.Root
          ? `${this.parent.section.page.getBreadcrumb()} > `
          : '') + this.name
      )
    }
  }

  class DocSection<T> {
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

    const enqueue = (entry: DocEntry<ts.Symbol>) => {
      elaborationQueue.add(entry)
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
        const classification = classifier.classifySymbol(globalSymbol)
        if (!globalNamespacePage) {
          const entry = root.globals.addEntry('(globals)', globalNamespacePage)
          globalNamespacePage = new DocPage(
            DocPageKind.Namespace,
            entry,
            '(globals)',
          )
          entry.target = globalNamespacePage
        }
        classification.addToPage?.(globalNamespacePage, globalSymbol, enqueue)
      }
    }

    for (const entry of elaborationQueue) {
      processEntry(entry)
    }

    return { root, symbolPageMap }

    function isDeclaredInsideEntryFile(symbol: ts.Symbol) {
      return (
        !!symbol.declarations &&
        symbol.declarations.some((d) => sourceFilesSet.has(d.getSourceFile()))
      )
    }

    function processEntry(entry: DocEntry<ts.Symbol>) {
      const symbol = getTargetSymbol(entry.target)
      const classification = classifier.classifySymbol(symbol)
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
        classification.populatePage?.(page, enqueue)
      }
    }
  }

  function serialize(
    root: DocPage,
    symbolPageMap: Map<ts.Symbol, DocPage>,
  ): Model {
    const pageList = new PageList(root)
    const serializedPages = pageList.pages.map(serializePage)

    return {
      metadata: {
        generator: require('../package').name,
        generatorVersion: require('../package').version,
        generatedAt: generatedAt,
      },
      pages: serializedPages,
      // entryModules: entryModuleSymbolIds,
      // entrySourceFiles: entrySourceFileIds,
      // symbols: Object.values(symbolDataById),
      // sourceFiles: Object.values(sourceFileDataById),
    }

    function serializePage(page: DocPage) {
      return {
        name: page.name,
        kind: page.kind,
        subpages: page.subpages.map((p) => pageList.getPageId(p)),
        sections: page.sections
          .filter((s) => s.entries.length > 0)
          .map((section) => {
            return {
              title: section.title,
            }
          }),
      }
    }
  }

  class PageList {
    pages: DocPage[] = []
    pageToPageIdMap = new Map<DocPage, number>()

    constructor(root: DocPage) {
      const visit = (page: DocPage) => {
        this.pageToPageIdMap.set(page, this.pages.length)
        this.pages.push(page)
        page.subpages.forEach(visit)
      }
      visit(root)
    }

    getPageId(page: DocPage) {
      const pageId = this.pageToPageIdMap.get(page)
      if (pageId == null) {
        throw new Error(`Unrecognized page: ${page.name}`)
      }
      return pageId
    }
  }

  type ClassificationResult = {
    description: string
    newPageOptions?: { kind: DocPageKind; name: string }
    addToPage?: (
      page: DocPage,
      sourceSymbol: ts.Symbol,
      enqueuePage: EnqueueFn,
    ) => void
    populatePage?: (page: DocPage, enqueuePage: EnqueueFn) => void
  }

  type EnqueueFn = (entry: DocEntry<ts.Symbol>) => void

  function createClassifier() {
    const typeEntryMap = new Map<ts.Type, DocEntry<ts.Symbol>>()
    const classificationCache = new Map<ts.Symbol, ClassificationResult>()
    return {
      classifySymbol,
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
            addToPage: (page, originSymbol, enqueue) => {
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
          addToPage: (page, originSymbol, enqueue) => {
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

      function populateValuePage(page: DocPage, enqueue: EnqueueFn) {
        const members = new Set([...properties, ...exportedSymbols])
        for (const member of members) {
          const memberClassification = classifySymbol(member)
          memberClassification.addToPage?.(page, member, enqueue)
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
  }

  function skipAlias(symbol: ts.Symbol) {
    return symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol
  }

  function getTargetSymbol(symbol: ts.Symbol) {
    symbol = skipAlias(symbol)
    return resolveExternalModuleSymbol(symbol) || symbol
  }

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

  {
    const { root, symbolPageMap } = main()
    return {
      model: serialize(root, symbolPageMap),
      program,
      checker: checker,
    }
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

function getSymbolParent(symbol: ts.Symbol): ts.Symbol | undefined {
  return (symbol as ヤバい).parent
}
