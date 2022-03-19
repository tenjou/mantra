import { Config } from "../config"
import { raiseAt, unexpected } from "../error"
import { getFilePath } from "../file"
import { Flags } from "../flags"
import { Module } from "../module"
import * as Node from "../parser/node"
import * as TypeNode from "../parser/type-node"
import * as Type from "../types"
import { loadExterns } from "./externs"

interface Context {
    config: Config
    module: Module
    modules: Record<string, Module>
    modulesExports: Record<string, Type.Reference[]>
    exports: Type.Reference[]
    scope: Type.Scope
    scopeCurr: Type.Scope
    currFuncType: Type.Function | null
    typeAliases: {}
}

// function handleLabeledStatement(ctx: Context, node: Node.LabeledStatement): void {
//     ctx.scopeCurr.labels.push(node.label.value)

//     handle[node.body.kind](ctx, node.body)

//     ctx.scopeCurr.labels.pop()
// }

// function handleConditionalExpression(ctx: Context, node: Node.ConditionalExpression): void {
//     handle[node.test.kind](ctx, node.test)
//     handle[node.consequent.kind](ctx, node.consequent)
//     handle[node.alternate.kind](ctx, node.alternate)
// }

// function handleBreakContinueStatement(ctx, node) {
//     if (!node.label) {
//         return
//     }

//     if (!haveLabel(ctx, node.label.value)) {
//         const statementName = node.kind === "BreakStatement" ? "break" : "continue"
//         raiseAt(ctx, node.label.start, `A '${statementName}' statement can only jump to a label of an enclosing statement`)
//     }
// }

// function handleSwitchStatement(ctx, node) {
//     handle[node.discriminant.kind](ctx, node.discriminant)

//     for (const entry of node.cases) {
//         if (entry.test) {
//             handle[entry.test.kind](ctx, entry.test)
//         }
//         handleStatements(ctx, entry.consequent)
//     }
// }

// function handleWhileStatement(ctx, node) {
//     handle[node.test.kind](ctx, node.test)
//     handleBlockStatement(ctx, node.body)
// }

// function handleForStatement(ctx, node) {
//     if (node.init) {
//         handle[node.init.kind](ctx, node.init)
//     }
//     if (node.test) {
//         handle[node.test.kind](ctx, node.test)
//     }
//     if (node.update) {
//         handle[node.update.kind](ctx, node.update)
//     }

//     handle[node.body.kind](ctx, node.body)
// }

// function handleForInStatement(ctx, node) {
//     handle[node.left.kind](ctx, node.left)
//     handle[node.right.kind](ctx, node.right)
//     handle[node.body.kind](ctx, node.body)
// }

// function handleForOfStatement(ctx, node) {
//     handle[node.left.kind](ctx, node.left)
//     handle[node.right.kind](ctx, node.right)
//     handle[node.body.kind](ctx, node.body)
// }

// function handleThrowStatement(ctx: Context, node: Node.ThrowStatement): void {
//     handle[node.argument.kind](ctx, node.argument)
// }

// function handleTryStatement(ctx: Context, node: Node.TryStatement): void {
//     handle[node.block.kind](ctx, node.block)

//     if (node.handler) {
//         const param = node.handler.param
//         declareVar(ctx, param.value, param, 0)
//         handle[node.handler.body.kind](ctx, node.handler.body)
//     }
//     if (node.finalizer) {
//         handle[node.finalizer.kind](ctx, node.finalizer)
//     }
// }

// function handleEmptyStatement(_ctx: Context, _node: Node.EmptyStatement): void {}

// function handleArrowFunction(ctx, node) {
//     const returnType = node.returnType ? handleType(ctx, node.returnType) : ctx.typeAliases.void
//     const prevFuncType = ctx.currFuncType
//     const scope = createScope(ctx.scopeCurr)
//     const params = handleParams(ctx, scope, node.params)
//     const funcType = createFunction("", params, returnType)

//     ctx.currFuncType = funcType
//     ctx.scopeCurr = scope

//     handleStatements(ctx, node.body.body)

//     ctx.scopeCurr = scope.parent
//     ctx.currFuncType = prevFuncType

//     const ref = { name: "", flags: 0, type: funcType }
//     return ref
// }

// function handleAssignmentExpression(ctx, node) {
//     const leftType = handle[node.left.kind](ctx, node.left)
//     if (leftType.flags & Flags.Const) {
//         raiseAt(ctx, node.left.start, `Cannot assign to '${node.left.value}' because it is a constant`)
//     }

//     const rightType = handle[node.right.kind](ctx, node.right)

