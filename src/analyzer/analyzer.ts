import { Config } from "../config"
import { raiseAt, unexpected } from "../error"
import { getFilePath } from "../file"
import { Flags } from "../flags"
import { Module } from "../module"
import * as Node from "../parser/node"
import { createScope, FunctionTypeDeclaration } from "../scope"
import * as Type from "../types"
import { Context } from "./context"
import { handleDeclaration, handleType, resolveDeclaration } from "./declarations"
import { loadExterns } from "./externs"

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

function handlePropertyAccessExpression(ctx: Context, node: Node.PropertyAccessExpression): Type.Any {
    const expressionType = expressions[node.expression.kind](ctx, node.expression, 0)
    if (expressionType.kind !== Type.Kind.object && expressionType.kind !== Type.Kind.enum) {
        raiseAt(ctx.module, node.expression.start, `Expected object but instead got: ${Type.getName(expressionType)}`)
    }

    const member = expressionType.membersDict[node.name.value]
    if (!member) {
        raiseAt(ctx.module, node.start, `Cannot find name '${Type.getName(expressionType)}.${node.name.value}'`)
    }

    return member.type
}

function handleAsExpression(ctx: Context, node: Node.AsExpression): Type.Any {
    expressions[node.expression.kind](ctx, node.expression, 0)

    const type = handleType(ctx, node.type)
    return type
}

function handleArrayExpression(ctx: Context, node: Node.ArrayExpression): Type.Array {
    let arrayType = null

    for (const element of node.elements) {
        const elementType = expressions[element.kind](ctx, element, 0)
        if (!arrayType) {
            arrayType = elementType
        } else if (!isValidType(ctx, arrayType, elementType, element.start)) {
            raiseTypeError(ctx, element.start, arrayType, elementType)
        }
    }

    return Type.createArray(arrayType || Type.coreAliases.unknown)
}

