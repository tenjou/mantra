function parseFunctionDeclaration(ctx, node) {
    const params = parseFunctionParams(ctx, node.params)
    const body = parse[node.body.type](ctx, node.body)
    const result = `function ${node.id.name}(${params}) ${body}\n`

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
    const consequent = parseBlockStatement(ctx, node.consequent)
    const alternate = node.alternate ? parse[node.alternate.type](ctx, node.alternate) : null
    let result = `if(${test}) ${consequent}`

    if (alternate) {
        result += ` else ${alternate}`
    }

    return result
}

function parseSwitchStatement(ctx, node) {
    const discriminant = parse[node.discriminant.type](ctx, node.discriminant)
    const cases = parseBlock(ctx, node.cases)
    const result = `switch(${discriminant}) ${cases}`

    return result
}

function parseSwitchCase(ctx, node) {
    const test = node.test ? parse[node.test.type](ctx, node.test) : null
    const consequent = node.consequent.length > 0 ? parseStatements(ctx, node.consequent) : ""
    const result = test ? `case ${test}:${consequent}` : `default:${consequent}`

    return result
}

function parseWhileStatement(ctx, node) {
    const test = parse[node.test.type](ctx, node.test)
    const body = parseBlockStatement(ctx, node.body)
    const result = `while(${test}) ${body}${ctx.spaces}`

    return result
}

function parseForStatement(ctx, node) {
    const init = node.init ? parse[node.init.type](ctx, node.init) : ""
    const test = node.test ? parse[node.test.type](ctx, node.test) : ""
    const update = node.update ? parse[node.update.type](ctx, node.update) : ""
    const body = parse[node.body.type](ctx, node.body)
    const result = `for(${init};${test};${update}) ${body}`

    return result
}

function parseReturnStatement(ctx, node) {
    const argument = node.argument ? parse[node.argument.type](ctx, node.argument) : ""
    const result = `return ${argument}`

    return result
}

function parseBreakStatement(ctx, node) {
    const result = `break`

    return result
}

function parseExpressionStatement(ctx, node) {
    const result = parse[node.expression.type](ctx, node.expression)

    return result
}

function parseThrowStatement(ctx, node) {
    const argument = parse[node.argument.type](ctx, node.argument)
    const result = `throw ${argument}`

    return result
}

function parseEmptyStatement(ctx, node) {
    return ""
}

function parseSequenceExpression(ctx, node) {
    let result = ""
    let first = true

    for (const expression of node.expressions) {
        const parsedExpression = parse[expression.type](ctx, expression)

        if (first) {
            first = false
            result = parsedExpression
        } else {
            result += `, ${parsedExpression}`
        }
    }

    return result
}

function parseBinaryExpression(ctx, node) {
    const left = parse[node.left.type](ctx, node.left)
    const right = parse[node.right.type](ctx, node.right)
    const result = `(${left} ${node.operator} ${right})`

    return result
}

function parseAssignmentExpression(ctx, node) {
    const left = parse[node.left.type](ctx, node.left)
    const right = parse[node.right.type](ctx, node.right)
    const result = `${left} ${node.operator} ${right}`

    return result
}

function parseUpdateExpression(ctx, node) {
    const argument = parse[node.argument.type](ctx, node.argument)
    const result = node.prefix ? `${node.operator}${argument}` : `${argument}${node.operator}`

    return result
}

function parseMemberExpression(ctx, node) {
    const object = parse[node.object.type](ctx, node.object)
    const property = parse[node.property.type](ctx, node.property)

    if (node.computed) {
        const result = `${object}[${property}]`
        return result
    }

    const result = `${object}.${property}`
    return result
}

function parseCallExpression(ctx, node) {
    const callee = parse[node.callee.type](ctx, node.callee)
    const args = parseArgs(ctx, node.arguments)
    const result = `${callee}(${args})`

    return result
}

function parseConditionExpression(ctx, node) {
    const test = parse[node.test.type](ctx, node.test)
    const consequent = parse[node.consequent.type](ctx, node.consequent)
    const alternate = parse[node.alternate.type](ctx, node.alternate)
    const result = `${test} ? ${consequent} : ${alternate}`

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

function parseStatements(ctx, statements) {
    enterBlock(ctx)

    let result = ""

    for (const statement of statements) {
        result += `\n${ctx.spaces}${parse[statement.type](ctx, statement)}`
    }

    exitBlock(ctx)

    return result
}

function parseIdentifier(_ctx, node) {
    return node.name
}

function parseLiteral(_ctx, node) {
    return node.value
}

function parseBlockStatement(ctx, node) {
    return parseBlock(ctx, node.body)
}

function parseBlock(ctx, body) {
    let result = `{`

    enterBlock(ctx)

    for (const statement of body) {
        const nodeResult = parse[statement.type](ctx, statement)
        result += `\n${ctx.spaces}${nodeResult}`
    }

    exitBlock(ctx)

    result += `\n${ctx.spaces}}`

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
    SwitchStatement: parseSwitchStatement,
    SwitchCase: parseSwitchCase,
    WhileStatement: parseWhileStatement,
    ForStatement: parseForStatement,
    ReturnStatement: parseReturnStatement,
    BreakStatement: parseBreakStatement,
    ExpressionStatement: parseExpressionStatement,
    ThrowStatement: parseThrowStatement,
    BlockStatement: parseBlockStatement,
    EmptyStatement: parseEmptyStatement,
    SequenceExpression: parseSequenceExpression,
    BinaryExpression: parseBinaryExpression,
    LogicalExpression: parseBinaryExpression,
    AssignmentExpression: parseAssignmentExpression,
    UpdateExpression: parseUpdateExpression,
    UnaryExpression: parseUpdateExpression,
    MemberExpression: parseMemberExpression,
    CallExpression: parseCallExpression,
    NewExpression: parseCallExpression,
    ConditionExpression: parseConditionExpression,
    NumericLiteral: parseLiteral,
    Literal: parseLiteral,
    Identifier: parseIdentifier,
}