//     if (leftType.kind !== rightType.kind) {
//         raiseTypeError(ctx, node.right.start, leftType, rightType)
//     }
// }

// function handleUpdateExpression(ctx, node) {
//     // TODO: Check if argument is a number.
//     handle[node.argument.kind](ctx, node.argument)
// }

// function handleUnaryExpression(ctx, node) {
//     handle[node.argument.kind](ctx, node.argument)
// }

// function handleObjectType(ctx, name, node, type) {
//     if (type.kind !== TypeKind.object) {
//         return null
//     }

//     for (const member of type.members) {
//         const memberVar = ctx.scopeCurr.vars[member.name]
//         if (!memberVar) {
//             return null
//             // raiseAt(ctx, node.start, `Property '${member.name}' is missing in type '{}' but required in type '${type.name}'`)
//         }
//         if (memberVar.ref.type !== member.type) {
//             raiseTypeError(ctx, memberVar.node.start, member.type, memberVar.ref.type)
//         }
//     }

//     if (node.properties.length > type.members.length) {
//         loop: for (const property of node.properties) {
//             for (const member of type.members) {
//                 if (member.name === property.key.value) {
//                     continue loop
//                 }
//             }

//             raiseAt(ctx, property.start, `'${property.key.value}' does not exist in type '${name}'`)
//         }
//     }

//     return type
// }

function handleArrayExpression(ctx: Context, node: Node.ArrayExpression): Type.Array {
    let arrayType = null

    for (const element of node.elements) {
        const elementType = expressions[element.kind](ctx, element, 0)
        if (!arrayType) {
            arrayType = elementType
        } else if (!isValidType(ctx, arrayType, elementType)) {
            raiseTypeError(ctx, element.start, arrayType, elementType)
        }
    }

    return Type.createArray(arrayType || Type.coreAliases.unknown)
}

function handleObjectExpression(ctx: Context, node: Node.ObjectExpression, flags: number, srcType?: Type.Any): Type.Object {
    if (srcType && srcType.kind !== Type.Kind.object && srcType.kind !== Type.Kind.mapped) {
        raiseAt(ctx.module, node.start, `Type '{}' is not assignable to type '${srcType.name}'`)
    }

    const properties = node.properties

    if (srcType && srcType.kind !== Type.Kind.mapped) {
        const membersTypesDict: Record<string, Type.Any> = {}
        let numMembers = 0

        for (const property of properties) {
            if (membersTypesDict[property.id.value]) {
                raiseAt(ctx.module, property.start, `Duplicate identifier '${property.id.value}'`)
            }

            let type: Type.Any

            if (!property.value) {
                const valueVar = getVar(ctx, property.id.value)
                if (!valueVar) {
                    raiseAt(ctx.module, node.start, `Cannot find name '${property.id.value}'`)
                }
                type = valueVar.type
            } else {
                type = expressions[property.value.kind](ctx, property.value, 0)
            }

            membersTypesDict[property.id.value] = type
            numMembers++

            const srcMemberType = srcType.membersDict[property.id.value]
            if (!srcMemberType) {
                const propertyStr = `{ ${property.id.value}: ${type.name} }`
                raiseAt(ctx.module, property.start, `Type '${propertyStr}' is not assignable to type '${srcType.name}'`)
            }
            if (srcMemberType.type !== type) {
                raiseTypeError(ctx, property.start, srcMemberType.type, type, srcMemberType.name)
            }
        }

        if (srcType.members.length !== numMembers) {
            for (const srcTypeMember of srcType.members) {
                if (!membersTypesDict[srcTypeMember.name]) {
                    raiseAt(
                        ctx.module,
                        node.start,
                        `Property '${srcTypeMember.name}' is missing in type '${getObjectSignatureName(
                            membersTypesDict
                        )}' but required in type '${srcType.name}'`
                    )
                }
            }
        }

        return srcType
    }

    const members: Type.Reference[] = new Array(properties.length)
    const membersDict: Record<string, Type.Reference> = {}

    for (let n = 0; n < properties.length; n++) {
        const property = properties[n]
        if (membersDict[property.id.value]) {
            raiseAt(ctx.module, property.start, `Duplicate identifier '${property.id.value}'`)
        }

        let type: Type.Any
        if (property.value) {
            type = expressions[property.value.kind](ctx, property.value, 0)
        } else {
            const ref = getVar(ctx, property.id.value)
            if (!ref) {
                raiseAt(
                    ctx.module,
                    property.start,
                    `No value exists in scope for the shorthand property '${property.id.value}'. Either declare one or provide an initializer.`
                )
            }
            type = ref.type
        }

        const ref = Type.createRef(property.id.value, type, flags)
        members[n] = ref
        membersDict[property.id.value] = ref
    }

    return {
        kind: Type.Kind.object,
        name: "",
        members,
        membersDict,
    }
}

