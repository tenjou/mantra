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
    interface,
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
    members: Record<string, Reference>
}

export interface EnumMember {
    name: string
    kind: Kind.enumMember
    enum: Enum
}

export interface Interface {
    kind: Kind.interface
    name: string
    members: Reference[]
}

export interface Mapped {
    kind: Kind.mapped
    name: string
    params: Parameter[] | null
}

export interface Object {
    kind: ObjectKind
    name: string
    members: Record<string, Reference>
}

export interface Parameter {
    name: string
    type: Any
}

export type Any = Default | Union | Array | Function | Object | Enum | EnumMember | Interface | Mapped

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

export function createInterface(name: string, members: Reference[]): Interface {
    return { kind: Kind.interface, name, members }
}

export function createMappedType(name: string, params: Parameter[] | null): Mapped {
    return { name, kind: Kind.mapped, params }
}

export function createArray(name: string, elementType: Any): Array {
    return { name, kind: Kind.array, elementType }
}

export function createEnum(name: string, enumType: Kind.number | Kind.string, members: Record<string, Reference>): Enum {
    return { name, kind: Kind.enum, enumType, members }
}

export function createEnumMember(name: string, srcEnum: Enum): EnumMember {
    return { name, kind: Kind.enumMember, enum: srcEnum }
}

export function createFunction(name: string, params: Any[], returnType: Any): Function {
    return { name, kind: Kind.function, params, returnType, argsMin: params.length, argsMax: params.length }
}

export function createFunctionRef(name: string, params: Any[], returnType: Any): Reference {
    return createRef(name, createFunction(name, params, returnType))
}

export function createObject(name: string, members: Record<string, Reference>, kind: ObjectKind = Kind.object): Object {
    return { kind, name, members }
}

export function createObjectRef(name: string, members: Record<string, Reference>, kind: ObjectKind = Kind.object): Reference {
    return { name, type: createObject(name, members, kind), flags: 0 }
}

export function createRef(name: string, type: Any, flags: number = 0): Reference {
    return { name, type, flags }
}

const numberType = createObject("Number", {}, Kind.number)

export const coreAliases: Record<string, Any> = {
    unknown: createType("unknown", Kind.unknown),
    number: numberType,
    string: createObject(
        "String",
        {
            charCodeAt: createFunctionRef("charCodeAt", [numberType], numberType),
        },
        Kind.string
    ),
    boolean: createObject("boolean", {}, Kind.boolean),
    null: createType("null", Kind.null),
    void: createType("void", Kind.void),
    args: createType("args", Kind.args),
    object: createObject("object", {}),
}

export const coreRefs: Record<string, Reference> = {
    unknown: createRef("unknown", coreAliases.unknown, 0),
    number: createRef("number", coreAliases.number, 0),
    string: createRef("string", coreAliases.string, 0),
    boolean: createRef("boolean", coreAliases.boolean, 0),
    void: createRef("void", coreAliases.void, 0),
    args: createRef("args", coreAliases.args, 0),
}