function handleObjectExpression(ctx: Context, node: Node.ObjectExpression, flags: number): Type.Object {
    const properties = node.properties
    const members: Type.Reference[] = new Array(properties.length)
    const membersDict: Record<string, Type.Reference> = {}

    for (let n = 0; n < properties.length; n++) {
        const property = properties[n]

        switch (property.name.kind) {
            case "Identifier":
            case "NumericLiteral": {
                if (membersDict[property.name.value]) {
                    raiseAt(ctx.module, property.start, `Duplicate identifier '${property.name.value}'`)
                }

                let type: Type.Any
                if (property.initializer) {
                    type = expressions[property.initializer.kind](ctx, property.initializer, 0)
                } else {
                    const ref = getVar(ctx, property.name.value)
                    if (!ref) {
                        raiseAt(
                            ctx.module,
                            property.start,
                            `No value exists in scope for the shorthand property '${property.name.value}'. Either declare one or provide an initializer.`
                        )
                    }
                    type = ref.type
                }

                const ref = Type.createRef(property.name.value, type, flags)
                members[n] = ref
                membersDict[property.name.value] = ref
                break
            }

            case "ComputedPropertyName": {
                if (!property.initializer) {
                    raiseAt(ctx.module, property.start, `Missing initializer`)
                }
                const type = expressions[property.name.expression.kind](ctx, property.name.expression, 0)
                const valueType = expressions[property.initializer.kind](ctx, property.initializer, 0)
                break
            }
        }
    }

    return {
        kind: Type.Kind.object,
        name: "",
        members,
        membersDict,
        flags: 0,
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
    if (node.raw === "null") {
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

function handleNullKeyword(_ctx: Context, _node: Node.NullKeyword): Type.Any {
    return Type.coreAliases.null
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
            `Operator '${node.operator}' cannot be applied to types '${Type.getName(leftType)}' and '${Type.getName(rightType)}'`
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
        raiseAt(
            ctx.module,
            node.callee.start,
            `This expression is not callable.\n  Type '${Type.getName(calleeType)}' has no call signatures`
        )
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
        const paramType = calleeType.params[n].constraint

        if (!isValidType(ctx, paramType, argType, arg.start)) {
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
            raiseAt(ctx.module, node.object.start, `'${Type.getName(type)}' is of type 'unknown'`)
        }
        raiseAt(ctx.module, node.object.start, `'${Type.getName(type)}' is not an object`)
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
    ctx.scopeCurr = createScope(ctx.scopeCurr)

    expressions[node.test.kind](ctx, node.test, 0)

    switch (node.consequent.kind) {
        case "BlockStatement":
            handleStatements(ctx, node.consequent.body)
            break

        case "ExpressionStatement":
            expressions[node.consequent.expression.kind](ctx, node.consequent.expression, 0)
            break

        default:
            unexpected(ctx.module, node.consequent.start)
    }

    ctx.scopeCurr = ctx.scopeCurr.parent

    if (node.alternate) {
        expressions[node.alternate.kind](ctx, node.alternate, 0)
    }
}

function handleVariableDeclarator(ctx: Context, node: Node.VariableDeclarator, flags: number = 0): void {
    const varRef = declareVar(ctx, node, flags)

    if (node.init) {
        const initType = expressions[node.init.kind](ctx, node.init, flags, varRef.type)
        if (varRef.type.kind === Type.Kind.unknown) {
            varRef.type = initType
        } else if (!isValidType(ctx, varRef.type, initType, node.init.start)) {
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

function handleExportNamedDeclaration(ctx: Context, node: Node.ExportNamedDeclaration): void {
    statements[node.declaration.kind](ctx, node.declaration, Flags.Exported)
}

function handleParams(ctx: Context, params: Node.Parameter[]): void {
    for (let nParam = 0; nParam < params.length; nParam++) {
        const param = params[nParam]
        const paramRef = declareVar(ctx, param)

        if (param.initializer) {
            const paramType = expressions[param.initializer.kind](ctx, param.initializer, 0)

            if (!isValidType(ctx, paramRef.type, paramType, param.initializer.start)) {
                raiseTypeError(ctx, param.initializer.start, paramRef.type, paramType)
            }
        }
    }
}

function handleFunctionDeclaration(ctx: Context, node: Node.FunctionDeclaration, flags: number = 0): Type.Any {
    const name = node.id ? node.id.value : ""

    let ref: Type.Reference
    if (name) {
        const refVar = getVar(ctx, name)
        if (!refVar) {
            raiseAt(ctx.module, node.start, `Missing function reference: ${name}`)
        }
        ref = refVar
    } else {
        const type = Type.createFunction("", [], Type.coreAliases.unknown)
        ref = Type.createRef("", type)
    }

    if (ref.type.kind !== Type.Kind.function) {
        raiseAt(ctx.module, node.start, `Expected function type: ${name}, but instead got: ${ref.type.kind}`)
    }

    if (name && flags & Flags.Exported) {
        ctx.exports.push(ref)
    }

    return ref.type
}

function resolveFunctionDeclaration(ctx: Context, { type, node }: FunctionTypeDeclaration): void {
    const scope = createScope(ctx.scopeCurr)
    ctx.scopeCurr = scope
    ctx.currFuncType = type

    handleParams(ctx, node.params)

    if (node.body.kind === "BlockStatement") {
        handleStatements(ctx, node.body.body)
    } else {
        raiseAt(ctx.module, node.body.start, "Unsupported feature")
    }

    ctx.scopeCurr = ctx.scopeCurr.parent
}

function handleBlockStatement(ctx: Context, node: Node.BlockStatement): void {
    ctx.scopeCurr = createScope(ctx.scopeCurr)

    handleStatements(ctx, node.body)

    ctx.scopeCurr = ctx.scopeCurr.parent
}

function handleStatements(ctx: Context, body: Node.Statement[]): void {
    const scopeCurr = ctx.scopeCurr

    ctx.resolvingTypes = {}

    for (const node of body) {
        handleDeclaration(ctx, node)
    }

    for (const key in ctx.resolvingTypes) {
        const typeDecl = ctx.resolvingTypes[key]
        resolveDeclaration(ctx, typeDecl)
    }

    for (const node of body) {
        statements[node.kind](ctx, node, 0)
    }

    for (const func of scopeCurr.funcs) {
        resolveFunctionDeclaration(ctx, func)
    }

    scopeCurr.funcs.length = 0

    ctx.scopeCurr = scopeCurr
}

function handleExpressionStatement(ctx: Context, node: Node.ExpressionStatement): void {
    expressions[node.expression.kind](ctx, node.expression, 0)
}

function handleNoop(_ctx: Context, _node: Node.Statement): void {}

function isValidType(ctx: Context, leftType: Type.Any, rightType: Type.Any, pos: number, shallowCheck: boolean = false): boolean {
    switch (leftType.kind) {
        case Type.Kind.unknown:
            return true

        case Type.Kind.type: {
            if (leftType === rightType) {
                return true
            }
            return isValidType(ctx, leftType.type, rightType, pos)
        }

        case Type.Kind.object: {
            if (leftType === rightType) {
                return true
            }

            if (rightType.kind === Type.Kind.object) {
                if (shallowCheck) {
                    return false
                }

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

                    return false
                }

                return leftType.members.length === rightType.members.length
            }
            if (leftType.members.length === 0) {
                return rightType.kind === Type.Kind.enum
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
                const leftParam = leftParams[nArg].constraint
                const rightParam = rightParams[nArg].constraint
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
            if (rightType.elementType === Type.coreAliases.unknown) {
                return true
            }

            return isValidType(ctx, leftType.elementType, rightType.elementType, pos)
        }

        case Type.Kind.enum: {
            if (rightType.kind === Type.Kind.enumMember) {
                return rightType.enum === leftType
            }
            return false
        }

        case Type.Kind.enumMember: {
            if (rightType.kind !== Type.Kind.enumMember) {
                return false
            }
            const isValid = leftType.enum === rightType.enum
            return isValid
        }

        case Type.Kind.union: {
            if (rightType.kind == Type.Kind.union) {
                loop: for (const leftParam of leftType.types) {
                    let foundSubstitue = false
                    for (const rightParam of rightType.types) {
                        if (isValidType(ctx, leftParam, rightParam, pos)) {
                            foundSubstitue = true
                            continue loop
                        }
                    }
                    if (!foundSubstitue) {
                        return false
                    }
                }
            }

            for (const leftParam of leftType.types) {
                if (isValidType(ctx, leftParam, rightType, pos, true)) {
                    return true
                }
            }
            for (const leftParam of leftType.types) {
                if (isValidType(ctx, leftParam, rightType, pos)) {
                    return true
                }
            }

            return false
        }

        case Type.Kind.mapped: {
            if (rightType.kind !== Type.Kind.object) {
                return false
            }

            if (leftType.type.kind !== Type.Kind.unknown && rightType.members.length > 0) {
                let typeIsValid = false
                for (const member of rightType.members) {
                    if (leftType.typeParameter === member.type || isValidType(ctx, leftType.typeParameter, member.type, pos)) {
                        typeIsValid = true
                        break
                    }
                }
                if (!typeIsValid) {
                    return false
                }
            }

            return true
        }
    }

    return leftType === rightType
}

function raiseTypeError(ctx: Context, start: number, leftType: Type.Any, rightType: Type.Any, name: string = "") {
    if (name) {
        raiseAt(
            ctx.module,
            start,
            `Variable '${name}' with type '${Type.getName(rightType)}' is not assignable to type '${Type.getName(leftType)}'`
        )
    }
    raiseAt(ctx.module, start, `Type '${Type.getName(rightType)}' is not assignable to type '${Type.getName(leftType)}'`)
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

    const type = handleType(ctx, node.type, null, node.id.value)
    const ref = Type.createRef(name, type, flags)

    ctx.scopeCurr.vars[name] = ref

    return ref
}

export function analyze(config: Config, module: Module, modules: Record<string, Module>) {
    const scope = createScope()
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
        resolvingTypes: {},
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
        Type.createFunctionRef("keys", { o: Type.coreAliases.object }, Type.createArray(Type.coreAliases.string)),
    ])

    // declareModule(ctx, "fs", {
    //     readFileSync: createFunction("readFileSync", [createArg("path", TypeKind.string), createArg("encoding", TypeKind.string)]),
    // })

    scope.types["Record"] = Type.createType("Record", [
        {
            name: "K",
            constraint: Type.createUnion([Type.coreAliases.string, Type.coreAliases.number]),
        },
        {
            name: "T",
            constraint: Type.coreAliases.unknown,
        },
    ])

    handleStatements(ctx, module.program.body)

    return ctx.exports
}

type StatementFunc = (ctx: Context, node: any, flags: number) => void

const statements: Record<string, StatementFunc> = {
    ReturnStatement: handleReturnStatement,
    IfStatement: handleIfStatement,
    InterfaceDeclaration: handleNoop,
    TypeAliasDeclaration: handleNoop,
    EnumDeclaration: handleNoop,
    VariableDeclaration: handleVariableDeclaration,
    ImportDeclaration: handleImportDeclaration,
    ExportNamedDeclaration: handleExportNamedDeclaration,
    FunctionDeclaration: handleFunctionDeclaration,
    BlockStatement: handleBlockStatement,
    ExpressionStatement: handleExpressionStatement,
}

type ExpressionFunc = (ctx: Context, node: any, flags: number, type?: Type.Any) => Type.Any

const expressions: Record<string, ExpressionFunc> = {
    Literal: handleLiteral,
    NumericLiteral: handleNumericLiteral,
    BooleanLiteral: handleBooleanLiteral,
    TemplateLiteral: handleTemplateLiteral,
    NullKeyword: handleNullKeyword,
    Identifier: handleIdentifier,
    BinaryExpression: handleBinaryExpression,
    LogicalExpression: handleLogicalExpression,
    CallExpression: handleCallExpression,
    MemberExpression: handleMemberExpression,
    ObjectExpression: handleObjectExpression,
    ArrayExpression: handleArrayExpression,
    PropertyAccessExpression: handlePropertyAccessExpression,
    AsExpression: handleAsExpression,
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
