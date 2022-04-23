export enum Kind {
    unknown,
    undef,
    number,
    string,
    boolean,
    function,
    array,
    object,
    class,
    type,
    union,
    null,
    void,
    never,
    args,
    enum,
    enumMember,
    mapped,
    parameter,
}

type DefaultKind = Kind.unknown | Kind.undef | Kind.boolean | Kind.null | Kind.void | Kind.never | Kind.args
type ObjectKind = Kind.object | Kind.string | Kind.number | Kind.boolean

export interface Default {
    name: string
    kind: DefaultKind
    param: string | null
}

export interface Type {
    name: string
    kind: Kind.type
    type: Any
    params: Parameter[] | null
    param: string | null
    flags: number
}

export interface Union {
    kind: Kind.union
    types: Any[]
    param: string | null
}

export interface Array {
    kind: Kind.array
    elementType: Any
    param: string | null
}

export interface Function {
    name: string
    kind: Kind.function
    params: Parameter[]
    returnType: Any
    argsMin: number
    argsMax: number
    param: string | null
    flags: number
}

export interface Enum {
    name: string
    kind: Kind.enum
    enumType: Kind.number | Kind.string
    membersDict: Record<string, Reference>
    param: string | null
}

export interface EnumMember {
    kind: Kind.enumMember
    enum: Enum
    name: string
    value: string | number
    param: string | null
}

export interface Mapped {
    kind: Kind.mapped
    typeParameter: Any
    type: Any
    param: string | null
}

export interface Object {
    kind: ObjectKind
    name: string
    members: Reference[]
    membersDict: Record<string, Reference>
    param: string | null
    flags: number
}

export interface Class {
    kind: Kind.class
    name: string
    constructorFunc: Function
}

export interface ObjectMember {
    key: Reference
    value: Reference
    param: string | null
}

export interface Parameter {
    kind: Kind.parameter
    name: string
    constraint: Any
    flags: number
}

export type Any = Default | Type | Union | Array | Function | Object | Class | Enum | EnumMember | Mapped | Parameter

export interface Reference {
    name: string
    type: Any
    flags: number
}

export const TypeKindNamed = Object.keys(Kind)

export function createDefaultType(name: string, kind: DefaultKind): Default {
    return { name, kind, param: null }
}

export function createType(name: string, params: Parameter[] | null = null, type: Any = coreAliases.unknown): Type {
    return { name, kind: Kind.type, params, type, param: null, flags: 0 }
}

export function createParameter(name: string, constraint: Any, flags: number = 0): Parameter {
    return {
        kind: Kind.parameter,
        name,
        constraint,
        flags,
    }
}

export function createUnion(types: Any[]): Union {
    return { kind: Kind.union, types, param: null }
}

export function createMappedType(typeParameter: Any, type: Any): Mapped {
    return { kind: Kind.mapped, typeParameter, type, param: null }
}

export function createArray(elementType: Any): Array {
    return { kind: Kind.array, elementType, param: null }
}

export function createEnum(name: string, enumType: Kind.number | Kind.string, membersDict: Record<string, Reference>): Enum {
    return { name, kind: Kind.enum, enumType, membersDict, param: null }
}

export function createEnumMember(srcEnum: Enum, name: string, value: string | number): EnumMember {
    return { kind: Kind.enumMember, enum: srcEnum, name, value, param: null }
}

export function createFunction(name: string, params: Parameter[], returnType: Any, argsMin: number = params.length): Function {
    return { name, kind: Kind.function, params, returnType, argsMin, argsMax: params.length, param: null, flags: 0 }
}

export function createFunctionRef(name: string, paramsDict: Record<string, Any>, returnType: Any): Reference {
    const params: Parameter[] = []
    for (const paramName in paramsDict) {
        const paramType = paramsDict[paramName]
        params.push({
            kind: Kind.parameter,
            name: paramName,
            constraint: paramType,
            flags: 0,
        })
    }

    return createRef(name, createFunction(name, params, returnType), 0)
}

export function createObject(name: string, members: Reference[], kind: ObjectKind = Kind.object): Object {
    const membersDict: Record<string, Reference> = {}
    for (const member of members) {
        membersDict[member.name] = member
    }

    return { kind, name, members, membersDict, param: null, flags: 0 }
}

export function createObjectRef(name: string, members: Reference[], kind: ObjectKind = Kind.object): Reference {
    return { name, type: createObject(name, members, kind), flags: 0 }
}

export function createClass(name: string, constructorFunc: Function): Class {
    return {
        kind: Kind.class,
        name,
        constructorFunc,
    }
}

export function createClassRef(name: string, constructorFunc: Function): Reference {
    return {
        name,
        type: createClass(name, constructorFunc),
        flags: 0,
    }
}

export function createConstructor(params: Parameter[], argsMin: number = params.length): Function {
    return createFunction("constructor", params, coreAliases.void, argsMin)
}

export function createRef(name: string, type: Any, flags: number = 0): Reference {
    return { name, type, flags }
}

const numberType = createObject("Number", [], Kind.number)
const stringType = createObject("String", [createFunctionRef("charCodeAt", { index: numberType }, numberType)], Kind.string)

export const coreAliases: Record<string, Any> = {
    unknown: createDefaultType("unknown", Kind.unknown),
    undef: createDefaultType("undefined", Kind.undef),
    number: numberType,
    string: stringType,
    boolean: createObject("boolean", [], Kind.boolean),
    null: createDefaultType("null", Kind.null),
    void: createDefaultType("void", Kind.void),
    args: createDefaultType("args", Kind.args),
    object: createObject("object", []),
    never: createDefaultType("never", Kind.never),
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
            return type.name ? type.name : "{}"
            // let result = ""
            // for (const member of type.members) {
            //     if (result) {
            //         result += `, ${member.name}: ${getName(member.type)}`
            //     } else {
            //         result = `${member.name}: ${getName(member.type)}`
            //     }
            // }

            // return result ? `{ ${result} }` : "{}"
        }

        case Kind.type: {
            if (type.params) {
                let paramOutput = ""
                for (const param of type.params) {
                    if (paramOutput) {
                        paramOutput += `, ${getName(param.constraint)}`
                    } else {
                        paramOutput = getName(param.constraint)
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
            return `<${getName(type.typeParameter)}, ${getName(type.type)}>`
        }
    }

    return type.name
}
