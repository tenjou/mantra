import { FunctionParams } from "./node"

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
    | Union
export type Kind = Any["kind"]

export interface ArrayType extends TypeNode {
    kind: "ArrayType"
    elementType: Any
}

export interface Union extends TypeNode {
    kind: "UnionType"
    types: Any[]
}

export interface Function extends TypeNode {
    kind: "FunctionType"
    type: Any
    params: FunctionParams
}

export interface PropertySignature extends TypeNode {
    kind: "PropertySignature"
    name: string
    type: Any
}

export interface Literal extends TypeNode {
    kind: "TypeLiteral"
    members: PropertySignature[]
}

export interface TypeReference extends TypeNode {
    kind: "TypeReference"
    name: string
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
