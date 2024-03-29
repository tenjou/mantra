import { Identifier } from "./node"

export type Any =
    | NumberKeyword
    | StringKeyword
    | BooleanKeyword
    | NullKeyword
    | VoidKeyword
    | UndefinedKeyword
    | NeverKeyword
    | TypeReference
    | TypeParameter
    | TypeOperator
    | IndexedAccessType
    | Literal
    | PropertySignature
    | Function
    | ArrayType
    | MappedType
    | QualifiedName
    | Union
    | Parameter
export type Kind = Any["kind"]

export interface ArrayType extends TypeNode {
    kind: "ArrayType"
    elementType: Any
}

export interface QualifiedName extends TypeNode {
    kind: "QualifiedName"
    left: Identifier
    right: Identifier
}

export interface Union extends TypeNode {
    kind: "UnionType"
    types: Any[]
}

export interface Parameter extends TypeNode {
    kind: "Parameter"
    name: Identifier
    type: Any
}

export interface TypeParameter extends TypeNode {
    kind: "TypeParameter"
    name: Identifier
    constraint: Any | null
}

export interface TypeOperator extends TypeNode {
    kind: "TypeOperator"
    type: Any
}

export interface Function extends TypeNode {
    kind: "FunctionType"
    type: Any
    params: Parameter[]
}

export interface PropertySignature extends TypeNode {
    kind: "PropertySignature"
    name: Identifier
    type: Any
    isOptional: boolean
}

export interface MappedType extends TypeNode {
    kind: "MappedType"
    typeParam: TypeParameter
    type: Any
    isOptional: boolean
}

export interface Literal extends TypeNode {
    kind: "TypeLiteral"
    members: PropertySignature[]
}

export interface TypeReference extends TypeNode {
    kind: "TypeReference"
    name: Identifier
    typeArgs: Any[] | null
}

export interface IndexedAccessType extends TypeNode {
    kind: "IndexedAccessType"
    objectType: Identifier
    indexType: Any
}

export interface StringKeyword extends TypeNode {
    kind: "StringKeyword"
}

export interface NumberKeyword extends TypeNode {
    kind: "NumberKeyword"
}

export interface BooleanKeyword extends TypeNode {
    kind: "BooleanKeyword"
}

export interface NullKeyword extends TypeNode {
    kind: "NullKeyword"
}

export interface VoidKeyword extends TypeNode {
    kind: "VoidKeyword"
}

export interface UndefinedKeyword extends TypeNode {
    kind: "UndefinedKeyword"
}

export interface NeverKeyword extends TypeNode {
    kind: "NeverKeyword"
}

export interface TypeNode {
    start: number
    end: number
}
