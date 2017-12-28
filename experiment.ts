import * as ts from 'typescript'

const basePath = process.cwd() + '/test/fixture'
const rootFileNames = [
  process.cwd() + '/test/fixture/index.ts'
]

// const basePath = '/Users/dtinth/Bemuse/bemuse-notechart/src'
// const rootFileNames = [
//   basePath + '/loader/index.js'
// ]

// const basePath = '/Users/dtinth/GitHub/redux'
// const rootFileNames = [
//   basePath + '/src/index.js' // '/index.d.ts'
// ]

interface DocumentationData {
  publicModules: string[]
  symbols: { [id: string]: DocumentationSymbol }
}

interface DocumentationComment {
  jsdoc: any
  comment: any
}

interface DocumentationSymbolBase extends DocumentationComment {
  name: string
  symbolFlags: number
  declaration?: DocumentationDeclaration
}

interface DocumentationDeclaration {
  module: string
  line: number
  character: number
}

interface DocumentationType {
  typeString: string
  typeFlags: number
  typeInfo: TypeInfo
}

interface DocumentationTypedSymbol extends DocumentationSymbolBase, DocumentationType {
}

interface DocumentationModule extends DocumentationSymbolBase {
  kind: 'module'
  exportedSymbols: { [name: string]: string }
}

interface DocumentationValueSymbol extends DocumentationTypedSymbol {
  kind: 'value'
}

interface DocumentationFunctionSymbol extends DocumentationTypedSymbol {
  kind: 'function'
  callSignatures: DocumentationSignature[]
}

interface DocumentationClassSymbol extends DocumentationTypedSymbol {
  kind: 'class'
  constructSignatures: DocumentationSignature[]
  instanceMembers: { [name: string]: string }
  classMembers: { [name: string]: string }
  bases: string[]
}

interface DocumentationSignature extends DocumentationComment {
  parameters: DocumentationSymbolBase[]
  returnType: string
}

interface OtherTypeInfo {
  kind: 'other'
  text: string
}

interface SymbolReferenceTypeInfo {
  kind: 'symbol'
  symbol: string
}

interface TypeReferenceTypeInfo {
  kind: 'lol no generics'
  target: TypeInfo
  typeArguments: TypeInfo
}

type DocumentationSymbol =
  DocumentationModule |
  DocumentationValueSymbol |
  DocumentationFunctionSymbol |
  DocumentationClassSymbol

type TypeInfo =
  OtherTypeInfo |
  SymbolReferenceTypeInfo |
  TypeReferenceTypeInfo

const { options } = ts.convertCompilerOptionsFromJson({
  allowJs: true
}, basePath)

const program = ts.createProgram(rootFileNames, options)
const checker = program.getTypeChecker()
const idMap = new Map()

