import { raiseAt } from "../error"
import * as Node from "../parser/node"
import * as TypeNode from "../parser/type-node"
import { createScope, FunctionTypeDeclaration, TypeDeclaration } from "../scope"
import * as Type from "../types"
import { getFilePath } from "./../file"
import { Flags } from "./../flags"
import { analyzeModule } from "./analyzer"
import { getVar } from "./analyzer-utils"
import { Context } from "./context"

export function handleDeclaration(ctx: Context, node: Node.Statement, isExported: boolean): void {
    switch (node.kind) {
        case "FunctionDeclaration":
            declareFunction(ctx, node)
            break

        case "InterfaceDeclaration":
            declareInterface(ctx, node, isExported)
            break

        case "TypeAliasDeclaration":
            declareTypeAlias(ctx, node)
            break

        case "ImportDeclaration":
            declareImport(ctx, node)
            break

        case "ExportNamedDeclaration":
            declareExport(ctx, node)
            break

        case "EnumDeclaration":
            declareEnum(ctx, node)
            break
    }
}

function declareImport(ctx: Context, node: Node.ImportDeclaration): void {
    const filePath = getFilePath(ctx.module.fileDir, node.source.value)
    const module = ctx.modules[filePath]
    if (!module) {
        raiseAt(ctx.module, node.source.start, `Cannot find module '${filePath}' or its corresponding type declarations`)
    }

    if (!module.scope) {
        module.order = ctx.module.order + 1
        analyzeModule(ctx, module)
    }
    if (!module.scope) {
        raiseAt(ctx.module, node.source.start, `Module scope has not been initialized '${filePath}'`)
    }

    if (node.name) {
        const defaultVar = module.exportedVars.find((entry) => entry.name === "default")
        if (!defaultVar) {
            raiseAt(ctx.module, node.start, `Module '"${filePath}"' has no default export`)
        }
    }

    const importClause = node.importClause
    if (importClause) {
        switch (importClause.kind) {
            case "NamedImports": {
                for (const specifier of importClause.specifiers) {
                    const name = specifier.imported.value
                    const prevVar = getVar(ctx, name)
                    if (prevVar) {
                        raiseAt(ctx.module, specifier.start, `Duplicate identifier '${name}'`)
                    }

                    const importedVar = module.exportedVars.find((entry) => entry.name === name)
                    if (!importedVar) {
                        const importedType = module.exportedTypes.find((entry) => entry.name === name)
                        if (!importedType) {
                            raiseAt(ctx.module, specifier.start, `Module '"${filePath}"' has no exported member '${name}'`)
                        }

                        ctx.scopeCurr.types[name] = importedType
                        specifier.isType = true
                    } else {
                        ctx.scopeCurr.vars[name] = importedVar
                    }
                }
                break
            }

            case "NamespaceImport": {
                const name = importClause.name.value
                const prevVar = getVar(ctx, name)
                if (prevVar) {
                    raiseAt(ctx.module, importClause.start, `Duplicate identifier '${name}'`)
                }

                const importedObjRef = Type.createRef(name, Type.createObject(name, module.exportedVars))
                ctx.scopeCurr.vars[name] = importedObjRef
                break
            }
        }
    }
}

