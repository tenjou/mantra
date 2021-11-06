import fs from "fs"
import path from "path"

function handleFunctionDeclaration(ctx, node) {
    const func = declareFunc(ctx, ctx.scope, node.id)

    for (const param of node.params) {
        declareVar(ctx, func.scope, param)
    }
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

function handleBody(ctx, body) {
    for (const node of body) {
        handle[node.kind](ctx, node)
    }
}

export function analyze({ program, input, fileName }) {
    const ctx = {
        input,
        fileName,
        scope: createScope(),
    }

    handleBody(ctx, program.body)
}

function declareFunc(ctx, scope, node) {
    if (scope.vars[node.name]) {
        raise(ctx, "Duplicate function implementation", node)
    }

    const newVar = createVar()
    newVar.scope = createScope()
    scope.vars[node.name] = newVar

    return newVar
}

function declareVar(ctx, scope, node) {
    if (scope.vars[node.name]) {
        raise(ctx, node, `Duplicate identifier '${node.name}'`)
    }

    const newVar = createVar()
    scope.vars[node.name] = newVar

    return newVar
}

function createScope() {
    return {
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

const handle = {
    FunctionDeclaration: handleFunctionDeclaration,
    ImportDeclaration: handleImportDeclaration,
}
