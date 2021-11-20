import { raiseAt } from "./error.js"

export const TypeKind = {
    unknown: 0,
    number: 1,
    string: 2,
    boolean: 3,
    function: 4,
    object: 5,
    type: 6,
    union: 7,
    void: 8,
}

export const TypeKindNamed = Object.keys(TypeKind)

export const Flags = {
    None: 0,
    Checked: 1,
    Const: 2,
}

export const coreTypeAliases = {
    number: createType("number", TypeKind.number),
    string: createType("string", TypeKind.string),
    boolean: createType("boolean", TypeKind.boolean),
    void: createType("void", TypeKind.void),
}

export const coreTypeRefs = {
    number: { type: coreTypeAliases.number, flags: 0 },
    string: { type: coreTypeAliases.string, flags: 0 },
    boolean: { type: coreTypeAliases.boolean, flags: 0 },
    void: { type: coreTypeAliases.void, flags: 0 },
}

export function createType(name, kind) {
    return { name, kind }
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

export function createObject(name, members) {
    return { name: name || "object", kind: TypeKind.object, members }
}

export function createFunction(args, returnType = null) {
    return { name: "function", kind: TypeKind.function, args, argsMin: args.length, returnType }
}

export function createArg(name, kind) {
    return { name, kind }
}

export function createUnion(name, types) {
    return { name, kind: TypeKind.union, types }
}

export function isValidType(leftType, rightType) {
    if (leftType.kind === TypeKind.union) {
        for (const type of leftType.types) {
            if (isValidType(type, rightType)) {
                return true
            }
        }

        return false
    }

    return leftType === rightType
}
