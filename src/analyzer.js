import fs from "fs"
import path from "path"
import { getLineInfo, raiseAt } from "./error.js"
import { coreTypes, Flags, loadCoreTypes, TypeKind, TypeKindNamed, useType } from "./types.js"

function handleVariableDeclarator(ctx, node, flags) {
    const newVar = declareVar(ctx, node.id.value, node, flags)

    if (node.init) {
        const initType = handle[node.init.kind](ctx, node.init)
        if (!newVar.type.kind) {
            newVar.type.kind = initType.kind
        } else if (newVar.type.kind !== initType.kind) {
            raiseTypeError(ctx, node.init.start, newVar.type, initType)
        }
    }
}

function handleVariableDeclaration(ctx, node) {
    const flags = node.keyword === "const" ? Flags.Const : 0

    for (const decl of node.declarations) {
        handleVariableDeclarator(ctx, decl, flags)
    }
}

function handleFunctionDeclaration(ctx, node) {
    if (getVar(ctx, node.id.value)) {
        raise(ctx, node.id, `Duplicate function implementation '${node.id.value}'`)
    }

    const type = {
        kind: TypeKind.Function,
        flags: 0,
        argsMin: 0,
        args: [],
    }
    const func = createVar(type, node)
    func.scope = createScope(ctx.scopeCurr)
    ctx.scopeCurr.vars[node.id.value] = func
    ctx.scopeCurr = func.scope

    for (const param of node.params) {
        switch (param.kind) {
            case "Identifier": {
                const argVar = declareVar(ctx, param.value, param, 0)
                type.args.push(argVar.type)
                type.argsMin++
                break
            }

            case "AssignPattern": {
                const argVar = declareVar(ctx, param.left.value, param.left, 0)
                const rightType = handle[param.right.kind](ctx, param.right)
                if (argVar.type.kind !== rightType.kind) {
                    raiseTypeError(ctx, param.right.start, argVar.type, rightType)
                }
                type.args.push(argVar.type)
                break
            }

            case "ObjectExpression":
                for (const property of param.properties) {
                    declareVar(ctx, property.key.value)
                }
                break

            default:
                raise(ctx, param, "Unsupported feature")
        }
    }

    ctx.scopeCurr = ctx.scopeCurr.parent
    ctx.scopeCurr.funcDecls.push(func)
}

function handleImportDeclaration(ctx, node) {
    // TODO: if it's a module check if it exists
    if (node.source.value.charCodeAt(0) === 46) {
        const fileDir = path.dirname(ctx.fileName)
        const fileExt = path.extname(node.source.value)
        const sourceFileName = fileExt ? node.source.value : `${node.source.value}.js`
        const filePath = path.resolve(fileDir, sourceFileName)
        if (!fs.existsSync(filePath)) {
            raise(ctx, node, `Cannot find module '${sourceFileName}' or its corresponding type declarations`)
        }
    }

    for (const entry of node.specifiers) {
        declareVar(ctx, entry.imported)
    }
}

function handleExportNamedDeclaration(ctx, node) {
    handle[node.declaration.kind](ctx, node.declaration)
}

function handleExpressionStatement(ctx, node) {
    handle[node.expression.kind](ctx, node.expression)
}

function handleConditionExpression(ctx, node) {
    handle[node.test.kind](ctx, node.test)
    handle[node.consequent.kind](ctx, node.consequent)
    handle[node.alternate.kind](ctx, node.alternate)
}

function handleIfStatement(ctx, node) {
    handle[node.test.kind](ctx, node.test)

    if (node.consequent) {
        handle[node.consequent.kind](ctx, node.consequent)
    }
    if (node.alternate) {
        handle[node.alternate.kind](ctx, node.alternate)
    }
}

function handleSwitchStatement(ctx, node) {
    handle[node.discriminant.kind](ctx, node.discriminant)

    for (const entry of node.cases) {
        if (entry.test) {
            handle[entry.test.kind](ctx, entry.test)
        }
        handleStatements(ctx, entry.consequent)
    }
}

function handleWhileStatement(ctx, node) {
    handle[node.test.kind](ctx, node.test)
    handleBlockStatement(ctx, node.body)
}

function handleForStatement(ctx, node) {
    if (node.init) {
        handle[node.init.kind](ctx, node.init)
    }
    if (node.test) {
        handle[node.test.kind](ctx, node.test)
    }
    if (node.update) {
        handle[node.update.kind](ctx, node.update)
    }

    handle[node.body.kind](ctx, node.body)
}