// function handleNewExpression(ctx: Context, node: Node.NewExpression): void {
//     // TODO
// }

// function handleSequenceExpression(ctx: Context, node: Node.SequenceExpression): void {
//     for (const expression of node.expressions) {
//         handle[expression.kind](ctx, expression)
//     }
// }

// function handleAssignPattern(_ctx: Context, _node: Node.AssignPattern): void {}

// function haveLabel(ctx: Context, label: Node.LabeledStatement): boolean {
//     let scope = ctx.scopeCurr

//     while (scope) {
//         for (const scopeLabel of scope.labels) {
//             if (scopeLabel === label) {
//                 return true
//             }
//         }

//         scope = scope.parent
//     }

//     return false
// }

// function importVar(ctx: Context, name: string, ref) {
// const prevVar = getVar(ctx, name, false)
// if (prevVar) {
//     raise(ctx, node, `Duplicate identifier '${name}'`)
// }

// ctx.scopeCurr.vars[name] = ref
// }

// function redeclareVar(ctx, varRef, newType) {
//     const newVarRef = { type: newType, flags: varRef.flags }
//     ctx.scopeCurr.vars[varRef.name] = newVarRef

//     return newVarRef
// }

// function raise(ctx, node, error) {
//     const lineInfo = getLineInfo(ctx, node.start)
//     const fileName = path.relative("./", ctx.filePath)
//     throw new SyntaxError(`${error}. ${fileName}:${lineInfo.line}:${lineInfo.pos + 1}`)
// }

function handleLiteral(_ctx: Context, node: Node.Literal): Type.Any {
    if (node.value === "null") {
        return Type.coreAliases.null
    }
    return Type.coreAliases.string
}

function handleNumericLiteral(_ctx: Context, _node: Node.NumericLiteral): Type.Any {
    return Type.coreAliases.number
}

function handleBooleanLiteral(_ctx: Context, _node: Node.BooleanLiteral): Type.Any {
    return Type.coreAliases.boolean
}

function handleTemplateLiteral(ctx: Context, node: Node.TemplateLiteral): Type.Any {
    for (const expression of node.expressions) {
        expressions[expression.kind](ctx, expression, 0)
    }

    return Type.coreAliases.string
}

function handleIdentifier(ctx: Context, node: Node.Identifier): Type.Any {
    const identifier = getVar(ctx, node.value)
    if (!identifier) {
        raiseAt(ctx.module, node.start, `Cannot find name '${node.value}'`)
    }

    return identifier.type
}

function handleBinaryExpression(ctx: Context, node: Node.BinaryExpression): Type.Any {
    const leftType = expressions[node.left.kind](ctx, node.left, 0)
    const rightType = expressions[node.right.kind](ctx, node.right, 0)

    if (node.operator === "instanceof") {
        raiseAt(ctx.module, node.start, "TODO")
        // return redeclareVar(ctx, leftRef, rightRef.type)
    }

    if (
        (leftType.kind !== Type.Kind.number && leftType.kind !== Type.Kind.string) ||
        (rightType.kind !== Type.Kind.number && rightType.kind !== Type.Kind.string)
    ) {
        raiseAt(
            ctx.module,
            node.left.start,
            `Operator '${node.operator}' cannot be applied to types '${leftType.name}' and '${rightType.name}'`
        )
    }

    if (node.isComparison) {
        return Type.coreAliases.boolean
    }

    return leftType.kind > rightType.kind ? leftType : rightType
}

function handleLogicalExpression(ctx: Context, node: Node.LogicalExpression): Type.Any {
    expressions[node.left.kind](ctx, node.left, 0)
    expressions[node.right.kind](ctx, node.right, 0)

    return Type.coreAliases.boolean
}

