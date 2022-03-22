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

export enum Flag {
    None = 0,
    Resolved = 1,
}

type DefaultKind = Kind.unknown | Kind.boolean | Kind.null | Kind.void | Kind.args
type ObjectKind = Kind.object | Kind.string | Kind.number | Kind.boolean

export interface Default {
    name: string
    kind: DefaultKind
}

export interface Type {
    name: string
    kind: Kind.type
    type: Any
    flags: number
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
    params: Parameter[]
    returnType: Any
    argsMin: number
    argsMax: number
    flags: 0
}
