function createType(kind) {
    return { kind }
}

export const coreTypes = {
    number: createType("number"),
    string: createType("string"),
    boolean: createType("boolean"),
}

export function loadCoreTypes(ctx) {
    ctx.types = {
        ...coreTypes,
    }
}

export function useType(ctx, type) {
    if (!type) {
        return null
    }

    return ctx.types[type.kind] || null
}
