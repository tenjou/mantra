export enum TypeKind {
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
}

export const TypeKindNamed = Object.keys(TypeKind)

export enum Flags {
    None,
    Checked,
    Const,
    Exported,
}

export const coreTypeAliases = {
    unknown: createType("unknown", TypeKind.unknown),
    number: createType("number", TypeKind.number),
    string: createType("string", TypeKind.string),
    boolean: createType("boolean", TypeKind.boolean),
    void: createType("void", TypeKind.void),
    args: createType("args", TypeKind.args),
}

export const coreTypeRefs = {
    unknown: { type: coreTypeAliases.unknown, flags: 0 },
    number: { type: coreTypeAliases.number, flags: 0 },
    string: { type: coreTypeAliases.string, flags: 0 },
    boolean: { type: coreTypeAliases.boolean, flags: 0 },
    void: { type: coreTypeAliases.void, flags: 0 },
    args: { type: coreTypeAliases.args, flags: 0 },
}

export function createType(name, kind) {
    return { name, kind }
}

export function loadCoreTypes(ctx) {
    ctx.typeAliases = {
        ...coreTypeAliases,
    }
}

export function createVar(type) {
    return { type, flags: 0 }
}

export function createRef(type, name = null) {
    return { type, flags: 0, name }
}

export function createObject(name, members = {}) {
    const type = { name: name || "{}", kind: TypeKind.object, members }

    return { type, flags: 0 }
}

export function createFunction(name, args, returnType = null) {
    let argsMin = 0
    let argsMax = 0

    for (let n = 0; n < args.length; n++) {
        const arg = args[n]
        if (arg.kind !== TypeKind.args) {
            argsMin++
            argsMax++
        } else {
            argsMax = Number.MAX_SAFE_INTEGER
        }
    }

    const type = { name: "function", kind: TypeKind.function, args, argsMin, argsMax, returnType }

    return { name, type, flags: 0 }
}

export function createArg(name, type) {
    return { name, type, flags: 0 }
}

export function createUnion(name, types) {
    return { name, kind: TypeKind.union, types }
}

export function createArray(elementType) {
    const type = { name: "array", kind: TypeKind.array, elementType }

    return { type, flags: 0 }
}

export function createModule(program, fileDir, fileName, input, alias) {
    return {
        program,
        fileDir,
        fileName,
        input,
        alias,
        order: 0,
    }
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

    if (leftType.kind === TypeKind.array) {
        if (rightType.kind !== TypeKind.array) {
            return false
        }

        return isValidType(leftType.elementType, rightType.elementType)
    }

    return leftType === rightType
}
