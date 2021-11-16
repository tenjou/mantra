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

export function tryCreateType(type = null, flags = 0) {
    return createType(type ? type.kind : TypeKind.Unknown, flags)
}