function handleCallExpression(ctx: Context, node: Node.CallExpression): Type.Any {
    const calleeType = expressions[node.callee.kind](ctx, node.callee, 0)
    if (calleeType.kind !== Type.Kind.function) {
        raiseAt(ctx.module, node.callee.start, `This expression is not callable.\n  Type '${calleeType.name}' has no call signatures`)
    }

    if (node.args.length < calleeType.argsMin) {
        raiseAt(ctx.module, node.callee.start, `Expected ${calleeType.argsMin} arguments, but got ${node.args.length}`)
    }
    if (node.args.length > calleeType.argsMax) {
        raiseAt(ctx.module, node.callee.start, `Expected ${calleeType.argsMax} arguments, but got ${node.args.length}`)
    }

    for (let n = 0; n < node.args.length; n++) {
        const arg = node.args[n]
        const argType = expressions[arg.kind](ctx, arg, 0)
        const paramType = calleeType.params[n]

        if (paramType.kind === Type.Kind.enum) {
            if (argType.kind === Type.Kind.args) {
                break
            }
            if (argType.kind !== Type.Kind.enum) {
                raiseTypeError(ctx, arg.start, paramType, argType)
            }
            if (paramType.enumType !== argType.kind) {
                raiseTypeError(ctx, arg.start, paramType, argType)
            }

            const value = getEnumValue(ctx, arg)
            if (!paramType.membersDict[value]) {
                raiseAt(ctx.module, arg.start, `Argument '${value}' is not assignable to parameter of type '${paramType.name}'`)
            }
        } else if (paramType.kind !== argType.kind) {
            if (paramType.kind === Type.Kind.args) {
                break
            }
            if (paramType.kind === Type.Kind.object && argType.kind === Type.Kind.enum) {
                continue
            }
            raiseTypeError(ctx, arg.start, paramType, argType)
        }
    }

    return calleeType.returnType
}

function handleMemberExpression(ctx: Context, node: Node.MemberExpression): Type.Any {
    const type = expressions[node.object.kind](ctx, node.object, 0)
    const typeKind = type.kind

    if (typeKind !== Type.Kind.object && typeKind !== Type.Kind.enum && typeKind !== Type.Kind.string && typeKind !== Type.Kind.number) {
        if (type.kind === Type.Kind.unknown) {
            raiseAt(ctx.module, node.object.start, `'${type.name}' is of type 'unknown'`)
        }
        raiseAt(ctx.module, node.object.start, `'${type.name}' is not an object`)
    }

    const property = node.property

    if (!node.computed) {
        switch (property.kind) {
            case "Identifier": {
                const propRef = type.membersDict[property.value]
                if (!propRef) {
                    raiseAt(ctx.module, node.property.start, `Property '${property.value}' does not exist on type '${type.name}'`)
                }
                return propRef.type
            }
        }
    }

    raiseAt(ctx.module, property.start, "TODO")
}

function handleReturnStatement(ctx: Context, node: Node.ReturnStatement): void {
    if (!ctx.currFuncType) {
        raiseAt(ctx.module, node.start, "A 'return' statement can only be used within a function body.")
    }

    let returnType: Type.Any

    if (node.argument) {
        if (ctx.currFuncType.returnType && ctx.currFuncType.returnType !== Type.coreAliases.unknown) {
            expressions[node.argument.kind](ctx, node.argument, 0, ctx.currFuncType.returnType)
            return
        }

        returnType = expressions[node.argument.kind](ctx, node.argument, 0)
    } else {
        returnType = Type.coreAliases.void
    }

    if (!ctx.currFuncType.returnType.kind) {
        ctx.currFuncType.returnType = returnType
    } else if (ctx.currFuncType.returnType.kind !== returnType.kind) {
        raiseTypeError(ctx, node.start, ctx.currFuncType.returnType, returnType)
    }
}

function handleIfStatement(ctx: Context, node: Node.IfStatement): void {
    ctx.scopeCurr = Type.createScope(ctx.scopeCurr)

    expressions[node.test.kind](ctx, node.test, 0)

    switch (node.consequent.kind) {
        case "BlockStatement":
            handleStatements(ctx, node.consequent.body)
            break

        case "ExpressionStatement":
            expressions[node.consequent.expression.kind](ctx, node.consequent.expression, 0)
            break

        default:
            unexpected(ctx.module)
    }

    ctx.scopeCurr = ctx.scopeCurr.parent

    if (node.alternate) {
        expressions[node.alternate.kind](ctx, node.alternate, 0)
    }
}

function declareInterface(ctx: Context, node: Node.InterfaceDeclaration): void {
    if (ctx.scope.types[node.name.value]) {
        raiseAt(ctx.module, node.start, `Duplicate identifier '${node.name.value}'`)
    }

    const type = Type.createObject(node.name.value, [])
    ctx.scope.types[node.name.value] = type
}

function handleInterfaceDeclaration(ctx: Context, node: Node.InterfaceDeclaration): void {
    const type = ctx.scope.types[node.name.value]
    if (type.kind !== Type.Kind.object) {
        raiseAt(ctx.module, 0, `Expected type to be an object type but got: ${type.kind}`)
    }

    const nodeMembers = node.members
    type.members.length = nodeMembers.length

    for (let n = 0; n < nodeMembers.length; n++) {
        const nodeMember = nodeMembers[n]
        const memberType = handleType(ctx, nodeMember.type, "")
        const ref = Type.createRef(nodeMember.name.value, memberType)
        type.members[n] = ref
        type.membersDict[ref.name] = ref
    }
}

