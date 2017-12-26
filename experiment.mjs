import ts from 'typescript'
import indent from 'indent-string'

const basePath = process.cwd() + '/test/fixture'
const rootFileNames = [
  process.cwd() + '/test/fixture/index.ts'
]

const { options } = ts.convertCompilerOptionsFromJson({
  allowJs: true
}, basePath)

const program = ts.createProgram(rootFileNames, options)
const checker = program.getTypeChecker()

for (const filename of program.getRootFileNames()) {
  console.log(filename)
  const file = program.getSourceFile(filename)

  for (const exportedSymbol of checker.getExportsOfModule(file.symbol)) {
    const resolvedSymbol = (exportedSymbol.flags & ts.SymbolFlags.Alias)
      ? checker.getAliasedSymbol(exportedSymbol)
      : exportedSymbol
    console.log(' *', exportedSymbol.escapedName)

    const node = exportedSymbol.declarations[0]
    const type = checker.getTypeOfSymbolAtLocation(resolvedSymbol, resolvedSymbol.valueDeclaration || node)
    const typeString = checker.typeToString(type, node, ts.TypeFormatFlags.NoTruncation)
    const comment = resolvedSymbol.getDocumentationComment(checker)

    console.log('    |-', checker.getFullyQualifiedName(exportedSymbol))
    if (resolvedSymbol !== exportedSymbol) {
      console.log('    |-', checker.getFullyQualifiedName(resolvedSymbol))
    }
    for (const item of comment) {
      console.log(indent(item.text, 12))
    }
    console.log('    +->', typeString)
  }
}

// For further testing in REPL...
Object.assign(global, {
  ts,
  program,
  checker
})
