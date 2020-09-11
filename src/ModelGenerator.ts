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
import readPkgUp from 'read-pkg-up'
import { dirname, join } from 'path'

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
  project.resolveSourceFileDependencies()

  const program = project.createProgram()
  const checker = program.getTypeChecker()
  const classifier = createClassifier()

  if (generateOptions.debug) {
    debugger
  }
  const sourceFileRegistry = new SourceFileRegistry()

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
    modules = this.addSection('modules')
    globals = this.addSection('globals', globalsSerializer)
    namespaces = this.addSection('namespaces')
    classes = this.addSection('classes')
    enumerations = this.addSection('enumerations')
    types = this.addSection('types')
    callSignatures = this.addSection('callSignatures', signatureSerializer)
    constructors = this.addSection('constructors', signatureSerializer)
    properties = this.addSection('properties')
    instanceCallSignatures = this.addSection(
      'instanceCallSignatures',
      signatureSerializer,
    )
    instanceConstructors = this.addSection(
      'instanceConstructors',
      signatureSerializer,
    )
    instanceProperties = this.addSection('instanceProperties')

    private addSection(key: string): DocSection<ts.Symbol>
    private addSection<T>(
      key: string,
      serializer: DocEntrySerializer<T>,
    ): DocSection<T>
    private addSection(
      key: string,
      serializer: DocEntrySerializer<any> = symbolSerializer,
    ): DocSection<any> {
      const section = new DocSection<ts.Symbol>(this, key, serializer)
      this.sections.push(section)
      return section
    }

    inspect(): string {
      return `<Page ${this.name} (${this.kind})>`
    }
  }

  class DocSection<T> {
    constructor(
      public page: DocPage,
      public key: string,
      public serializer: DocEntrySerializer<T>,
    ) {}
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
      return prefix + this.section.key + ' » ' + this.name
    }

    inspect(): string {
      return `<Entry ${this.toString()}>`
    }
  }

  interface DocEntrySerializer<T> {
    serialize(entry: DocEntry<T>, delegate: SerializeDelegate): any
  }

  const symbolSerializer: DocEntrySerializer<ts.Symbol> = {
    serialize(entry, delegate) {
      const symbol = entry.target
      const classification = classifier.classifySymbol(symbol)
      const firstDeclaration = symbol.declarations?.[0]
      const type = firstDeclaration
        ? checker.getTypeOfSymbolAtLocation(symbol, firstDeclaration)
        : null
      return {
        id: delegate.getEntryId(entry),
        name: entry.name,
        info: {
          type: 'symbol',
          kind: classification.kind,
          symbolId: delegate.getSymbolId(symbol),
          typeInfo: type ? serializeType(type, delegate) : undefined,
        },
      }
    },
  }

  const globalsSerializer: DocEntrySerializer<DocPage | null> = {
    serialize(_entry) {
      // return getSymbolName(symbol)
    },
  }

  const signatureSerializer: DocEntrySerializer<ts.Signature> = {
    serialize(_entry) {
      // return getSymbolName(symbol)
    },
  }

  class EntryIdRegistry {
    private readonly entryToIdMap = new Map<DocEntry<any>, string>()
    private readonly entryIdToEntryMap = new Map<string, DocEntry<any>>()
    add(entry: DocEntry<any>) {
      return this.getOrCreateEntryId(entry)
    }
    getEntryId(entry: DocEntry<any>) {
      let id = this.entryToIdMap.get(entry)
      if (!id) {
        throw new Error(`Entry not registered: ${entry.inspect()}`)
      }
      return id
    }
    private getOrCreateEntryId(entry: DocEntry<any>): string {
      let id = this.entryToIdMap.get(entry)
      if (id) {
        return id
      }
      const parentEntry = entry.section.page.parent
      let prefix = ''
      if (parentEntry) {
        prefix = this.getOrCreateEntryId(parentEntry) + '.'
      }
      const baseId = prefix + entry.name
      for (let i = 0; ; i++) {
        const proposedId = baseId + (i ? `$${i}` : '')
        if (!this.entryIdToEntryMap.has(proposedId)) {
          id = proposedId
          break
        }
      }
      this.entryToIdMap.set(entry, id)
      this.entryIdToEntryMap.set(id, entry)
      return id
    }
  }

  class DocBuilder {
    readonly root = new DocPage(DocPageKind.Root, null, '(root)')
    readonly entryIdRegistry = new EntryIdRegistry()

    addEntry<T>(section: DocSection<T>, name: string, target: T) {
      const entry = section.addEntry(name, target)
      this.entryIdRegistry.add(entry)
      return entry
    }
  }

  interface SymbolProcessingDelegate {
    addEntry<T>(section: DocSection<T>, name: string, target: T): DocEntry<T>
    addSymbolEntry(
      section: DocSection<ts.Symbol>,
      originSymbol: ts.Symbol,
      targetSymbol: ts.Symbol,
    ): DocEntry<ts.Symbol>
    addSubpage(
      section: DocSection<ts.Symbol>,
      originSymbol: ts.Symbol,
      targetSymbol: ts.Symbol,
    ): DocEntry<ts.Symbol>
  }

  function main() {
    const sourceFilesSet = new Set(entrySourceFiles)
    const builder = new DocBuilder()
    const { root, entryIdRegistry } = builder
    const elaborationQueue = new Set<DocEntry<ts.Symbol>>()
    const symbolPageMap = new Map<ts.Symbol, DocPage>()
    const symbolEntryMap = new Map<ts.Symbol, DocEntry<any>>()

    const delegate: SymbolProcessingDelegate = {
      addEntry: (section, name, target) => {
        return builder.addEntry(section, name, target)
      },
      addSubpage: (section, originSymbol, targetSymbol) => {
        const entry = delegate.addSymbolEntry(
          section,
          originSymbol,
          targetSymbol,
        )
        elaborationQueue.add(entry)
        return entry
      },
      addSymbolEntry: (section, originSymbol, targetSymbol) => {
        const entry = builder.addEntry(
          section,
          getSymbolName(originSymbol),
          targetSymbol,
        )
        if (!symbolEntryMap.has(originSymbol)) {
          symbolEntryMap.set(originSymbol, entry)
        }
        return entry
      },
    }

    // Enqueue modules that are source files.
    for (const sourceFile of entrySourceFiles) {
      if (!sourceFile) continue
      const moduleSymbol = checker.getSymbolAtLocation(sourceFile)
      if (!moduleSymbol) continue
      delegate.addSubpage(root.modules, moduleSymbol, moduleSymbol)
    }

    // Enqueue ambient modules declared inside the entry source files
    for (const moduleSymbol of checker.getAmbientModules()) {
      if (isDeclaredInsideEntryFile(moduleSymbol)) {
        delegate.addSubpage(root.modules, moduleSymbol, moduleSymbol)
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
          const entry = builder.addEntry(root.globals, '(globals)', null)
          globalNamespacePage = new DocPage(
            DocPageKind.Namespace,
            entry,
            '(globals)',
          )
          entry.target = globalNamespacePage
        }
        classification.addToPage?.(globalNamespacePage, globalSymbol, delegate)
      }
    }

    for (const entry of elaborationQueue) {
      processEntry(entry)
    }

    return { root, symbolPageMap, symbolEntryMap, entryIdRegistry }

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
          classification.kind
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
        classification.populatePage?.(page, delegate)
      }
    }
  }

  interface SerializeDelegate {
    getPageId(page: DocPage): number
    getEntryId(entry: DocEntry<any>): string
    getSymbolId(symbol: ts.Symbol): string
  }

  class SymbolRegistry {
    private symbolToSymbolIdMap = new Map<ts.Symbol, string>()
    private symbolIdToSymbolMap = new Map<string, ts.Symbol>()
    private nextId = 1
    getSymbolId(symbol: ts.Symbol): string {
      let id = this.symbolToSymbolIdMap.get(symbol)
      if (id) {
        return id
      }
      id = `${symbol.getName()}$${this.nextId++}`
      this.symbolToSymbolIdMap.set(symbol, id)
      this.symbolIdToSymbolMap.set(id, symbol)
      return id
    }
    serialize(
      symbolPageMap: Map<ts.Symbol, DocPage>,
      symbolEntryMap: Map<ts.Symbol, DocEntry<any>>,
      delegate: SerializeDelegate,
    ) {
      return Object.fromEntries(
        [...this.symbolIdToSymbolMap].map(([symbolId, symbol]) => {
          const declarations = symbol
            .getDeclarations()
            ?.map((d) => serializeDeclaration(d))
          const entry = symbolEntryMap.get(symbol)
          const page = symbolPageMap.get(symbol)
          return [
            symbolId,
            {
              name: symbol.getName(),
              entryId: entry ? delegate.getEntryId(entry) : undefined,
              pageId: page ? delegate.getPageId(page) : undefined,
              declarations,
            },
          ]
        }),
      )

      function serializeDeclaration(declaration: ts.Declaration) {
        const startPosition = declaration.getStart()
        const sourceFile = declaration.getSourceFile()
        const start = sourceFile.getLineAndCharacterOfPosition(startPosition)
        const declaredAt: DeclarationInfo = {
          line: start.line,
          character: start.character,
          position: startPosition,
          sourceFile: sourceFileRegistry.getSourceFileId(sourceFile),
        }
        return declaredAt
      }
    }
  }

  function serialize(
    root: DocPage,
    symbolPageMap: Map<ts.Symbol, DocPage>,
    symbolEntryMap: Map<ts.Symbol, DocEntry<any>>,
    entryIdRegistry: EntryIdRegistry,
  ): Model {
    const pageList = new PageList(root, entryIdRegistry)
    const symbolRegistry = new SymbolRegistry()
    const delegate: SerializeDelegate = {
      getEntryId(entry) {
        return entryIdRegistry.getEntryId(entry)
      },
      getSymbolId(symbol) {
        return symbolRegistry.getSymbolId(symbol)
      },
      getPageId(page) {
        return pageList.getPageId(page)
      },
    }
    const serializedPages = pageList.serialize(delegate)
    return {
      metadata: {
        generator: require('../package').name,
        generatorVersion: require('../package').version,
        generatedAt: generatedAt,
      },
      pages: serializedPages,
      symbols: symbolRegistry.serialize(
        symbolPageMap,
        symbolEntryMap,
        delegate,
      ),
      // entryModules: entryModuleSymbolIds,
      // entrySourceFiles: entrySourceFileIds,
      // symbols: Object.values(symbolDataById),
      // sourceFiles: Object.values(sourceFileDataById),
    }
  }

  class PageList {
    pages: DocPage[] = []
    pageToPageIdMap = new Map<DocPage, string>()
    usedPageIds = new Set<string>()

    constructor(root: DocPage, entryIdRegistry: EntryIdRegistry) {
      const visit = (page: DocPage) => {
        let idBase = page.parent
          ? entryIdRegistry
              .getEntryId(page.parent)
              .replace(/[^\w]/g, ' ')
              .trim()
              .replace(/ /g, '-')
          : 'index'
        let pageId: string
        for (let i = 0; ; i++) {
          const proposedPageId = idBase + (i ? '_' + i : '')
          if (!this.usedPageIds.has(proposedPageId)) {
            pageId = proposedPageId
            break
          }
        }
        this.pageToPageIdMap.set(page, pageId)
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
    serialize(delegate: SerializeDelegate) {
      const pageList = this
      return this.pages.map(serializePage)

      function serializePage(page: DocPage) {
        try {
          return {
            id: pageList.getPageId(page),
            name: page.name,
            kind: page.kind,
            subpages: page.subpages.map((p) => pageList.getPageId(p)),
            sections: page.sections
              .filter((s) => s.entries.length > 0)
              .map((section) => {
                return {
                  key: section.key,
                  entries: section.entries.map((e) => serializeEntry(e)),
                }
              }),
          }
        } catch (error) {
          error.message = `Failed to format ${page.inspect()}: ${error.message}`
          throw error
        }
      }

      function serializeEntry(entry: DocEntry<any>) {
        try {
          return entry.section.serializer.serialize(entry, delegate)
        } catch (error) {
          error.message = `Failed to format ${entry.inspect()}: ${
            error.message
          }`
          throw error
        }
      }
    }
  }

  type ClassificationResult = {
    kind: string
    newPageOptions?: { kind: DocPageKind; name: string }
    addToPage?: (
      page: DocPage,
      sourceSymbol: ts.Symbol,
      delegate: SymbolProcessingDelegate,
    ) => void
    populatePage?: (page: DocPage, delegate: SymbolProcessingDelegate) => void
  }

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
        return { kind: 'unclassified' }
      }

      // Pure type...
      if (!symbol.valueDeclaration) {
        const type = checker.getTypeAtLocation(declaration)
        if (
          type.flags & ts.TypeFlags.Object &&
          type.getProperties().length + type.getCallSignatures().length > 0
        ) {
          return {
            kind: 'interface',
            addToPage: (page, originSymbol, delegate) => {
              delegate.addSubpage(page.types, originSymbol, symbol)
            },
            newPageOptions: createPageOptions(DocPageKind.Interface),
            populatePage: populateInterfacePage,
          }
        } else {
          return {
            kind: 'typeAlias',
            addToPage: (page, originSymbol, delegate) => {
              delegate.addSymbolEntry(page.types, originSymbol, symbol)
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
          kind: classification.kind,
          addToPage: (page, originSymbol, delegate) => {
            delegate.addSymbolEntry(page.properties, originSymbol, targetSymbol)
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
          kind: constructable ? 'class' : callable ? 'function' : 'namespace',
          newPageOptions: createPageOptions(
            constructable
              ? DocPageKind.Class
              : callable
              ? DocPageKind.Function
              : DocPageKind.Namespace,
          ),
          populatePage: populateValuePage,
          addToPage: (page, originSymbol, delegate) => {
            const category = constructable
              ? page.classes
              : callable
              ? page.properties
              : page.namespaces
            const entry = delegate.addSubpage(category, originSymbol, symbol)
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
          },
        }
      } else if (typeIsObject && callSignatures.length > 0) {
        return {
          kind: 'function',
          addToPage: (page, originSymbol, delegate) => {
            delegate.addSymbolEntry(page.properties, originSymbol, symbol)
          },
        }
      } else {
        return {
          kind: 'member',
          addToPage: (page, originSymbol, delegate) => {
            delegate.addSymbolEntry(page.properties, originSymbol, symbol)
          },
        }
      }

      function createPageOptions(kind: DocPageKind) {
        return { kind, name: getSymbolName(symbol) }
      }

      function populateValuePage(
        page: DocPage,
        delegate: SymbolProcessingDelegate,
      ) {
        const members = new Set([...properties, ...exportedSymbols])
        for (const member of members) {
          const memberClassification = classifySymbol(member)
          memberClassification.addToPage?.(page, member, delegate)
        }
        populateInterfacePage(page, delegate)
      }

      function populateInterfacePage(
        page: DocPage,
        delegate: SymbolProcessingDelegate,
      ) {
        const instanceType =
          declaration.parent && checker.getTypeAtLocation(declaration)
        if (!instanceType) {
          return
        }
        if (instanceType.isClassOrInterface()) {
          const properties = instanceType.getProperties()
          for (const property of properties) {
            delegate.addSymbolEntry(page.instanceProperties, property, property)
          }
        } else if (!symbol.valueDeclaration) {
          const members: ts.Symbol[] = [
            ...(symbol.members?.values() || ([] as any)),
          ]
          for (const member of members) {
            delegate.addSymbolEntry(page.instanceProperties, member, member)
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

  function serializeType(type: ts.Type, delegate: SerializeDelegate) {
    return {
      parts: protectFromFailure(
        () =>
          typeToLinkedSymbolParts(checker, type).map((x) =>
            x.symbol
              ? ([delegate.getSymbolId(x.symbol), x.text] as const)
              : x.text,
          ),
        (e) => {
          console.error('Cannot serialize type properly:', e)
          return [checker.typeToString(type)]
        },
      ),
    }
  }

  function protectFromFailure<T>(f: () => T, fallback: (e: Error) => T) {
    try {
      return f()
    } catch (e) {
      return fallback(e)
    }
  }

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
      return sourceFileRegistry.getNonspecificSpecifier(declaration)
    }
    return symbol.getName()
  }

  {
    const { root, symbolPageMap, symbolEntryMap, entryIdRegistry } = main()
    return {
      model: serialize(root, symbolPageMap, symbolEntryMap, entryIdRegistry),
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

// function getSymbolParent(symbol: ts.Symbol): ts.Symbol | undefined {
//   return (symbol as ヤバい).parent
// }

type SourceFileInfo = {
  specificSpecifier: string
  nonspecificSpecifier: string
}

class SourceFileRegistry {
  sourceFileToIdMap = new Map<ts.SourceFile, string>()
  sourceFileInfoCache = new Map<ts.SourceFile, SourceFileInfo>()
  getSourceFileId(sourceFile: ts.SourceFile) {
    let id = this.sourceFileToIdMap.get(sourceFile)
    if (id) {
      return id
    }
    id = this.getSourceFileInfo(sourceFile).specificSpecifier
    return id
  }
  getNonspecificSpecifier(sourceFile: ts.SourceFile) {
    return this.getSourceFileInfo(sourceFile).nonspecificSpecifier
  }
  private getSourceFileInfo(sourceFile: ts.SourceFile): SourceFileInfo {
    let info = this.sourceFileInfoCache.get(sourceFile)
    if (info) {
      return info
    }
    const pkg = sourceFile.fileName.includes('node_modules')
      ? readPkgUp.sync({
          cwd: dirname(sourceFile.fileName),
        })
      : null
    if (pkg?.packageJson?.name) {
      const packageName = pkg.packageJson.name
      const packagePath = dirname(pkg.path)
      const relativePath: string = require('path')
        .relative(packagePath, sourceFile.fileName)
        .replace(/\\/g, '/')
      const typingsFile = pkg.packageJson.types || pkg.packageJson.typings
      const sourceFileIsPackageTypingsEntryFile =
        typingsFile && join(packagePath, typingsFile) === sourceFile.fileName
      info = {
        specificSpecifier: `${packageName}@${pkg.packageJson.version}/${relativePath}`,
        nonspecificSpecifier: sourceFileIsPackageTypingsEntryFile
          ? packageName
          : `${packageName}/${relativePath
              .replace(/(?:\.d)?\.[tj]sx?$/, '')
              .replace(/\/index$/, '')}`,
      }
    } else {
      const relativePath: string = require('path')
        .relative(process.cwd(), sourceFile.fileName)
        .replace(/\\/g, '/')
      info = {
        specificSpecifier: `./${relativePath}`,
        nonspecificSpecifier: `./${relativePath
          .replace(/(?:\.d)?\.[tj]sx?$/, '')
          .replace(/\/index$/, '')}`,
      }
    }
    this.sourceFileInfoCache.set(sourceFile, info)
    return info
  }
}
