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
    params: Parameter[] | null
    flags: number
}

export interface Union {
    name: string
    kind: Kind.union
    types: Any[]
}

export interface Array {
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
    flags: number
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
    typeParameter: Any
    type: Any
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

export function createType(name: string, params: Parameter[] | null = null, type: Any = coreAliases.unknown): Type {
    return { name, kind: Kind.type, params, type, flags: 0 }
}

export function createUnion(name: string, types: Any[]): Union {
    return { name, kind: Kind.union, types }
}

export function createMappedType(typeParameter: Any, type: Any): Mapped {
    return { kind: Kind.mapped, typeParameter, type }
}

export function createArray(elementType: Any): Array {
    return { kind: Kind.array, elementType }
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

export function getName(type: Any): string {
    switch (type.kind) {
        case Kind.array:
            return `${getName(type.elementType)}[]`

        case Kind.function: {
            const returnOutput = getName(type.returnType)

            let paramsOutput = ""
            for (const param of type.params) {
                if (paramsOutput) {
                    paramsOutput += `, ${param.name}: ${param.name}`
                } else {
                    paramsOutput = `${param.name}: ${param.name}`
                }
            }

            return `(${paramsOutput}) => ${returnOutput}`
        }

        case Kind.enumMember:
            return `${type.enum.name}.${type.name}`

        case Kind.object: {
            let result = ""
            for (const member of type.members) {
                if (result) {
                    result += `, ${member.name}: ${getName(member.type)}`
                } else {
                    result = `${member.name}: ${getName(member.type)}`
                }
            }

            return result ? `{ ${result} }` : "{}"
        }

        case Kind.type: {
            if (type.params) {
                let paramOutput = ""
                for (const param of type.params) {
                    if (paramOutput) {
                        paramOutput += `, ${getName(param.type)}`
                    } else {
                        paramOutput = getName(param.type)
                    }
                }
                return `${type.name}<${paramOutput}>`
            }

            return type.name
        }

        case Kind.union: {
            let output = ""
            for (const entry of type.types) {
                if (output) {
                    output += ` | ${getName(entry)}`
                } else {
                    output = getName(entry)
                }
            }

            return output
        }

        case Kind.mapped: {
            return ""
        }
    }

    return type.name
}
