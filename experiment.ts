import * as ts from 'typescript'

const basePath = process.cwd() + '/test/fixture'
const rootFileNames = [
  process.cwd() + '/test/fixture/index.ts'
]

// const basePath = '/Users/dtinth/Bemuse/bemuse-notechart/src'
// const rootFileNames = [
//   basePath + '/loader/index.js'
// ]

interface DocumentationData {
  exportedModules: string[]
  symbols: { [id: string]: DocumentationSymbol }
}

interface DocumentationSymbolBase {
  name: string
  symbolFlags: number
  jsdoc: any
  comment: any
}

interface DocumentationTypedSymbol extends DocumentationSymbolBase {
  typeString: string
  typeFlags: number
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

interface DocumentationSignature {
  parameters: DocumentationSymbolBase[]
  returnType: string
}

type DocumentationSymbol =
  DocumentationModule |
  DocumentationValueSymbol |
  DocumentationFunctionSymbol |
  DocumentationClassSymbol

const { options } = ts.convertCompilerOptionsFromJson({
  allowJs: true
}, basePath)

const program = ts.createProgram(rootFileNames, options)
const checker = program.getTypeChecker()
const idMap = new Map()

function createWalker () {
  const state: DocumentationData = {
    exportedModules: [ ],
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
    state.exportedModules.push(walkExportedSymbol(moduleSymbol))
  }

  function walkExportedSymbol (symbol: ts.Symbol, declaration?: ts.Node) {
    return visitSymbol(symbol, () => {
      if (symbol.flags & ts.SymbolFlags.Module) {
        return generateModuleSymbol()
      }

      declaration = declaration || symbol.valueDeclaration
      const type = declaration
        ? checker.getTypeOfSymbolAtLocation(symbol, declaration)
        : checker.getDeclaredTypeOfSymbol(symbol)
      const callSignatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call)
      const constructSignatures = checker.getSignaturesOfType(type, ts.SignatureKind.Construct)

      const typeString = typeToString(type, declaration || undefined)
      const base: DocumentationTypedSymbol = {
        ...symbolBase(symbol),
        typeString,
        typeFlags: type.getFlags()
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

  function resolveSymbol (symbol: ts.Symbol): ts.Symbol {
    return (symbol.flags & ts.SymbolFlags.Alias)
      ? checker.getAliasedSymbol(symbol)
      : symbol
  }

  function generateSignature (signature): DocumentationSignature {
    return {
      parameters: signature.getParameters().map(parameter => symbolBase(parameter)),
      returnType: typeToString(signature.getReturnType())
    }
  }

  function typeToString (type: ts.Type, declaration?: ts.Node): string {
    return checker.typeToString(type, declaration, ts.TypeFormatFlags.NoTruncation)
  }

  return { readModule, getState: () => state }
}

const walker = createWalker()

for (const filename of program.getRootFileNames()) {
  console.log(filename)
  const file = program.getSourceFile(filename)
  const moduleSymbol = (file as any).symbol
  if (!moduleSymbol) continue
  walker.readModule(moduleSymbol)
}

console.log(JSON.stringify(walker.getState(), null, 2))
//   for (const exportedSymbol of checker.getExportsOfModule(moduleSymbol)) {
//     const resolvedSymbol = (exportedSymbol.flags & ts.SymbolFlags.Alias)
//       ? checker.getAliasedSymbol(exportedSymbol)
//       : exportedSymbol
//     console.log(' *', exportedSymbol.escapedName)
//
//     const node = exportedSymbol.declarations[0]
//     const type = checker.getTypeOfSymbolAtLocation(resolvedSymbol, resolvedSymbol.valueDeclaration || node)
//     const typeString = checker.typeToString(type, node, ts.TypeFormatFlags.NoTruncation)
//     const comment = resolvedSymbol.getDocumentationComment()
//
//     console.log('    |-', checker.getFullyQualifiedName(exportedSymbol), exportedSymbol.id)
//     if (resolvedSymbol !== exportedSymbol) {
//       console.log('    |-', checker.getFullyQualifiedName(resolvedSymbol), resolvedSymbol.id)
//     }
//     for (const item of comment) {
//       console.log(require('indent-string')(item.text, 12))
//     }
//     console.log('    +->', typeString)
//     if (typeString === 'typeof NotechartLoader') global['z'] = type
//   }
// }

// For further testing in REPL...
Object.assign(global, {
  ts,
  program,
  checker
})