function declareTypeAlias(ctx: Context, node: Node.TypeAliasDeclaration): void {
    if (ctx.scope.types[node.id.value]) {
        raiseAt(ctx.module, node.start, `Duplicate identifier '${node.id.value}'`)
    }

    ctx.scope.types[node.id.value] = Type.coreAliases.unknown
}

function handleTypeAliasDeclaration(ctx: Context, node: Node.TypeAliasDeclaration): void {
    let params: Type.Parameter[] | null = null
    if (node.typeParams) {
        const typeParams = node.typeParams
        params = new Array(typeParams.length)

        for (let n = 0; n < typeParams.length; n++) {
            const typeParam = typeParams[n]
            const constaint = handleType(ctx, typeParam.constraint, "")
            params[n] = {
                name: typeParam.name.value,
                type: constaint,
            }
        }
    }

    const type = handleType(ctx, node.type, node.id.value, params)
    ctx.scope.types[node.id.value] = type
}

function handleVariableDeclarator(ctx: Context, node: Node.VariableDeclarator, flags: number = 0): void {
    const varRef = declareVar(ctx, node, flags)

    if (node.init) {
        const initType = expressions[node.init.kind](ctx, node.init, flags, varRef.type)
        if (varRef.type.kind === Type.Kind.unknown) {
            varRef.type = initType
        } else if (!isValidType(ctx, varRef.type, initType, node.start)) {
            raiseTypeError(ctx, node.init.start, varRef.type, initType)
        }
    }

    if (flags & Flags.Exported) {
        ctx.exports.push(varRef)
    }
}

function handleVariableDeclaration(ctx: Context, node: Node.VariableDeclaration, flags: number = 0): void {
    if (node.keyword === "const") {
        flags |= Flags.Const
    }

    for (const decl of node.declarations) {
        handleVariableDeclarator(ctx, decl, flags)
    }
}

function handleImportDeclaration(ctx: Context, node: Node.ImportDeclaration): void {
    const filePath = getFilePath(ctx.module.fileDir, node.source.value)

    let moduleExports = ctx.modulesExports[filePath]
    if (!moduleExports) {
        const module = ctx.modules[filePath]
        if (!module) {
            raiseAt(ctx.module, node.source.start, `Cannot find module '${filePath}' or its corresponding type declarations.`)
        }

        module.order = ctx.module.order + 1
        moduleExports = analyze(ctx.config, module, ctx.modules)
        ctx.modulesExports[filePath] = moduleExports
    }

    if (node.name) {
        let haveDefault = false
        for (const entry of moduleExports) {
            if (entry.name === "default") {
                haveDefault = true
                break
            }
        }
        if (!haveDefault) {
            raiseAt(ctx.module, node.start, `Module '"${filePath}"' has no default export.`)
        }
    }

    const importClause = node.importClause
    if (importClause) {
        switch (importClause.kind) {
            case "NamedImports":
                break

            case "NamespaceImport": {
                const name = importClause.name.value
                const prevVar = getVar(ctx, name, false)
                if (prevVar) {
                    raiseAt(ctx.module, importClause.start, `Duplicate identifier '${name}'`)
                }

                const importedObjRef = Type.createRef(name, Type.createObject(name, moduleExports))
                ctx.scopeCurr.vars[name] = importedObjRef
                break
            }
        }
    }
}

function declareExport(ctx: Context, node: Node.ExportNamedDeclaration): void {
    switch (node.declaration.kind) {
        case "FunctionDeclaration":
            if (node.declaration.id) {
                declareNamedFunction(ctx, node.declaration, node.declaration.id)
            }
            break
        case "InterfaceDeclaration":
            declareInterface(ctx, node.declaration)
            break
        case "TypeAliasDeclaration":
            declareTypeAlias(ctx, node.declaration)
            break
    }
}

function handleExportNamedDeclaration(ctx: Context, node: Node.ExportNamedDeclaration): void {
    statements[node.declaration.kind](ctx, node.declaration, Flags.Exported)
}

function handleParams(ctx: Context, params: Node.Parameter[]): void {
    for (let nParam = 0; nParam < params.length; nParam++) {
        const param = params[nParam]
        const paramRef = declareVar(ctx, param)

        if (param.initializer) {
            const paramType = expressions[param.initializer.kind](ctx, param.initializer, 0)

            if (paramRef.type.kind !== paramType.kind) {
                raiseTypeError(ctx, param.initializer.start, paramRef.type, paramType)
            }
        }
    }
}

