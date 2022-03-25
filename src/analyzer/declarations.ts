import { raiseAt } from "../error"
import * as Node from "../parser/node"
import * as TypeNode from "../parser/type-node"
import { createScope, FunctionTypeDeclaration, TypeDeclaration } from "../scope"
import * as Type from "../types"
import { Context } from "./context"

export function handleDeclaration(ctx: Context, node: Node.Statement): void {
    switch (node.kind) {
        case "FunctionDeclaration":
            declareFunction(ctx, node)
            break

        case "InterfaceDeclaration":
            declareInterface(ctx, node)
            break

        case "TypeAliasDeclaration":
            declareTypeAlias(ctx, node)
            break

        case "ExportNamedDeclaration":
            declareExport(ctx, node)
            break

        case "EnumDeclaration":
            declareEnum(ctx, node)
            break
    }
}

function declareExport(ctx: Context, node: Node.ExportNamedDeclaration): void {
    handleDeclaration(ctx, node.declaration)
}

function declareTypeAlias(ctx: Context, node: Node.TypeAliasDeclaration): void {
    if (ctx.scope.types[node.id.value]) {
        raiseAt(ctx.module, node.start, `Duplicate identifier '${node.id.value}'`)
    }

    const type = Type.createType(node.id.value)
    ctx.resolvingTypes[node.id.value] = {
        kind: Type.Kind.type,
        type,
        node,
    }
    ctx.scopeCurr.types[node.id.value] = type
}

function declareInterface(ctx: Context, node: Node.InterfaceDeclaration): void {
    if (ctx.scope.types[node.name.value]) {
        raiseAt(ctx.module, node.start, `Duplicate identifier '${node.name.value}'`)
    }

    const type = Type.createObject(node.name.value, [])
    ctx.resolvingTypes[node.name.value] = {
        kind: Type.Kind.object,
        type,
        node,
    }
    ctx.scopeCurr.types[type.name] = type
}

function declareFunction(ctx: Context, node: Node.FunctionDeclaration): void {
    if (node.id) {
        if (ctx.scopeCurr.vars[node.id.value]) {
            raiseAt(ctx.module, node.id.start, `Duplicate function implementation '${node.id.value}'`)
        }

        const type = Type.createFunction(node.id.value, [], Type.coreAliases.unknown)
        const funcDecl: FunctionTypeDeclaration = {
            kind: Type.Kind.function,
            type,
            node,
        }

        ctx.resolvingTypes[node.id.value] = funcDecl
        ctx.scopeCurr.funcs.push(funcDecl)
        ctx.scopeCurr.vars[node.id.value] = Type.createRef(node.id.value, type)
    }
}

export function resolveDeclaration(ctx: Context, typeDecl: TypeDeclaration): Type.Any {
    if (typeDecl.type.flags & Type.Flag.Resolved) {
        return typeDecl.type
    }

    switch (typeDecl.kind) {
        case Type.Kind.function:
            resolveFunction(ctx, typeDecl.node, typeDecl.type)
            break

        case Type.Kind.object:
            resolveInterface(ctx, typeDecl.node, typeDecl.type)
            break

        case Type.Kind.type:
            resolveTypeAlias(ctx, typeDecl.node, typeDecl.type)
            break
    }

    return typeDecl.type
}

export function resolveFunctionParams(ctx: Context, nodeParams: Node.Parameter[], type: Type.Function): void {
    let argsMin = 0
    let argsMax = nodeParams.length

    type.params.length = argsMax

    for (let n = 0; n < nodeParams.length; n++) {
        const nodeParam = nodeParams[n]
        const paramType = handleType(ctx, nodeParam.type)

        if (!nodeParam.initializer) {
            argsMin = n + 1
        }

        type.params[n] = {
            name: nodeParam.id.value,
            type: paramType,
        }
    }

    type.argsMin = argsMin
    type.argsMax = argsMax
}

function resolveFunction(ctx: Context, node: Node.FunctionDeclaration, type: Type.Function): void {
    type.returnType = handleType(ctx, node.returnType)
}

function resolveInterface(ctx: Context, node: Node.InterfaceDeclaration, type: Type.Object): void {
    type.flags |= Type.Flag.Resolved

    const nodeMembers = node.members
    type.members.length = nodeMembers.length

    for (let n = 0; n < nodeMembers.length; n++) {
        const nodeMember = nodeMembers[n]
        const memberType = handleType(ctx, nodeMember.type, nodeMember.name.value)
        const ref = Type.createRef(nodeMember.name.value, memberType)
        type.members[n] = ref
        type.membersDict[ref.name] = ref
    }
}

function resolveTypeAlias(ctx: Context, node: Node.TypeAliasDeclaration, typeAlias: Type.Type): void {
    let params: Type.Parameter[] | null = null
    if (node.typeParams) {
        const typeParams = node.typeParams
        params = new Array(typeParams.length)

        for (let n = 0; n < typeParams.length; n++) {
            const typeParam = typeParams[n]
            const constaint = handleType(ctx, typeParam.constraint)
            params[n] = {
                name: typeParam.name.value,
                type: constaint,
            }
        }
    }

    typeAlias.type = handleType(ctx, node.type, "", params)
    typeAlias.flags |= Type.Flag.Resolved
}

function getEnumType(ctx: Context, members: Node.EnumMember[]): Type.Kind.number | Type.Kind.string {
    let enumType = Type.Kind.unknown

    for (const member of members) {
        if (!member.initializer) {
            continue
        }

        switch (member.initializer.kind) {
            case "NumericLiteral":
                return Type.Kind.number

            case "Literal":
                return Type.Kind.string

            default:
                raiseAt(ctx.module, member.start, `Enums can only have numeric or string values`)
        }
    }

    return enumType || Type.Kind.number
}

