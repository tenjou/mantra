import { raiseAt } from "./error.js"

export const TypeKind = {
    Unknown: 0,
    Number: 1,
    String: 2,
    Boolean: 3,
    Function: 4,
    Void: 5,
}

export const TypeKindNamed = Object.keys(TypeKind)

export const Flags = {
    None: 0,
    Const: 1,
}

export const coreTypes = {
    number: createType(TypeKind.Number),
    string: createType(TypeKind.String),
    boolean: createType(TypeKind.Boolean),
    void: createType(TypeKind.Void),
}

export function createType(kind, flags = 0) {
    return { kind, flags }
}

export function loadCoreTypes(ctx) {
    ctx.types = {
        ...coreTypes,
    }
}

export function useType(ctx, pos, typeAnnotation, flags = 0) {
    if (typeAnnotation) {
        const type = coreTypes[typeAnnotation.value]
        if (!type) {
            raiseAt(ctx, pos, `Cannot find name '${typeAnnotation.value}'`)
        }

        return createType(type.kind, flags)
    }

    return createType(TypeKind.Unknown, flags)
}
