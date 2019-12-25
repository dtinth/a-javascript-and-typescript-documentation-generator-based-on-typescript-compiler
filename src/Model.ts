import ts from 'typescript'

export interface Model {
  entryModules: string[]
  symbols: SymbolData[]
}

export interface SymbolData {
  id: string
  name: string
  flags: string[]
  documentationComment: ts.SymbolDisplayPart[]
  jsDocTags: ts.JSDocTagInfo[]
  exports?: NamedSymbolInfo[]
  declarations?: DeclarationInfo[]
  type?: TypeInfo
  static?: TypeInfo
}

export interface NamedSymbolInfo {
  name: string
  symbol: string
}

export interface TypeInfo {
  parts: TypeLinkPart[]
  flags: string[]
  callSignatures?: SignatureInfo[]
  constructSignatures?: SignatureInfo[]
  properties?: PropertyInfo[]
}

export type TypeLinkPart = string | [string, string]

export interface PropertyInfo extends NamedSymbolInfo {
  inherited: boolean
  // TODO: optional
}

export interface ParameterInfo extends NamedSymbolInfo {
  // TODO: optional
}

export interface SignatureInfo {
  declaration?: DeclarationInfo
  documentationComment: ts.SymbolDisplayPart[]
  jsDocTags: ts.JSDocTagInfo[]
  parameters: ParameterInfo[]
  returnType: TypeInfo
}

export interface DeclarationInfo {
  line: number
  character: number
  position: number
  fileName: string
  moduleSymbol?: string
}
