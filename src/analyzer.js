import fs from "fs"
import path from "path"

function handleVariableDeclarator(ctx, node) {
    declareVar(ctx, node.id)
    handle[node.init.kind](ctx, node.init)
}

function handleVariableDeclaration(ctx, node) {
    for (const decl of node.declarations) {
        handleVariableDeclarator(ctx, decl)
    }
}

function handleFunctionDeclaration(ctx, node) {
    const func = declareFunc(ctx, node.id)
    ctx.scopeCurr = func.scope

    for (const param of node.params) {
        switch (param.kind) {
            case "Identifier":
                declareVar(ctx, param)
                break
            case "AssignPattern":
                declareVar(ctx, param.left)
                break
            default:
                raise(ctx, param, "Unsupported feature")
        }
    }

    handle[node.body.kind](ctx, node.body)

    ctx.scopeCurr = ctx.scopeCurr.parent
}

function handleImportDeclaration(ctx, node) {
    const fileDir = path.dirname(ctx.fileName)
    const fileExt = path.extname(node.source.value)
    const sourceFileName = fileExt ? node.source.value : `${node.source.value}.js`
    const filePath = path.resolve(fileDir, sourceFileName)
    if (!fs.existsSync(filePath)) {
        raise(ctx, node, `Cannot find module '${sourceFileName}' or its corresponding type declarations`)
    }
}

function handleExportNamedDeclaration(ctx, node) {
    handle[node.declaration.kind](ctx, node.declaration)
}

function handleExpressionStatement(ctx, node) {
    handle[node.expression.kind](ctx, node.expression)
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

function handleReturnStatement(ctx, node) {
    if (node.argument) {
        handle[node.argument.kind](ctx, node.argument)
    }
}

function handleBlockStatement(ctx, node) {
    ctx.scopeCurr = createScope(ctx.scopeCurr)

    handleStatements(ctx, node.body)

    ctx.scopeCurr = ctx.scopeCurr.parent
}

function handleAssignmentExpression(ctx, node) {
    handle[node.left.kind](ctx, node.left)
    handle[node.right.kind](ctx, node.right)
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
    handle[node.left.kind](ctx, node.left)
    handle[node.right.kind](ctx, node.right)
}

function handleMemberExpression(ctx, node) {
    // TODO: We should check the whole depth.
    handle[node.object.kind](ctx, node.object)
}

function handleCallExpression(ctx, node) {
    // TODO: Check if is a valid function call.
    // TODO: Check if number of arguments are correct.
    handle[node.callee.kind](ctx, node.callee)

    for (const arg of node.arguments) {
        handle[arg.kind](ctx, arg)
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

function handleStatements(ctx, body) {
    for (const node of body) {
        handle[node.kind](ctx, node)
    }
}

function handleIdentifier(ctx, node) {
    if (!exists(ctx, node.value)) {
        raise(ctx, node, `Cannot find name '${node.value}'`)
    }
}

function handleNoop(_ctx, _node) {}

function exists(ctx, value, isObject) {
    if (isObject) {
        if (ctx.scopeCurr.vars[value]) {
            return true
        }
    } else {
        let scope = ctx.scopeCurr

        while (scope) {
            if (scope.vars[value]) {
                return true
            }
            scope = scope.parent
        }
    }

    return false
}

function declareFunc(ctx, node) {
    if (exists(ctx, node.value)) {
        raise(ctx, node, `Duplicate function implementation '${node.value}'`)
    }

    const newVar = createVar()
    newVar.scope = createScope(ctx.scope)
    ctx.scopeCurr.vars[node.value] = newVar

    return newVar
}

function declareVar(ctx, node, isObject) {
    if (exists(ctx, node.value, isObject)) {
        raise(ctx, node, `Duplicate identifier '${node.value}'`)
    }

    const newVar = createVar()
    ctx.scopeCurr.vars[node.value] = newVar

    return newVar
}

function createScope(parent) {
    return {
        parent,
        vars: {},
    }
}

function createVar() {
    return {
        scope: null,
    }
}

function raise(ctx, node, error) {
    throw new SyntaxError(`${error}. ${ctx.fileName}:${1}:${node.start + 1}`)
}

export function analyze({ program, input, fileName }) {
    const scope = createScope(null)
    const ctx = {
        input,
        fileName,
        scope,
        scopeCurr: scope,
    }

    handleStatements(ctx, program.body)
}

const handle = {
    VariableDeclaration: handleVariableDeclaration,
    FunctionDeclaration: handleFunctionDeclaration,
    ImportDeclaration: handleImportDeclaration,
    ExportNamedDeclaration: handleExportNamedDeclaration,
    ExpressionStatement: handleExpressionStatement,
    IfStatement: handleIfStatement,
    BreakStatement: handleNoop,
    SwitchStatement: handleSwitchStatement,
    WhileStatement: handleWhileStatement,
    ReturnStatement: handleReturnStatement,
    BlockStatement: handleBlockStatement,
    AssignmentExpression: handleAssignmentExpression,
    UpdateExpression: handleUpdateExpression,
    UnaryExpression: handleUnaryExpression,
    LogicalExpression: handleLogicalExpression,
    BinaryExpression: handleBinaryExpression,
    MemberExpression: handleMemberExpression,
    CallExpression: handleCallExpression,
    ObjectExpression: handleObjectExpression,
    Identifier: handleIdentifier,
    Literal: handleNoop,
    NumericLiteral: handleNoop,
}
