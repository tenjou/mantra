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
}

type DefaultKind = Kind.unknown | Kind.boolean | Kind.void | Kind.args | Kind.enum
type ObjectKind = Kind.object | Kind.string | Kind.number

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
}

export interface Object {
    name: string
    kind: ObjectKind
    members: Record<string, Reference>
}

export type Any = Default | Union | Array | Function | Object

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

export function createArray(name: string, elementType: Any): Array {
    return { name, kind: Kind.array, elementType }
}

export function createFunction(name: string, params: Any[], returnType: Any): Function {
    return { name, kind: Kind.function, params, returnType }
}

export function createFunctionRef(name: string, params: Any[], returnType: Any) {
    return createRef(name, createFunction(name, params, returnType))
}

export function createObject(name: string, members: Record<string, Reference>, kind: ObjectKind = Kind.object): Object {
    return { name, kind, members }
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
    boolean: createType("boolean", Kind.boolean),
    void: createType("void", Kind.void),
    args: createType("args", Kind.args),
    object: createObject("object", {}),
    enum: createType("enum", Kind.enum),
}

export const coreRefs: Record<string, Reference> = {
    unknown: createRef("unknown", coreAliases.unknown, 0),
    number: createRef("number", coreAliases.number, 0),
    string: createRef("string", coreAliases.string, 0),
    boolean: createRef("boolean", coreAliases.boolean, 0),
    void: createRef("void", coreAliases.void, 0),
    args: createRef("args", coreAliases.args, 0),
}

// export function loadCoreTypes(ctx) {
//     ctx.typeAliases = {
//         ...coreTypeAliases,
//     }
// }

// export function createEnum(name, enumType, members = {}, values = {}) {
//     const type = { name: name || "enum", kind: TypeKind.enum, enumType, members, values }

//     return { type, flags: 0 }
// }

// export function createFunction(name, args, returnType = null) {
//     let argsMin = 0
//     let argsMax = 0

//     for (let n = 0; n < args.length; n++) {
//         const arg = args[n]
//         if (arg.kind !== TypeKind.args) {
//             argsMin++
//             argsMax++
//         } else {
//             argsMax = Number.MAX_SAFE_INTEGER
//         }
//     }

//     const type = { name, kind: TypeKind.function, args, argsMin, argsMax, returnType }
//     return type
// }

// export function createArg(name, type) {
//     return { name, type, flags: 0 }
// }
