import { raiseAt } from "./error.js"

export const TypeKind = {
    Unknown: 0,
    Number: 1,
    String: 2,
    Boolean: 3,
    Function: 4,
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
}

function createType(kind, flags = 0) {
    return { kind, flags }
}

export function loadCoreTypes(ctx) {
    ctx.types = {
        ...coreTypes,
    }
}

export function useType(ctx, node, flags = 0) {
    if (node.type) {
        const type = coreTypes[node.type.value]
        if (!type) {
            raiseAt(ctx, node.start, `Cannot find name '${node.type}'`)
        }

        return createType(type.kind, flags)
    }

    return createType(TypeKind.Unknown, flags)
}