function createWalker () {
  const state: DocumentationData = {
    publicModules: [ ],
    symbols: { }
  }

  let nextId = 1
  const idMap = new Map<ts.Symbol, string>()

  function symbolBase (symbol: ts.Symbol): DocumentationSymbolBase {
    return {
      name: symbol.getName(),
      jsdoc: symbol.getJsDocTags(),
      comment: symbol.getDocumentationComment(),
      symbolFlags: symbol.getFlags()
    }
  }

  function visitSymbol (symbol: ts.Symbol, visitor: (symbol: ts.Symbol) => DocumentationSymbol): string {
    if (idMap.has(symbol)) {
      return idMap.get(symbol)
    }
    const id = String(nextId++)
    idMap.set(symbol, id)
    state.symbols[id] = visitor(symbol)
    return id
  }

  function readModule (moduleSymbol: ts.Symbol) {
    state.publicModules.push(walkExportedSymbol(moduleSymbol))
  }

  function walkExportedSymbol (symbol: ts.Symbol, declaration?: ts.Node) {
    return visitSymbol(symbol, () => {
      if (symbol.flags & ts.SymbolFlags.Module) {
        return generateModuleSymbol()
      }

      declaration = symbol.valueDeclaration || declaration
      const type = getType(symbol, declaration)
      const callSignatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call)
      const constructSignatures = checker.getSignaturesOfType(type, ts.SignatureKind.Construct)

      const typeString = typeToString(type, declaration || undefined)
      const base: DocumentationTypedSymbol = {
        ...symbolBase(symbol),
        typeString,
        typeFlags: type.getFlags(),
        typeInfo: getTypeInfo(type)
      }
      if (declaration) {
        base.declaration = getDeclarationPosition(declaration)
      }
      if (constructSignatures.length) {
        return generateClassSymbol()
      }
      if (callSignatures.length) {
        return generateFunctionSymbol()
      }
      return generateValueSymbol()

      function generateModuleSymbol (): DocumentationModule {
        const out: DocumentationModule = {
          ...symbolBase(symbol),
          kind: 'module',
          exportedSymbols: { }
        }
        for (const exportedSymbol of checker.getExportsOfModule(symbol)) {
          const resolvedSymbol = resolveSymbol(exportedSymbol)
          const target = walkExportedSymbol(resolvedSymbol)
          out.exportedSymbols[exportedSymbol.getName()] = target
        }
        return out
      }
      function generateClassSymbol (): DocumentationClassSymbol {
        const exports: Map<string, ts.Symbol> = (symbol as any).exports
        const members: Map<string, ts.Symbol> = (symbol as any).members
        const mapMembers = (map: Map<string, ts.Symbol>) => {
          const out = { }
          map.forEach((value, key) => {
            out[key] = walkExportedSymbol(resolveSymbol(value), declaration)
          })
          return out
        }
        return {
          ...base,
          kind: 'class',
          constructSignatures: constructSignatures.map(signature => generateSignature(signature)),
          classMembers: mapMembers(exports),
          instanceMembers: mapMembers(members),
          bases: (checker.getBaseTypes(type as ts.InterfaceType) || [ ])
            .map(type => type.symbol && walkExportedSymbol(type.symbol))
            .filter(id => id)
        }
      }
      function generateFunctionSymbol (): DocumentationFunctionSymbol {
        return {
          ...base,
          kind: 'function',
          callSignatures: callSignatures.map(signature => generateSignature(signature))
        }
      }
      function generateValueSymbol (): DocumentationValueSymbol {
        return {
          ...base,
          kind: 'value'
        }
      }
    })
  }

  function getDeclarationPosition (declaration: ts.Node): DocumentationDeclaration | undefined {
    const sourceFile = declaration.getSourceFile()
    const symbol = (sourceFile as any).symbol as ts.Symbol | undefined
    if (!symbol) return null
    const startPosition = declaration.getStart()
    const start = sourceFile.getLineAndCharacterOfPosition(startPosition)
    return {
      module: walkExportedSymbol(symbol),
      line: start.line,
      character: start.character
    }
  }

  function resolveSymbol (symbol: ts.Symbol): ts.Symbol {
    return (symbol.flags & ts.SymbolFlags.Alias)
      ? checker.getAliasedSymbol(symbol)
      : symbol
  }

  function generateSignature (signature: ts.Signature): DocumentationSignature {
    return {
      jsdoc: signature.getJsDocTags(),
      comment: signature.getDocumentationComment(),
      parameters: signature.getParameters().map(parameter => {
        return {
          ...symbolBase(parameter),
          typeString: typeToString(getType(parameter))
        }
      }),
      returnType: typeToString(signature.getReturnType())
    }
  }

  function typeToString (type: ts.Type, declaration?: ts.Node): string {
    return checker.typeToString(type, declaration, ts.TypeFormatFlags.NoTruncation)
  }

  // Please help me type this function.
  function getTypeInfo (type: ts.Type, allowGenerics = true): TypeInfo {
    const objectFlags: number = (type as any).objectFlags || 0
    if ((objectFlags & ts.ObjectFlags.Reference) && allowGenerics) {
      const target = (type as any).target as ts.GenericType
      const typeArguments = (type as any).typeArguments || [ ]
      if (typeArguments.length) {
        return {
          kind: 'lol no generics',
          target: getTypeInfo(target, false),
          typeArguments: typeArguments.map(arg => getTypeInfo(arg))
        }
      }
    }
    if (type.symbol && type.symbol.valueDeclaration) {
      if (objectFlags & ts.ObjectFlags.ClassOrInterface) {
        return {
          kind: 'symbol',
          symbol: walkExportedSymbol(type.symbol)
        }
      }
    }
    return {
      kind: 'other',
      text: typeToString(type)
    }
  }

  function getType (symbol: ts.Symbol, declaration?: ts.Node): ts.Type {
    declaration = symbol.valueDeclaration || declaration
    return declaration
      ? checker.getTypeOfSymbolAtLocation(symbol, declaration)
      : checker.getDeclaredTypeOfSymbol(symbol)
  }

  return { readModule, getState: () => state }
}

const walker = createWalker()

for (const filename of program.getRootFileNames()) {
  const file = program.getSourceFile(filename)
  const moduleSymbol = (file as any).symbol
  if (!moduleSymbol) continue
  walker.readModule(moduleSymbol)
}

console.log(JSON.stringify(walker.getState(), null, 2))

// For further testing in REPL...
Object.assign(global, {
  ts,
  program,
  checker
})