function declareExport(ctx: Context, node: Node.ExportNamedDeclaration): void {
    handleDeclaration(ctx, node.declaration, true)
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

function declareInterface(ctx: Context, node: Node.InterfaceDeclaration, isExported: boolean): void {
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

    if (isExported) {
        ctx.module.exportedTypes.push(type)
    }
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
    if (typeDecl.type.flags & Flags.Resolved) {
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

function resolveFunctionParams(ctx: Context, nodeParams: Node.Parameter[], type: Type.Function): void {
    let argsMin = 0
    let argsMax = nodeParams.length

    type.params.length = argsMax

    for (let n = 0; n < nodeParams.length; n++) {
        const nodeParam = nodeParams[n]
        const paramType = handleType(ctx, nodeParam.type)

        let flags = 0
        if (nodeParam.isOptional || nodeParam.initializer) {
            flags |= Flags.Optional
        }

        if (!(flags & Flags.Optional)) {
            argsMin++
            if (argsMin === n) {
                raiseAt(ctx.module, nodeParam.start, `A required parameter '${nodeParam.id.value}' cannot follow an optional parameter.`)
            }
        }

        type.params[n] = Type.createParameter(nodeParam.id.value, paramType, flags)
    }

    type.argsMin = argsMin
    type.argsMax = argsMax
}

function resolveFunction(ctx: Context, node: Node.FunctionDeclaration, type: Type.Function): void {
    type.returnType = handleType(ctx, node.returnType)

    resolveFunctionParams(ctx, node.params, type)
}

function resolveInterface(ctx: Context, node: Node.InterfaceDeclaration, type: Type.Object): void {
    type.flags |= Flags.Resolved

    if (node.heritageClauses) {
        for (const heritage of node.heritageClauses) {
            const heritageType = getType(ctx, heritage.name.value)
            if (!heritageType) {
                raiseAt(ctx.module, heritage.start, `Cannot find name '${heritage.name.value}'`)
            }
            if (heritageType.kind !== Type.Kind.object) {
                raiseAt(
                    ctx.module,
                    heritage.start,
                    `An interface can only extend an object type or intersection of object types with statically known members`
                )
            }

            type.members = [...type.members, ...heritageType.members]
            type.membersDict = {
                ...type.membersDict,
                ...heritageType.membersDict,
            }
        }
    }

    const nodeMembers = node.members

    let offset = type.members.length
    type.members.length += nodeMembers.length

    for (let n = 0; n < nodeMembers.length; n++) {
        const nodeMember = nodeMembers[n]
        const memberType = handleType(ctx, nodeMember.type, null, nodeMember.name.value)
        const ref = Type.createRef(nodeMember.name.value, memberType)
        if (nodeMember.isOptional) {
            ref.flags |= Flags.Optional
        }

        type.members[offset++] = ref
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
            const constraint = handleType(ctx, typeParam.constraint)
            params[n] = {
                kind: Type.Kind.parameter,
                name: typeParam.name.value,
                constraint: constraint,
                flags: 0,
            }
        }
    }

    typeAlias.params = params
    typeAlias.type = handleType(ctx, node.type, params)
    typeAlias.flags |= Flags.Resolved
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

                const enumMember = Type.createEnumMember(enumDef, member.name.value, member.initializer.value)
                members[member.name.value] = Type.createRef(member.name.value, enumMember)
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

                const enumMember = Type.createEnumMember(enumDef, member.name.value, index)
                members[member.name.value] = Type.createRef(member.name.value, enumMember)
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
        if (!(typeDecl.type.flags & Flags.Resolved)) {
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

export function handleType(ctx: Context, type: TypeNode.Any | null = null, params: Type.Parameter[] | null = null, name = ""): Type.Any {
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

        case "UndefinedKeyword":
            return Type.coreAliases.undef

        case "NeverKeyword":
            return Type.coreAliases.never

        case "ArrayType": {
            const elementType = handleType(ctx, type.elementType, params)

            return Type.createArray(elementType)
        }

        case "UnionType": {
            const types: Type.Any[] = new Array(type.types.length)
            for (let n = 0; n < type.types.length; n++) {
                const entry = type.types[n]
                types[n] = handleType(ctx, entry, params)
            }

            return Type.createUnion(types)
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
                const paramType = handleType(ctx, param.type, null, param.name.value)
                if (!paramType) {
                    raiseAt(ctx.module, type.start, `Parameter '${param.name.value}' implicitly has an 'any' type.`)
                }

                params[nParam] = {
                    kind: Type.Kind.parameter,
                    name: param.name.value,
                    constraint: paramType,
                    flags: 0,
                }
            }

            const returnType = handleType(ctx, type.type, params)
            return Type.createFunction(name, params, returnType)
        }

        case "TypeLiteral": {
            const members: Type.Reference[] = new Array(type.members.length)
            for (let n = 0; n < type.members.length; n++) {
                const entry = type.members[n]
                const entryType = handleType(ctx, entry.type, params)
                members[n] = Type.createRef(entry.name.value, entryType)
            }

            return Type.createObject(name, members)
        }

        case "TypeParameter": {
            return handleType(ctx, type.constraint, params)
        }

        case "TypeOperator":
            return Type.coreAliases.unknown

        case "MappedType": {
            const mappedTypeParam = handleType(ctx, type.typeParam, params)
            const mappedType = handleType(ctx, type.type, params)

            return Type.createMappedType(mappedTypeParam, mappedType)
        }

        case "IndexedAccessType": {
            return Type.coreAliases.unknown
        }

        default: {
            if (params) {
                for (const param of params) {
                    if (param.name === type.name.value) {
                        return param
                    }
                }
            }

            const typeFound = getType(ctx, type.name.value)
            if (!typeFound) {
                raiseAt(ctx.module, type.start, `Cannot find name '${type.name.value}'`)
            }
            if (typeFound.kind === Type.Kind.type) {
                return resolveTypeParams(ctx, type, typeFound)
            }

            return typeFound
        }
    }
}

function resolveTypeParams(ctx: Context, type: TypeNode.Any, typeFound: Type.Type) {
    if (!typeFound.params) {
        if (type.kind === "TypeReference") {
            if (type.typeArgs) {
                raiseAt(ctx.module, type.start, `Type '${type.name.value}' is not generic`)
            }
        }
        return typeFound.type
    }

    if (type.kind !== "TypeReference" || !type.typeArgs || typeFound.params.length !== type.typeArgs.length) {
        raiseAt(ctx.module, type.start, `Generic type '${typeFound.name}' requires ${typeFound.params.length} type argument(s)`)
    }

    const params: Type.Parameter[] = new Array(typeFound.params.length)
    for (let n = 0; n < params.length; n++) {
        const typeParam = typeFound.params[n]
        const typeArg = type.typeArgs[n]
        params[n] = {
            kind: Type.Kind.parameter,
            name: typeParam.name,
            constraint: handleType(ctx, typeArg),
            flags: 0,
        }
    }

    return recreateType(typeFound.type, params)
}

function recreateType(srcType: Type.Any, params: Type.Parameter[]) {
    switch (srcType.kind) {
        case Type.Kind.mapped: {
            const typeParameter = resolveParam(srcType.typeParameter, params)
            const type = resolveParam(srcType.type, params)
            return Type.createMappedType(typeParameter, type)
        }
    }

    return srcType
}

function resolveParam(type: Type.Any, params: Type.Parameter[]) {
    if (type.kind === Type.Kind.parameter) {
        for (const param of params) {
            if (param.name === type.name) {
                return param.constraint
            }
        }
    }

    return type
}
