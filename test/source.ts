export enum Kind {
    unknown,
    number,
    string,
    boolean,
    function,
    array,
    object,
    type,
    union,
    void,
    args,
    enum,
    enumMember,
    interface,
    mapped,
}

type DefaultKind = Kind.unknown | Kind.boolean | Kind.void | Kind.args
type ObjectKind = Kind.object | Kind.string | Kind.number | Kind.boolean

export interface Default {
    name: string
    kind: DefaultKind
}

export interface Union {
    name: string
    kind: Kind.union
    types: Any[]
}

export interface Array {
    name: string
    kind: Kind.array
    elementType: Any
}

export interface Function {
    name: string
    kind: Kind.function
    params: Any[]
    returnType: Any
    argsMin: number
    argsMax: number
}

export interface Object {
    kind: ObjectKind
    name: string
    members: Record<string, Reference>
}

export interface Enum {
    name: string
    kind: Kind.enum
    enumType: Kind.number | Kind.string
    members: Record<string, Reference>
}

export interface EnumMember {
    name: string
    kind: Kind.enumMember
    enum: Enum
}

export interface Reference {
    name: string
    type: Any
    flags: number
}

export type Any = Default | Union | Array | Function | Object | Enum | EnumMember
