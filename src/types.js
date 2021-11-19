import { raiseAt } from "./error.js"

export const TypeKind = {
    unknown: 0,
    number: 1,
    string: 2,
    boolean: 3,
    function: 4,
    object: 5,
    type: 6,
    void: 7,
}

export const TypeKindNamed = Object.keys(TypeKind)

export const Flags = {
    None: 0,
    Const: 1,
}

export const coreTypeAliases = {
    number: createType("number", TypeKind.number),
    string: createType("string", TypeKind.string),
    boolean: createType("boolean", TypeKind.boolean),
    void: createType("void", TypeKind.void),
}

export function createType(name, kind, flags = 0) {
    return { name, kind, flags }
}

export function loadCoreTypes(ctx) {
    ctx.typeAliases = {
        ...coreTypeAliases,
    }
}

export function useType(ctx, pos, typeAnnotation, flags = 0) {
    if (typeAnnotation) {
        const type = ctx.typeAliases[typeAnnotation.name]
        if (!type) {
            raiseAt(ctx, pos, `Cannot find name '${typeAnnotation.name}'`)
        }

        return {
            type,
            flags,
        }
    }

    return {
        type: null,
        flags,
    }
}

export function createObject(name, members, flags = 0) {
    return { kind: TypeKind.object, name, flags, members }
}

export function createFunction(args, returnType = null, flags = 0) {
    return { kind: TypeKind.function, flags, args, argsMin: args.length, returnType }
}

export function createArg(name, kind, flags = 0) {
    return { name, kind, flags }
}
