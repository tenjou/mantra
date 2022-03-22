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
    null,
    void,
    args,
    enum,
    enumMember,
    mapped,
}

type DefaultKind = Kind.unknown | Kind.boolean | Kind.null | Kind.void | Kind.args
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

export interface Enum {
    name: string
    kind: Kind.enum
    enumType: Kind.number | Kind.string
    membersDict: Record<string, Reference>
}

export interface EnumMember {
    name: string
    kind: Kind.enumMember
    enum: Enum
}

export interface Mapped {
    kind: Kind.mapped
    name: string
    params: Parameter[] | null
}

export interface Object {
    kind: ObjectKind
    name: string
    members: Reference[]
    membersDict: Record<string, Reference>
}

export interface Parameter {
    name: string
    type: Any
}

export type Any = Default | Union | Array | Function | Object | Enum | EnumMember | Mapped

export interface Reference {
    name: string
    type: Any
    flags: number
}

export const TypeKindNamed = Object.keys(Kind)

export function createType(name: string, kind: DefaultKind): Default {
    return { name, kind }
}

export function createUnion(name: string, types: Any[]): Union {
    return { name, kind: Kind.union, types }
}
