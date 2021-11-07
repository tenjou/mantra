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
        declareVar(ctx, param)
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

function handleStatements(ctx, body) {
    for (const node of body) {
        handle[node.kind](ctx, node)
    }
}

function handleIdentifier(ctx, node) {
    if (!exists(ctx, node.name)) {
        raise(ctx, node, `Cannot find name '${node.name}'`)
    }
}

function handleNoop(_ctx, _node) {}

function exists(ctx, name) {
    let scope = ctx.scopeCurr
    while (scope) {
        if (scope.vars[name]) {
            return true
        }
        scope = scope.parent
    }

    return false
}

function declareFunc(ctx, node) {
    if (exists(ctx, node.name)) {
        raise(ctx, "Duplicate function implementation", node)
    }

    const newVar = createVar()
    newVar.scope = createScope(ctx.scope)
    ctx.scopeCurr.vars[node.name] = newVar

    return newVar
}

function declareVar(ctx, node) {
    if (exists(ctx, node.name)) {
        raise(ctx, node, `Duplicate identifier '${node.name}'`)
    }

    const newVar = createVar()
    ctx.scopeCurr.vars[node.name] = newVar

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
    Identifier: handleIdentifier,
    Literal: handleNoop,
    NumericLiteral: handleNoop,
}
