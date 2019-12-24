import ts from 'typescript'

// Mostly copy paste from https://github.com/microsoft/TypeScript/blob/master/src/services/utilities.ts

export interface LinkedSymbolPartsWriter {
  writeKeyword(text: string): void
  writeOperator(text: string): void
  writePunctuation(text: string): void
  writeSpace(text: string): void
  writeStringLiteral(text: string): void
  writeParameter(text: string): void
  writeProperty(text: string): void
  writeSymbol(text: string, symbol: ts.Symbol): void
  writeLine(): void
  increaseIndent(): void
  decreaseIndent(): void
  clear(): void
  write(s: string): void
  writeTrailingSemicolon(text: string): void
  writeComment(text: string): void
  getText(): string
  rawWrite(s: string): void
  writeLiteral(s: string): void
  getTextPos(): number
  getLine(): number
  getColumn(): number
  getIndent(): number
  isAtStartOfLine(): boolean
  hasTrailingComment(): boolean
  hasTrailingWhitespace(): boolean
  getTextPosWithWriteLine?(): number
  getParts(): LinkedSymbolPart[]
  [extra: string]: any
}

const noop = () => {}
const defaultMaximumTruncationLength = 160

const linkedSymbolPartsWriter = getDisplayPartWriter()

function getDisplayPartWriter(): LinkedSymbolPartsWriter {
  const absoluteMaximumLength = defaultMaximumTruncationLength * 10 // A hard cutoff to avoid overloading the messaging channel in worst-case scenarios
  let parts: LinkedSymbolPart[]
  let lineStart: boolean
  let indent: number
  let length: number

  resetWriter()
  return {
    getParts: () => {
      const finalText = parts.length && parts[parts.length - 1].text
      if (length > absoluteMaximumLength && finalText && finalText !== '...') {
        if (!/\s/.test(finalText.charAt(finalText.length - 1))) {
          parts.push(displayPart(' '))
        }
        parts.push(displayPart('...'))
      }
      return parts
    },
    writeKeyword: write,
    writeOperator: write,
    writePunctuation: write,
    writeTrailingSemicolon: write,
    writeSpace: write,
    writeStringLiteral: write,
    writeParameter: write,
    writeProperty: write,
    writeLiteral: write,
    writeSymbol,
    writeLine,
    write,
    writeComment: write,
    getText: () => '',
    getTextPos: () => 0,
    getColumn: () => 0,
    getLine: () => 0,
    isAtStartOfLine: () => false,
    hasTrailingWhitespace: () => false,
    hasTrailingComment: () => false,
    rawWrite: () => {
      throw new Error('not implemeneted')
    },
    getIndent: () => indent,
    increaseIndent: () => {
      indent++
    },
    decreaseIndent: () => {
      indent--
    },
    clear: resetWriter,
    trackSymbol: noop,
    reportInaccessibleThisError: noop,
    reportInaccessibleUniqueSymbolError: noop,
    reportPrivateInBaseOfClassExpression: noop,
  }

  function writeIndent() {
    if (length > absoluteMaximumLength) return
    if (lineStart) {
      const indentString = '  '.repeat(indent)
      if (indentString) {
        length += indentString.length
        parts.push(displayPart(indentString))
        mergeParts()
      }
      lineStart = false
    }
  }

  function mergeParts() {
    if (parts.length >= 2) {
      if (parts[parts.length - 1].symbol === parts[parts.length - 2].symbol) {
        parts[parts.length - 2].text += parts[parts.length - 1].text
        parts.pop()
      }
    }
  }

  function write(text: string) {
    if (length > absoluteMaximumLength) return
    writeIndent()
    length += text.length
    parts.push(displayPart(text))
    mergeParts()
  }

  function writeSymbol(text: string, symbol: ts.Symbol) {
    if (length > absoluteMaximumLength) return
    writeIndent()
    length += text.length
    parts.push(displayPart(text, symbol))
    mergeParts()
  }

  function writeLine() {
    if (length > absoluteMaximumLength) return
    length += 1
    parts.push(lineBreakPart())
    mergeParts()
    lineStart = true
  }

  function resetWriter() {
    parts = []
    lineStart = true
    indent = 0
    length = 0
  }
}

export type LinkedSymbolPart = {
  text: string
  symbol?: ts.Symbol
}

function displayPart(text: string, symbol?: ts.Symbol): LinkedSymbolPart {
  return { text, symbol }
}

function lineBreakPart() {
  return displayPart('\n')
}

function mapToLinkedSymbolParts(
  writeDisplayParts: (writer: LinkedSymbolPartsWriter) => void,
): LinkedSymbolPart[] {
  try {
    writeDisplayParts(linkedSymbolPartsWriter)
    return linkedSymbolPartsWriter.getParts()
  } finally {
    linkedSymbolPartsWriter.clear()
  }
}

export function typeToLinkedSymbolParts(
  typechecker: ts.TypeChecker,
  type: ts.Type,
  enclosingDeclaration?: ts.Node,
  flags: ts.TypeFormatFlags = ts.TypeFormatFlags.None,
): LinkedSymbolPart[] {
  return mapToLinkedSymbolParts(writer => {
    ;(typechecker as any).writeType(
      type,
      enclosingDeclaration,
      flags |
        ts.TypeFormatFlags.MultilineObjectLiterals |
        ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
      writer,
    )
  })
}
