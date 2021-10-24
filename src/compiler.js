function parseFunctionDeclaration(ctx, node) {
    const params = parseFunctionParams(ctx, node.params)
    const body = parseBlockStatement(ctx, node.body.statements)
    const result = `function ${node.id.name}(${params}) {\n${body}${ctx.spaces}}`

    return result
}

function parseFunctionParams(_ctx, params) {
    let result = ""
    let first = true

    for (const param of params) {
        if (first) {
            first = false
            result = param.name
            continue
        }

        result += `, ${param.name}`
    }

    return result
}

function parseVariableDeclaration(ctx, node) {
    const decls = parseDeclarations(ctx, node.declarations)
    const result = `${node.kind} ${decls}`

    return result
}

function parseDeclarations(ctx, decls) {
    let first = true

    let result = ""
    for (const decl of decls) {
        const init = parse[decl.init.type](ctx, decl.init)

        if (first) {
            first = false
            result = `${decl.id.name} = ${init}`
        } else {
            result += `, ${decl.id.name} = ${init}`
        }
    }

    return result
}

function parseIfStatement(ctx, node) {
    const test = parse[node.test.type](ctx, node.test)
    const consequent = parseBlockStatement(ctx, node.consequent.statements)
    const result = `if(${test}) {\n${consequent}${ctx.spaces}}`

    return result
}

function parseWhileStatement(ctx, node) {
    const test = parse[node.test.type](ctx, node.test)
    const body = parseBlockStatement(ctx, node.body.statements)
    const result = `while(${test}) {\n${body}${ctx.spaces}}`

    return result
}

function parseReturnStatement(ctx, node) {
    const argument = parse[node.argument.type](ctx, node.argument)
    const result = `return ${argument}`

    return result
}

function parseBinaryExpression(ctx, node) {
    const left = parse[node.left.type](ctx, node.left)
    const right = parse[node.right.type](ctx, node.right)
    const result = `${left} ${node.op} ${right}`

    return result
}

function parseCallExpression(ctx, node) {
    const callee = parse[node.callee.type](ctx, node.callee)
    const args = parseArgs(ctx, node.arguments)
    const result = `${callee}(${args})`

    return result
}

function parseArgs(ctx, args) {
    let result = ""
    let first = true

    for (const arg of args) {
        if (first) {
            first = false
            result = parse[arg.type](ctx, arg)
        } else {
            result += `, ${parse[arg.type](ctx, arg)}`
        }
    }

    return result
}

function parseIdentifier(_ctx, node) {
    return node.name
}

function parseLiteral(_ctx, node) {
    return node.value
}

function parseBlockStatement(ctx, body) {
    enterBlock(ctx)

    let result = ""

    for (const node of body) {
        const nodeResult = parse[node.type](ctx, node)
        result += `${ctx.spaces}${nodeResult}\n`
    }

    exitBlock(ctx)

    return result
}

function parseProgram(ctx, program) {
    let result = ""

    for (const node of program.body) {
        const nodeResult = parse[node.type](ctx, node)
        result += `${nodeResult}\n`
    }

    return result
}

export function compiler(program) {
    const ctx = {
        spaces: "",
    }

    return parseProgram(ctx, program)
}

function enterBlock(ctx) {
    ctx.spaces += "  "
}

function exitBlock(ctx) {
    ctx.spaces = ctx.spaces.substr(0, ctx.spaces.length - 2)
}

const parse = {
    VariableDeclaration: parseVariableDeclaration,
    FunctionDeclaration: parseFunctionDeclaration,
    IfStatement: parseIfStatement,
    WhileStatement: parseWhileStatement,
    ReturnStatement: parseReturnStatement,
    BinaryExpression: parseBinaryExpression,
    CallExpression: parseCallExpression,
    NumericLiteral: parseLiteral,
    Literal: parseLiteral,
    Identifier: parseIdentifier,
}
