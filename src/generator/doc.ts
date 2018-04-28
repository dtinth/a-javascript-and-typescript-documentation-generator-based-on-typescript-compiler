import { JSDocTagInfo, SymbolDisplayPart } from "typescript";

/**
 * Documentation JSON-compatible model
 */

/**
 * The JSON emitted by the documentation.
 */
export interface DocumentationData {
  publicModules: string[]
  symbols: { [id: string]: DocumentationSymbol }
}

/**
 * A symbol to be documented.
 */
export type DocumentationSymbol =
  DocumentationModule |
  DocumentationValueSymbol |
  DocumentationFunctionSymbol |
  DocumentationClassSymbol

/**
 * Each symbol (and other stuffs) has a type.
 * Here’s how types are represented in the JSON.
 */
export type TypeInfo =
  OtherTypeInfo |
  SymbolReferenceTypeInfo |
  TypeReferenceTypeInfo

/**
 * Textual comments for symbols, call signatures, ….
 */
export interface DocumentationComment {
  jsdoc: JSDocTagInfo[]
  comment: SymbolDisplayPart[]
}

/**
 * Every DocumentationSymbol must have these...
 */
export interface DocumentationSymbolBase extends DocumentationComment {
  name: string
  declaration?: DocumentationDeclaration
  /** Raw [[ts.SymbolFlags]] from TypeScript. For ease of debugging. */
  _symbolFlags: number
}

export interface DocumentationDeclaration {
  module: string
  line: number
  character: number
}

export interface DocumentationType {
  typeString: string
  typeInfo: TypeInfo
  /** Raw [[ts.TypeFlags]] from TypeScript. For ease of debugging. */
  _typeFlags: number
  /** Raw [[ts.ObjectFlags]] from TypeScript. For ease of debugging. */
  _objectFlags: number
}

/**
 * A symbol may have a type.
 */
export interface DocumentationTypedSymbol extends DocumentationSymbolBase, DocumentationType {
}

export interface DocumentationModule extends DocumentationSymbolBase {
  kind: 'module'
  exportedSymbols: { [name: string]: string }
}

export interface DocumentationValueSymbol extends DocumentationTypedSymbol {
  kind: 'value'
}

export interface DocumentationFunctionSymbol extends DocumentationTypedSymbol {
  kind: 'function'
  callSignatures: DocumentationSignature[]
}

export interface DocumentationClassSymbol extends DocumentationTypedSymbol {
  kind: 'class'
  constructSignatures: DocumentationSignature[]
  instanceMembers: { [name: string]: string }
  classMembers: { [name: string]: string }
  bases: string[]
}

export interface DocumentationSignature extends DocumentationComment {
  parameters: DocumentationSymbolBase[]
  returnType: string
}

export interface OtherTypeInfo {
  kind: 'other'
  text: string
}

export interface SymbolReferenceTypeInfo {
  kind: 'symbol'
  symbol: string
}

export interface TypeReferenceTypeInfo {
  kind: 'lol no generics'
  target: TypeInfo
  typeArguments: TypeInfo
}
