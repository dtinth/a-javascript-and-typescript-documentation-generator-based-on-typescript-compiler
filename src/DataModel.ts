/**
 * Documentation JSON-compatible model
 * @module
 */

/**
 * The JSON emitted by the documentation.
 */
export interface Documentation {
  publicModules: string[]
  symbols: { [id: string]: Symbol }
}

/**
 * A symbol to be documented.
 */
export type Symbol = ModuleSymbol | ValueSymbol | FunctionSymbol | ClassSymbol

/**
 * Each symbol (and other stuffs) has a type.
 * Here’s how types are represented in the JSON.
 */
export type TypeInfo =
  | OtherTypeInfo
  | SymbolReferenceTypeInfo
  | TypeReferenceTypeInfo

/**
 * Textual comments for symbols, call signatures, ….
 */
export interface Comment {
  jsdoc: any
  comment: any
}

/**
 * Every DocumentationSymbol must have these...
 */
export interface BaseSymbol extends Comment {
  name: string
  declaration: Declaration | null
  /** Raw [[ts.SymbolFlags]] from TypeScript. For ease of debugging. */
  _symbolFlags: number
}

/**
 * Where something is declared.
 */
export interface Declaration {
  module: string
  line: number
  character: number
}

export interface Type {
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
export interface TypedSymbol extends BaseSymbol, Type {}

export interface ModuleSymbol extends BaseSymbol {
  kind: 'module'
  exportedSymbols: { [name: string]: string }
}

export interface ValueSymbol extends TypedSymbol {
  kind: 'value'
}

export interface FunctionSymbol extends TypedSymbol {
  kind: 'function'
  callSignatures: Signature[]
}

export interface ClassSymbol extends TypedSymbol {
  kind: 'class'
  constructSignatures: Signature[]
  instanceMembers: { [name: string]: string }
  classMembers: { [name: string]: string }
  bases: string[]
}

export interface Signature extends Comment {
  parameters: BaseSymbol[]
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
  kind: 'type reference'
  target: TypeInfo
  typeArguments: TypeInfo
}