function declareFunction(ctx: Context, node: Node.FunctionDeclaration, name: string): Type.Reference {
    const returnType = handleType(ctx, node.returnType)
    const ref = Type.createFunctionRef(name, [], returnType)

    return ref
}

function declareNamedFunction(ctx: Context, node: Node.FunctionDeclaration, id: Node.Identifier): void {
    if (getVar(ctx, id.value)) {
        raiseAt(ctx.module, id.start, `Duplicate function implementation '${id.value}'`)
    }

    const ref = declareFunction(ctx, node, id.value)
    ctx.scopeCurr.vars[id.value] = ref
}

function handleFunctionDeclaration(ctx: Context, node: Node.FunctionDeclaration, flags: number = 0): Type.Any {
    const name = node.id ? node.id.value : ""
    const ref = name ? getVar(ctx, name) : declareFunction(ctx, node, name)
    if (!ref) {
        raiseAt(ctx.module, node.start, `Missing function reference: ${name}`)
    }
    if (ref.type.kind !== Type.Kind.function) {
        raiseAt(ctx.module, node.start, `Expected function type: ${name}, but instead got: ${ref.type.kind}`)
    }

    const scope = Type.createScope(ctx.scopeCurr)
    ctx.scopeCurr = scope
    ctx.currFuncType = ref.type

    handleParams(ctx, node.params)

    if (node.body.kind === "BlockStatement") {
        handleStatements(ctx, node.body.body)
    } else {
        raiseAt(ctx.module, node.body.start, "Unsupported feature")
    }

    ctx.scopeCurr = ctx.scopeCurr.parent

    if (name && flags & Flags.Exported) {
        ctx.exports.push(ref)
    }

    return ref.type
}

