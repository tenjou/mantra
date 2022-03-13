import { Identifier } from "./node"

export type Any =
    | NumberKeyword
    | StringKeyword
    | BooleanKeyword
    | VoidKeyword
    | TypeReference
    | Literal
    | PropertySignature
    | Function
    | ArrayType
    | QualifiedName
    | Union
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

export interface Function extends TypeNode {
    kind: "FunctionType"
    type: Any
    params: Parameter[]
}

export interface PropertySignature extends TypeNode {
    kind: "PropertySignature"
    name: Identifier
    type: Any
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

export interface StringKeyword extends TypeNode {
    kind: "StringKeyword"
}

export interface NumberKeyword extends TypeNode {
    kind: "NumberKeyword"
}

export interface BooleanKeyword extends TypeNode {
    kind: "BooleanKeyword"
}

export interface VoidKeyword extends TypeNode {
    kind: "VoidKeyword"
}

export interface TypeNode {
    start: number
    end: number
}
