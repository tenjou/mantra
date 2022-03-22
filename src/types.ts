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
    flags: number
}

export interface Parameter {
    name: string
    type: Any
}

export type Any = Default | Type | Union | Array | Function | Object | Enum | EnumMember | Mapped

export interface Reference {
    name: string
    type: Any
    flags: number
}

export const TypeKindNamed = Object.keys(Kind)

export function createDefaultType(name: string, kind: DefaultKind): Default {
    return { name, kind }
}

export function createType(name: string): Type {
    return { name, kind: Kind.type, type: coreAliases.unknown, flags: 0 }
}

export function createUnion(name: string, types: Any[]): Union {
    return { name, kind: Kind.union, types }
}

export function createMappedType(name: string, params: Parameter[] | null): Mapped {
    return { name, kind: Kind.mapped, params }
}

export function createArray(elementType: Any, name: string = ""): Array {
    return { name, kind: Kind.array, elementType }
}

export function createEnum(name: string, enumType: Kind.number | Kind.string, membersDict: Record<string, Reference>): Enum {
    return { name, kind: Kind.enum, enumType, membersDict }
}

export function createEnumMember(name: string, srcEnum: Enum): EnumMember {
    return { name, kind: Kind.enumMember, enum: srcEnum }
}

export function createFunction(name: string, params: Parameter[], returnType: Any): Function {
    return { name, kind: Kind.function, params, returnType, argsMin: params.length, argsMax: params.length, flags: 0 }
}

export function createFunctionRef(name: string, paramsDict: Record<string, Any>, returnType: Any): Reference {
    const params: Parameter[] = []
    for (const paramName in paramsDict) {
        const paramType = paramsDict[paramName]
        params.push({
            name: paramName,
            type: paramType,
        })
    }

    return createRef(name, createFunction(name, params, returnType), 0)
}

export function createObject(name: string, members: Reference[], kind: ObjectKind = Kind.object): Object {
    const membersDict: Record<string, Reference> = {}
    for (const member of members) {
        membersDict[member.name] = member
    }

    return { kind, name, members, membersDict, flags: 0 }
}

export function createObjectRef(name: string, members: Reference[], kind: ObjectKind = Kind.object): Reference {
    return { name, type: createObject(name, members, kind), flags: 0 }
}

export function createRef(name: string, type: Any, flags: number = 0): Reference {
    return { name, type, flags }
}

export interface Scope {
    parent: Scope
    vars: Record<string, Reference>
    types: Record<string, Any>
    labels: []
}

const fakeParent = {} as Scope

export function createScope(parent: Scope | null = null): Scope {
    if (!parent) {
        parent = fakeParent
    }

    return {
        parent,
        vars: {},
        types: {},
        labels: [],
    }
}

const numberType = createObject("Number", [], Kind.number)

export const coreAliases: Record<string, Any> = {
    unknown: createDefaultType("unknown", Kind.unknown),
    number: numberType,
    string: createObject("String", [createFunctionRef("charCodeAt", { index: numberType }, numberType)], Kind.string),
    boolean: createObject("boolean", [], Kind.boolean),
    null: createDefaultType("null", Kind.null),
    void: createDefaultType("void", Kind.void),
    args: createDefaultType("args", Kind.args),
    object: createObject("object", []),
}

export const coreRefs: Record<string, Reference> = {
    unknown: createRef("unknown", coreAliases.unknown, 0),
    number: createRef("number", coreAliases.number, 0),
    string: createRef("string", coreAliases.string, 0),
    boolean: createRef("boolean", coreAliases.boolean, 0),
    void: createRef("void", coreAliases.void, 0),
    args: createRef("args", coreAliases.args, 0),
}