function handleEnumDeclaration(ctx: Context, node: Node.EnumDeclaration): void {
    const contentType = getEnumType(ctx, node.members)

    ctx.scopeCurr = Type.createScope(ctx.scopeCurr)

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

function handleBlockStatement(ctx: Context, node: Node.BlockStatement): void {
    ctx.scopeCurr = Type.createScope(ctx.scopeCurr)

    handleStatements(ctx, node.body)

    ctx.scopeCurr = ctx.scopeCurr.parent
}

function handleStatements(ctx: Context, body: Node.Statement[]): void {
    const scopeCurr = ctx.scopeCurr

    for (const node of body) {
        switch (node.kind) {
            case "FunctionDeclaration":
                if (node.id) {
                    declareNamedFunction(ctx, node, node.id)
                }
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
        }
    }

    for (const node of body) {
        statements[node.kind](ctx, node, 0)
    }

    ctx.scopeCurr = scopeCurr
}

function handleExpressionStatement(ctx: Context, node: Node.ExpressionStatement): void {
    expressions[node.expression.kind](ctx, node.expression, 0)
}

function handleType(ctx: Context, type: TypeNode.Any | null = null, name = "", params: Type.Parameter[] | null = null): Type.Any {
    if (!type) {
        return Type.coreAliases.unknown
    }

    switch (type.kind) {
        case "UnionType": {
            const types: Type.Any[] = new Array(type.types.length)
            for (let n = 0; n < type.types.length; n++) {
                const entry = type.types[n]
                types[n] = handleType(ctx, entry)
            }

            return Type.createUnion(name, types)
        }

        case "ArrayType": {
            const elementType = handleType(ctx, type.elementType)

            return Type.createArray(elementType, name)
        }

        case "FunctionType": {
            const params: Type.Any[] = new Array(type.params.length)
            for (let nParam = 0; nParam < type.params.length; nParam++) {
                const param = type.params[nParam]
                const paramType = handleType(ctx, param.type, param.name.value)
                if (!paramType) {
                    raiseAt(ctx.module, type.start, `Parameter '${param.name.value}' implicitly has an 'any' type.`)
                }

                params[nParam] = paramType
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

function getType(ctx: Context, name: string): Type.Any | null {
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

function isValidType(ctx: Context, leftType: Type.Any, rightType: Type.Any, pos = 0): boolean {
    switch (leftType.kind) {
        case Type.Kind.object: {
            if (rightType.kind === Type.Kind.object) {
                const membersLeft = leftType.members
                const membersRight = rightType.members

                loop: for (let n = 0; n < membersLeft.length; n++) {
                    const memberLeft = membersLeft[n]
                    for (let m = 0; m < membersRight.length; m++) {
                        const memberRight = membersRight[m]
                        if (memberLeft.type === memberRight.type && memberLeft.name === memberRight.name) {
                            continue loop
                        }
                    }

                    raiseAt(
                        ctx.module,
                        pos,
                        `Property '{${memberLeft.name}: ${getTypeName(memberLeft.type)}}' is missing but required in type '${
                            leftType.name
                        }'`
                    )
                }

                return leftType.members.length === rightType.members.length
            }

            return false
        }

        case Type.Kind.union: {
            for (const type of leftType.types) {
                if (isValidType(ctx, type, rightType)) {
                    return true
                }
            }

            return false
        }

        case Type.Kind.function: {
            if (rightType.kind !== Type.Kind.function) {
                return false
            }

            const leftParams = leftType.params
            const rightParams = rightType.params

            if (rightParams.length < leftParams.length) {
                return true
            }

            for (let nArg = 0; nArg < leftParams.length; nArg++) {
                const leftParam = leftParams[nArg]
                const rightParam = rightParams[nArg]
                if (leftParam.kind !== rightParam.kind) {
                    raiseTypeError(ctx, pos, leftType, rightType)
                }
                return true
            }

            return true
        }

        case Type.Kind.array: {
            if (rightType.kind !== Type.Kind.array) {
                return false
            }

            return isValidType(ctx, leftType.elementType, rightType.elementType)
        }

        case Type.Kind.enum: {
            if (rightType.kind === Type.Kind.enumMember) {
                return rightType.enum === leftType
            }
            return false
        }

        case Type.Kind.mapped: {
            return rightType.kind === Type.Kind.object
        }
    }

    return leftType === rightType
}

function getObjectSignatureName(membersDict: Record<string, Type.Any>) {
    let result = ""
    for (const memberName in membersDict) {
        const memberType = membersDict[memberName]
        if (result) {
            result += `, ${memberName}: ${getTypeName(memberType)}`
        } else {
            result = `${memberName}: ${getTypeName(memberType)}`
        }
    }
    return result ? `{ ${result} }` : "{}"
}

function getTypeName(type: Type.Any): string {
    switch (type.kind) {
        case Type.Kind.array:
            return `${getTypeName(type.elementType)}[]`

        case Type.Kind.function: {
            const returnOutput = getTypeName(type.returnType)

            let paramsOutput = ""
            for (const param of type.params) {
                if (paramsOutput) {
                    paramsOutput += `, ${param.name}: ${param.name}`
                } else {
                    paramsOutput = `${param.name}: ${param.name}`
                }
            }

            return `(${paramsOutput}) => ${returnOutput}`
        }

        case Type.Kind.enumMember:
            return `${type.enum.name}.${type.name}`

        case Type.Kind.object: {
            let result = ""
            for (const member of type.members) {
                if (result) {
                    result += `, ${member.name}: ${getTypeName(member.type)}`
                } else {
                    result = `${member.name}: ${getTypeName(member.type)}`
                }
            }
            return result ? `{ ${result} }` : "{}"
        }
    }

    return type.name
}

function raiseTypeError(ctx: Context, start: number, leftType: Type.Any, rightType: Type.Any, name: string = "") {
    if (name) {
        raiseAt(
            ctx.module,
            start,
            `Variable '${name}' with type '${getTypeName(rightType)}' is not assignable to type '${getTypeName(leftType)}'`
        )
    }
    raiseAt(ctx.module, start, `Type '${getTypeName(rightType)}' is not assignable to type '${getTypeName(leftType)}'`)
}

function getVar(ctx: Context, name: string, isObject: boolean = false): Type.Reference | null {
    if (isObject) {
        const item = ctx.scopeCurr.vars[name]
        if (item) {
            return item
        }
    } else {
        let scope = ctx.scopeCurr
        let item = scope.vars[name]
        if (item) {
            return item
        }

        do {
            scope = scope.parent
            item = scope.vars[name]
            if (item) {
                return item
            }
        } while (scope !== ctx.scope)
    }

    return null
}

function declareVar(ctx: Context, node: Node.VariableDeclarator | Node.Parameter, flags = 0): Type.Reference {
    const name = node.id.value
    const prevVar = getVar(ctx, name, false)
    if (prevVar) {
        raiseAt(ctx.module, node.start, `Duplicate identifier '${name}'`)
    }

    const type = handleType(ctx, node.type, node.id.value)
    const ref = Type.createRef(name, type, flags)

    ctx.scopeCurr.vars[name] = ref

    return ref
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

function getEnumValue(ctx: Context, node: Node.Expression): string {
    switch (node.kind) {
        case "Literal":
        case "NumericLiteral":
            return node.value
    }

    raiseAt(ctx.module, node.start, `Unsupported argument value`)
}

// function declareModule(ctx: Context, alias: string, refs: Object) {
//     ctx.modules[alias] = createModule(null, "", "", "", alias)
//     ctx.modulesExports[alias] = refs
// }

export function analyze(config: Config, module: Module, modules: Record<string, Module>) {
    const scope = Type.createScope()
    scope.parent = scope

    const ctx: Context = {
        config,
        module,
        modules,
        modulesExports: {},
        exports: [],
        scope,
        scopeCurr: scope,
        currFuncType: null,
        typeAliases: {},
    }

    // loadCoreTypes(ctx)
    loadExterns(ctx.modulesExports)

    // declareModule(ctx, "path", {})

    // scope.vars["Infinity"] = coreTypeRefs.number
    // scope.vars["NaN"] = coreTypeRefs.number
    // scope.vars["console"] = createObject("Console", {
    //     log: createFunction("console", [createArg("msg", coreTypeAliases.args)]),
    // })
    // scope.vars["Error"] = createObject("Error", {
    //     message: createVar(coreTypeAliases.string),
    // })
    scope.vars["Object"] = Type.createObjectRef("Object", [
        Type.createFunctionRef("keys", [Type.coreAliases.object], Type.createArray(Type.coreAliases.string)),
    ])

    // declareModule(ctx, "fs", {
    //     readFileSync: createFunction("readFileSync", [createArg("path", TypeKind.string), createArg("encoding", TypeKind.string)]),
    // })

    scope.types["Record"] = Type.createMappedType("Record", [
        {
            name: "K",
            type: Type.coreAliases.string,
        },
        {
            name: "T",
            type: Type.coreAliases.string,
        },
    ])

    handleStatements(ctx, module.program.body)

    return ctx.exports
}

type StatementFunc = (ctx: Context, node: any, flags: number) => void

const statements: Record<string, StatementFunc> = {
    ReturnStatement: handleReturnStatement,
    IfStatement: handleIfStatement,
    InterfaceDeclaration: handleInterfaceDeclaration,
    TypeAliasDeclaration: handleTypeAliasDeclaration,
    VariableDeclaration: handleVariableDeclaration,
    ImportDeclaration: handleImportDeclaration,
    ExportNamedDeclaration: handleExportNamedDeclaration,
    FunctionDeclaration: handleFunctionDeclaration,
    EnumDeclaration: handleEnumDeclaration,
    BlockStatement: handleBlockStatement,
    ExpressionStatement: handleExpressionStatement,
}

type ExpressionFunc = (ctx: Context, node: any, flags: number, type?: Type.Any) => Type.Any

const expressions: Record<string, ExpressionFunc> = {
    Literal: handleLiteral,
    NumericLiteral: handleNumericLiteral,
    BooleanLiteral: handleBooleanLiteral,
    TemplateLiteral: handleTemplateLiteral,
    Identifier: handleIdentifier,
    BinaryExpression: handleBinaryExpression,
    LogicalExpression: handleLogicalExpression,
    CallExpression: handleCallExpression,
    MemberExpression: handleMemberExpression,
    ObjectExpression: handleObjectExpression,
    ArrayExpression: handleArrayExpression,
}

type HandleFunc = (ctx: Context, node: any) => void

const handle: Record<string, HandleFunc> = {
    // VariableDeclarator: handleVariableDeclarator,
    // LabeledStatement: handleLabeledStatement,
    // ConditionalExpression: handleConditionalExpression,
    // IfStatement: handleIfStatement,
    // BreakStatement: handleBreakContinueStatement,
    // ContinueStatement: handleBreakContinueStatement,
    // SwitchStatement: handleSwitchStatement,
    // WhileStatement: handleWhileStatement,
    // ForStatement: handleForStatement,
    // ForInStatement: handleForInStatement,
    // ForOfStatement: handleForOfStatement,
    // ThrowStatement: handleThrowStatement,
    // TryStatement: handleTryStatement,
    // BlockStatement: handleBlockStatement,
    // EmptyStatement: handleEmptyStatement,
    // ArrowFunction: handleArrowFunction,
    // AssignmentExpression: handleAssignmentExpression,
    // UpdateExpression: handleUpdateExpression,
    // UnaryExpression: handleUnaryExpression,
    // LogicalExpression: handleLogicalExpression,
    //
    // CallExpression: handleCallExpression,
    // NewExpression: handleNewExpression,
    // SequenceExpression: handleSequenceExpression,
    // AssignPattern: handleAssignPattern,
}
