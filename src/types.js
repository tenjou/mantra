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
    number: createType(TypeKind.number),
    string: createType(TypeKind.string),
    boolean: createType(TypeKind.boolean),
    void: createType(TypeKind.void),
}

export function createType(kind, flags = 0) {
    return { kind, flags }
}

export function loadCoreTypes(ctx) {
    ctx.typeAliases = {
        ...coreTypeAliases,
    }
}

export function useType(ctx, pos, typeAnnotation, flags = 0) {
    if (typeAnnotation) {
        const type = ctx.typeAliases[typeAnnotation.value]
        if (!type) {
            raiseAt(ctx, pos, `Cannot find name '${typeAnnotation.value}'`)
        }

        return createType(type.kind, flags)
    }

    return createType(TypeKind.unknown, flags)
}

export function createObject(name, props, flags = 0) {
    return { kind: TypeKind.object, name, flags, props }
}

export function createFunction(args, returnType = null, flags = 0) {
    return { kind: TypeKind.function, flags, args, argsMin: args.length, returnType }
}

export function createArg(name, kind, flags = 0) {
    return { name, kind, flags }
}