function handleForInStatement(ctx, node) {
    handle[node.left.kind](ctx, node.left)
    handle[node.right.kind](ctx, node.right)
    handle[node.body.kind](ctx, node.body)
}

function handleForOfStatement(ctx, node) {
    handle[node.left.kind](ctx, node.left)
    handle[node.right.kind](ctx, node.right)
    handle[node.body.kind](ctx, node.body)
}

function handleReturnStatement(ctx, node) {
    if (node.argument) {
        handle[node.argument.kind](ctx, node.argument)
    }
}

function handleThrowStatement(ctx, node) {
    handle[node.argument.kind](ctx, node.argument)
}

function handleTryStatement(ctx, node) {
    handle[node.block.kind](ctx, node.block)

    if (node.handler) {
        declareVar(ctx, node.handler.param)
        handle[node.handler.body.kind](ctx, node.handler.body)
    }
    if (node.finalize) {
        handle[node.finalize.kind](ctx, node.finalize)
    }
}

function handleBlockStatement(ctx, node) {
    ctx.scopeCurr = createScope(ctx.scopeCurr)

    handleStatements(ctx, node.body)

    ctx.scopeCurr = ctx.scopeCurr.parent
}

function handleAssignmentExpression(ctx, node) {
    const leftType = handle[node.left.kind](ctx, node.left)
    if (leftType.flags & Flags.Const) {
        raiseAt(ctx, node.left.start, `Cannot assign to '${node.left.value}' because it is a constant`)
    }

    const rightType = handle[node.right.kind](ctx, node.right)

    if (leftType.kind !== rightType.kind) {
        raiseTypeError(ctx, node.right.start, leftType, rightType)
    }
}

function handleUpdateExpression(ctx, node) {
    // TODO: Check if argument is a number.
    handle[node.argument.kind](ctx, node.argument)
}

function handleUnaryExpression(ctx, node) {
    handle[node.argument.kind](ctx, node.argument)
}

function handleLogicalExpression(ctx, node) {
    handle[node.left.kind](ctx, node.left)
    handle[node.right.kind](ctx, node.right)
}

function handleBinaryExpression(ctx, node) {
    const leftType = handle[node.left.kind](ctx, node.left)
    const rightType = handle[node.right.kind](ctx, node.right)

    if (
        (leftType.kind !== TypeKind.Number && leftType.kind !== TypeKind.String) ||
        (rightType.kind !== TypeKind.Number && rightType.kind !== TypeKind.String)
    ) {
        raiseAt(
            ctx,
            node.left.start,
            `Operator '${node.operator}' cannot be applied to types '${TypeKindNamed[leftType.kind]}' and '${
                TypeKindNamed[rightType.kind]
            }'`
        )
    }

    return leftType.kind > rightType.kind ? leftType : rightType
}

function handleMemberExpression(ctx, node) {
    // TODO: We should check the whole depth.
    handle[node.object.kind](ctx, node.object)
}

function handleCallExpression(ctx, node) {
    const type = handle[node.callee.kind](ctx, node.callee)
    if (type.kind !== TypeKind.Function) {
        raiseAt(ctx, node.callee.start, `This expression is not callable.\n  Type '${type.name}' has no call signatures`)
    }

    if (node.arguments.length < type.argsMin) {
        raiseAt(ctx, node.callee.start, `Expected ${type.argsMin} arguments, but got ${node.arguments.length}`)
    }
    if (node.arguments.length > type.argsMax) {
        raiseAt(ctx, node.callee.start, `Expected ${type.argsMax} arguments, but got ${node.arguments.length}`)
    }

    for (let n = 0; n < node.arguments.length; n++) {
        const arg = node.arguments[n]
        const argType = handle[arg.kind](ctx, arg)
        const funcArgType = type.args[n]
        if (funcArgType.kind !== argType.kind) {
            raiseTypeError(ctx, arg.start, funcArgType, argType)
        }
    }
}

function handleArrayExpression(ctx, node) {
    for (const element of node.elements) {
        handle[element.kind](ctx, element)
    }
}

function handleObjectExpression(ctx, node) {
    ctx.scopeCurr = createScope(ctx.scopeCurr)

    for (const entry of node.properties) {
        if (entry.op !== "init") {
            raise(ctx, entry, "Unsupported feature")
        }

        declareVar(ctx, entry.key, true)

        if (entry.value) {
            handle[entry.value.kind](ctx, entry.value)
        }
    }

    ctx.scopeCurr = ctx.scopeCurr.parent
}