function declareEnum(ctx: Context, node: Node.EnumDeclaration): void {
    const contentType = getEnumType(ctx, node.members)

    ctx.scopeCurr = createScope(ctx.scopeCurr)

    const members: Record<string, Type.Reference> = {}
    const values: Record<string, boolean> = {}

    const enumDef = Type.createEnum(node.name.value, contentType, members)

    switch (contentType) {
        case Type.Kind.string:
            for (const member of node.members) {
                if (!member.initializer) {
                    raiseAt(ctx.module, member.start, `Enum member must have initializer`)
                }
                if (member.initializer.kind !== "Literal") {
                    raiseAt(ctx.module, member.initializer.start, `String literal enums can only have literal values`)
                }
                if (members[member.name.value]) {
                    raiseAt(ctx.module, member.start, `Duplicate identifier '${member.name.value}'`)
                }

                members[member.name.value] = Type.createRef(member.name.value, Type.createEnumMember(member.name.value, enumDef))
                values[member.initializer.value] = true
            }
            break

        default: {
            let index = 0
            for (const member of node.members) {
                if (member.initializer) {
                    if (member.initializer.kind !== "NumericLiteral") {
                        raiseAt(ctx.module, member.initializer.start, `Numeric enums can only have numeric values`)
                    }
                }

                if (members[member.name.value]) {
                    raiseAt(ctx.module, member.start, `Duplicate identifier '${member.name.value}'`)
                }

                if (member.initializer) {
                    index = parseInt(member.initializer.value)
                }

                members[member.name.value] = Type.createRef(member.name.value, Type.createEnumMember(member.name.value, enumDef))
                values[index++] = true
            }
            break
        }
    }

    ctx.scope.vars[node.name.value] = Type.createRef(node.name.value, enumDef, 0)
    ctx.scope.types[node.name.value] = enumDef
}

function getType(ctx: Context, name: string): Type.Any | null {
    const typeDecl = ctx.resolvingTypes[name]
    if (typeDecl) {
        if (!(typeDecl.type.flags & Type.Flag.Resolved)) {
            return resolveDeclaration(ctx, typeDecl)
        }
    }

    let scope = ctx.scopeCurr
    let type = scope.types[name]
    if (type) {
        return type
    }

    do {
        scope = scope.parent
        type = scope.types[name]
        if (type) {
            return type
        }
    } while (scope !== ctx.scope)

    return null
}

export function handleType(ctx: Context, type: TypeNode.Any | null = null, name = "", params: Type.Parameter[] | null = null): Type.Any {
    if (!type) {
        return Type.coreAliases.unknown
    }

    switch (type.kind) {
        case "NumberKeyword":
            return Type.coreAliases.number

        case "StringKeyword":
            return Type.coreAliases.string

        case "BooleanKeyword":
            return Type.coreAliases.boolean

        case "NullKeyword":
            return Type.coreAliases.null

        case "VoidKeyword":
            return Type.coreAliases.void

        case "ArrayType": {
            const elementType = handleType(ctx, type.elementType)

            return Type.createArray(elementType)
        }

        case "UnionType": {
            const types: Type.Any[] = new Array(type.types.length)
            for (let n = 0; n < type.types.length; n++) {
                const entry = type.types[n]
                types[n] = handleType(ctx, entry)
            }

            return Type.createUnion(name, types)
        }

        case "QualifiedName": {
            const enumType = getType(ctx, type.left.value)
            if (!enumType || enumType.kind !== Type.Kind.enum) {
                raiseAt(ctx.module, type.start, "Unsupported type")
            }

            const enumMember = enumType.membersDict[type.right.value]
            if (!enumMember) {
                raiseAt(ctx.module, type.right.start, `Namespace '${type.left.value}' has no exported member '${type.right.value}'`)
            }
            return enumMember.type
        }

        case "FunctionType": {
            const params: Type.Parameter[] = new Array(type.params.length)
            for (let nParam = 0; nParam < type.params.length; nParam++) {
                const param = type.params[nParam]
                const paramType = handleType(ctx, param.type, param.name.value)
                if (!paramType) {
                    raiseAt(ctx.module, type.start, `Parameter '${param.name.value}' implicitly has an 'any' type.`)
                }

                params[nParam] = {
                    name: param.name.value,
                    type: paramType,
                }
            }

            const returnType = handleType(ctx, type.type)
            return Type.createFunction(name, params, returnType)
        }

        case "TypeLiteral": {
            const members: Type.Reference[] = new Array(type.members.length)
            for (let n = 0; n < type.members.length; n++) {
                const entry = type.members[n]
                const entryType = handleType(ctx, entry.type, "")
                members[n] = Type.createRef(entry.name.value, entryType)
            }

            return Type.createObject(name, members)
        }

        case "MappedType": {
            return Type.createMappedType(name, params)
        }

        default: {
            const typeFound = getType(ctx, type.name.value)
            if (!typeFound) {
                raiseAt(ctx.module, type.start, `Cannot find name '${type.name.value}'`)
            }
            if (typeFound.kind === Type.Kind.mapped && typeFound.params) {
                if (type.kind !== "TypeReference" || !type.typeArgs || typeFound.params.length !== type.typeArgs.length) {
                    raiseAt(
                        ctx.module,
                        type.start,
                        `Generic type '${typeFound.name}' requires ${typeFound.params.length} type argument(s).`
                    )
                }

                for (const typeArg of type.typeArgs) {
                    if (typeArg.kind === "TypeReference") {
                        const typeArgFound = getType(ctx, typeArg.name.value)
                        if (!typeArgFound) {
                            raiseAt(ctx.module, typeArg.start, `Cannot find name '${typeArg.name.value}'`)
                        }
                    }
                }
            }

            return typeFound
        }
    }
}
