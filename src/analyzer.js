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
    const scopePrev = ctx.scopeCurr
    ctx.scopeCurr = func.scope

    for (const param of node.params) {
        declareVar(ctx, param)
    }

    handle[node.body.kind](ctx, node.body)

    ctx.scopeCurr = scopePrev
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

function handleIfStatement(ctx, node) {
    handle[node.test.kind](ctx, node.test)
}

function handleReturnStatement(ctx, node) {
    if (node.argument) {
        handle[node.argument.kind](ctx, node.argument)
    }
}

function handleBlockStatement(ctx, node) {
    handleBody(ctx, node.body)
}

function handleBinaryExpression(ctx, node) {
    handle[node.left.kind](ctx, node.left)
    handle[node.right.kind](ctx, node.right)
}

function handleBody(ctx, body) {
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

    handleBody(ctx, program.body)
}

const handle = {
    VariableDeclaration: handleVariableDeclaration,
    FunctionDeclaration: handleFunctionDeclaration,
    ImportDeclaration: handleImportDeclaration,
    IfStatement: handleIfStatement,
    ReturnStatement: handleReturnStatement,
    BlockStatement: handleBlockStatement,
    BinaryExpression: handleBinaryExpression,
    Identifier: handleIdentifier,
    Literal: handleNoop,
    NumericLiteral: handleNoop,
}
