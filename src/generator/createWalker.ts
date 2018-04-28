import * as doc from './doc'
import path from 'path'
import ts from 'typescript'

export default function createWalker (program: ts.Program, basePath: string, moduleName: string) {
  const checker = program.getTypeChecker()

  const state: doc.DocumentationData = {
    publicModules: [ ],
    symbols: { }
  }

  let nextId = 1
  const idMap = new Map<ts.Symbol, string>()

  function symbolBase (symbol: ts.Symbol): doc.DocumentationSymbolBase {
    const name = (symbol.flags & ts.SymbolFlags.Module)
      ? rewriteModuleName(symbol.getName())
      : symbol.getName()
    return {
      name: name,
      jsdoc: symbol.getJsDocTags(),
      comment: symbol.getDocumentationComment(checker),
      _symbolFlags: symbol.getFlags()
    }
  }

  function rewriteModuleName (name): string {
    name = name.replace(/"/g, '').replace(/\\/g, '/')

    // Absolute path (non-ambient module)
    let absolute = false
    if (name.match(/^\/|:\//)) {
      name = path.relative(basePath, name).replace(/\\/g, '/')
      absolute = true
    }
    const parts = name.split('/')
    if (absolute) {
      const index = parts.lastIndexOf('node_modules')
      if (index > -1) {
        parts.splice(0, index + 1)
      } else {
        parts.splice(0, 0, moduleName)
      }
    }
    if (parts[parts.length - 1] === 'index') parts.pop()
    name = parts.join('/')
    return name
  }

  function visitSymbol (symbol: ts.Symbol, visitor: (symbol: ts.Symbol) => doc.DocumentationSymbol): string {
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
      const objectFlags: number = (type as any).objectFlags || 0
      const base: doc.DocumentationTypedSymbol = {
        ...symbolBase(symbol),
        _typeFlags: type.getFlags(),
        _objectFlags: objectFlags,
        typeString,
        typeInfo: getTypeInfo(type)
      }
      if (declaration) {
        base.declaration = getDeclarationPosition(declaration)
      }
      // XXX: Check for `constructSignatures.length` as the compiler doesn’t
      // seem to mark classes in JS files with ClassOrInterface object flags.
      if ((objectFlags & ts.ObjectFlags.ClassOrInterface) || constructSignatures.length) {
        return generateClassSymbol()
      }
      if (callSignatures.length) {
        return generateFunctionSymbol()
      }
      return generateValueSymbol()

      function generateModuleSymbol (): doc.DocumentationModule {
        const out: doc.DocumentationModule = {
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
      function generateClassSymbol (): doc.DocumentationClassSymbol {
        const exports: Map<string, ts.Symbol> = (symbol as any).exports
        const members: Map<string, ts.Symbol> = (symbol as any).members
        const mapMembers = (map: Map<string, ts.Symbol>) => {
          const out = { }
          map && map.forEach((value, key) => {
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
      function generateFunctionSymbol (): doc.DocumentationFunctionSymbol {
        return {
          ...base,
          kind: 'function',
          callSignatures: callSignatures.map(signature => generateSignature(signature))
        }
      }
      function generateValueSymbol (): doc.DocumentationValueSymbol {
        return {
          ...base,
          kind: 'value'
        }
      }
    })
  }

  function getDeclarationPosition (declaration: ts.Node): doc.DocumentationDeclaration | undefined {
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

  function generateSignature (signature: ts.Signature): doc.DocumentationSignature {
    return {
      jsdoc: signature.getJsDocTags(),
      comment: signature.getDocumentationComment(checker),
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
  function getTypeInfo (type: ts.Type, allowGenerics = true): doc.TypeInfo {
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