function handleIdentifier(ctx, node) {
    const identifier = getVar(ctx, node.value)
    if (!identifier) {
        raise(ctx, node, `Cannot find name '${node.value}'`)
    }

    return identifier.type
}

function handleTemplateLiteral(ctx, node) {
    for (const expression of node.expressions) {
        handle[expression.kind](ctx, expression)
    }
}

function handleLiteral(_ctx, node) {
    if (node.value === "true" || node.value === "false") {
        return coreTypes.boolean
    }

    return coreTypes.string
}

function handleNumericLiteral(_ctx, _node) {
    return coreTypes.number
}

function handleNoop(_ctx, _node) {}

function handleStatements(ctx, body) {
    const scopeCurr = ctx.scopeCurr

    for (const node of body) {
        handle[node.kind](ctx, node)
    }

    const funcDecls = ctx.scopeCurr.funcDecls
    for (const decl of funcDecls) {
        ctx.scopeCurr = decl.scope
        handle[decl.node.body.kind](ctx, decl.node.body)
    }

    ctx.scopeCurr = scopeCurr
}

function getVar(ctx, value, isObject) {
    if (isObject) {
        const item = ctx.scopeCurr.vars[value]
        if (item) {
            return item
        }
    } else {
        let scope = ctx.scopeCurr

        while (scope) {
            let item = scope.vars[value]
            if (item) {
                return item
            }
            scope = scope.parent
        }
    }

    return null
}

function declareVar(ctx, name, node, flags, isObject = false) {
    const prevVar = getVar(ctx, name, isObject)
    if (prevVar) {
        raise(ctx, node, `Duplicate identifier '${name}'`)
    }

    const type = useType(ctx, node, flags)
    const newVar = createVar(type, node)
    ctx.scopeCurr.vars[name] = newVar

    return newVar
}

function createScope(parent, node = null) {
    return {
        parent,
        node,
        vars: {},
        funcDecls: [],
    }
}

function createVar(type, node) {
    return {
        scope: null,
        type,
        node,
    }
}

function raise(ctx, node, error) {
    const lineInfo = getLineInfo(ctx, node.start)
    throw new SyntaxError(`${error}. ${ctx.fileName}:${lineInfo.line}:${lineInfo.pos + 1}`)
}

function raiseTypeError(ctx, start, leftType, rightType) {
    raiseAt(ctx, start, `Type '${TypeKindNamed[rightType.kind]}' is not assignable to type '${TypeKindNamed[leftType.kind]}'`)
}

export function analyze({ program, input, fileName }) {
    const scope = createScope(null)
    const ctx = {
        input,
        fileName,
        scope,
        scopeCurr: scope,
        types: {},
    }

    loadCoreTypes(ctx)

    scope.vars["Infinity"] = createVar()
    scope.vars["NaN"] = createVar()
    scope.vars["console"] = createVar()

    handleStatements(ctx, program.body)
}

const handle = {
    VariableDeclaration: handleVariableDeclaration,
    FunctionDeclaration: handleFunctionDeclaration,
    ImportDeclaration: handleImportDeclaration,
    ExportNamedDeclaration: handleExportNamedDeclaration,
    ExpressionStatement: handleExpressionStatement,
    ConditionExpression: handleConditionExpression,
    IfStatement: handleIfStatement,
    BreakStatement: handleNoop,
    ContinueStatement: handleNoop,
    SwitchStatement: handleSwitchStatement,
    WhileStatement: handleWhileStatement,
    ForStatement: handleForStatement,
    ForInStatement: handleForInStatement,
    ForOfStatement: handleForOfStatement,
    ReturnStatement: handleReturnStatement,
    ThrowStatement: handleThrowStatement,
    TryStatement: handleTryStatement,
    BlockStatement: handleBlockStatement,
    AssignmentExpression: handleAssignmentExpression,
    UpdateExpression: handleUpdateExpression,
    UnaryExpression: handleUnaryExpression,
    LogicalExpression: handleLogicalExpression,
    BinaryExpression: handleBinaryExpression,
    MemberExpression: handleMemberExpression,
    CallExpression: handleCallExpression,
    ArrayExpression: handleArrayExpression,
    ObjectExpression: handleObjectExpression,
    Identifier: handleIdentifier,
    TemplateLiteral: handleTemplateLiteral,
    Literal: handleLiteral,
    NumericLiteral: handleNumericLiteral,
}
