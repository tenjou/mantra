function isIdentifierStart(charCode) {
    if (charCode < 65) {
        return false
    }
    if (charCode < 123) {
        return true
    }

    return false
}

function isIdentifierChar(charCode) {
    if (charCode < 48) {
        return false
    }
    if (charCode < 65) {
        return true
    }
    if (charCode < 123) {
        return true
    }

    return false
}

function raise(ctx, error) {
    throw new SyntaxError(`${error}. ${ctx.fileName}:${0}:${ctx.start}`)
}

function unexpected(ctx) {
    raise(ctx, "Unexpected token")
}

function eat(ctx, type) {
    if (ctx.type === type) {
        nextToken(ctx)
        return true
    }

    return false
}

function expect(ctx, type) {
    eat(ctx, type) || unexpected(ctx)
}

function skipSpace(ctx) {
    while (ctx.pos < ctx.input.length) {
        const charCode = ctx.input.charCodeAt(ctx.pos)
        switch (charCode) {
            case 10:
            case 32:
                ctx.pos++
                break

            default:
                return
        }
    }
}

function readWord(ctx) {
    while (ctx.pos < ctx.input.length) {
        const charCode = ctx.input.charCodeAt(ctx.pos)
        if (!isIdentifierChar(charCode)) {
            break
        }

        ctx.pos++
    }

    ctx.value = ctx.input.slice(ctx.start, ctx.pos)

    const keyword = keywords[ctx.value]
    if (keyword) {
        ctx.type = keyword
    } else {
        ctx.type = types.name
    }
}

function readNumber(ctx) {
    ctx.type = types.num

    for (; ctx.pos < Infinity; ctx.pos++) {
        const charCode = ctx.input.charCodeAt(ctx.pos)
        if (charCode < 48 || charCode > 57) {
            break
        }
    }

    ctx.value = Number(ctx.input.slice(ctx.start, ctx.pos))
}

function readPlusMinus(ctx) {
    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.type = types.plusMinus
    ctx.pos++
}

function readEquality(ctx) {
    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.type = types.equals
    ctx.pos++
}

function readGreaterThan(ctx) {
    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.type = types.greaterThan
    ctx.pos++
}

function readLessThan(ctx) {
    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.type = types.lessThan
    ctx.pos++
}

function getTokenFromCode(ctx, charCode) {
    switch (charCode) {
        case 40:
            ctx.pos++
            ctx.type = types.parenthesisL
            return
        case 41:
            ctx.pos++
            ctx.type = types.parenthesisR
            return

        case 43:
        case 45: // '+-'
            return readPlusMinus(ctx)

        case 44:
            ctx.pos++
            ctx.type = types.comma
            return

        case 49:
        case 50:
        case 51:
        case 52:
        case 53:
        case 54:
        case 55:
        case 56:
        case 57: // 1-9
            readNumber(ctx)
            return

        case 61:
            readEquality(ctx)
            return

        case 60:
            readLessThan(ctx)
            return
        case 62:
            readGreaterThan(ctx)
            return

        case 123:
            ctx.pos++
            ctx.type = types.braceL
            return
        case 125:
            ctx.pos++
            ctx.type = types.braceR
            return
    }

    raise(ctx, "Unsupported feature")
}

function nextToken(ctx) {
    skipSpace(ctx)

    if (ctx.pos >= ctx.input.length) {
        ctx.type = types.eof
        return
    }

    ctx.startLast = ctx.start
    ctx.start = ctx.pos

    const charCode = ctx.input.charCodeAt(ctx.pos)

    if (isIdentifierStart(charCode)) {
        readWord(ctx)
    } else {
        getTokenFromCode(ctx, charCode)
    }

    ctx.endLast = ctx.end
    ctx.end = ctx.pos
}

function parseIdentifier(ctx) {
    if (ctx.type !== types.name) {
        unexpected(ctx)
    }

    const node = {
        type: "Identifier",
        start: ctx.start,
        end: ctx.end,
        name: ctx.value,
    }

    nextToken(ctx)

    return node
}

function parseLiteral(ctx, type = "Literal") {
    const node = {
        type,
        start: ctx.start,
        end: ctx.end,
        value: ctx.value,
    }

    nextToken(ctx)

    return node
}

function parseTrue(ctx) {
    const node = {
        type: "True",
        start: ctx.start,
        end: ctx.end,
    }

    nextToken(ctx)

    return node
}

function parseFalse(ctx) {
    const node = {
        type: "False",
        start: ctx.start,
        end: ctx.end,
    }

    nextToken(ctx)

    return node
}

function parseExpressionAtom(ctx) {
    switch (ctx.type) {
        case types.name:
            return parseIdentifier(ctx)
        case types.num:
            return parseLiteral(ctx, "NumericLiteral")
        case types.true:
            return parseTrue(ctx)
        case types.false:
            return parseFalse(ctx)

        default:
            unexpected(ctx)
    }
}

function parseBindingAtom(ctx) {
    return parseIdentifier(ctx)
}

function parseMaybeAssign(ctx) {
    const left = parseExpressionAtom(ctx)

    if (ctx.type.op) {
        return parseBinaryExpression(ctx, left)
    }

    return left
}

function parseExpression(ctx) {
    const expression = parseMaybeAssign(ctx)
    return expression
    // const start = ctx.pos
    // const expression = parseMaybeAssign(ctx)

    // return {
    //     type: "ExpressionStatement",
    //     start,
    //     end: ctx.pos,
    //     expression,
    // }
}

function parseBinaryExpression(ctx, left) {
    const start = ctx.startLast

    const op = ctx.value
    nextToken(ctx)

    const right = parseExpressionAtom(ctx)

    return {
        type: "BinaryExpression",
        start,
        end: ctx.end,
        left,
        op,
        right,
    }
}

function parseStatement(ctx) {
    switch (ctx.type) {
        case types.var:
        case types.let:
        case types.const:
            return parseVarStatement(ctx)
        case types.if:
            return parseIfStatement(ctx)
        case types.return:
            return parseReturnStatement(ctx)
        case types.function:
            return parseFunctionStatement(ctx)
        case types.braceL:
            return parseBlock(ctx)
    }

    const expression = parseExpression(ctx)
    return expression
}

function parseVarStatement(ctx) {
    const node = {
        type: "VariableDeclaration",
        start: ctx.start,
        end: 0,
        kind: ctx.value,
        declarations: [],
    }

    nextToken(ctx)

    for (;;) {
        const decl = parseVar(ctx, node.kind)

        node.declarations.push(decl)

        if (!eat(ctx, types.comma)) {
            break
        }
    }

    node.end = ctx.end

    return node
}

function parseIfStatement(ctx) {
    const start = ctx.start

    nextToken(ctx)

    const test = parseParenthesisExpression(ctx)
    const consequent = parseBlock(ctx)
    const alternate = null

    return {
        type: "IfStatement",
        start,
        end: ctx.end,
        test,
        consequent,
        alternate,
    }
}

function parseReturnStatement(ctx) {
    if (!ctx.inFunction) {
        raise(ctx, "Illegal return statement")
    }

    const start = ctx.start

    nextToken(ctx)

    const argument = parseExpression(ctx)

    return {
        type: "ReturnStatement",
        start,
        end: ctx.endLast,
        argument,
    }
}

function parseParenthesisExpression(ctx) {
    expect(ctx, types.parenthesisL)
    const expression = parseExpression(ctx)
    expect(ctx, types.parenthesisR)

    return expression
}

function parseFunctionStatement(ctx) {
    nextToken(ctx)
    return parseFunction(ctx)
}

function parseVar(ctx, kind) {
    const node = {
        type: "VariableDeclarator",
        start: ctx.start,
        end: 0,
        id: null,
        init: null,
    }

    node.id = parseBindingAtom(ctx)

    if (eat(ctx, types.equals)) {
        node.init = parseMaybeAssign(ctx)
    } else if (kind === "const" && ctx.type !== types.name) {
        raise(ctx, "Missing initializer in const declaration")
    }

    node.end = ctx.end

    return node
}

function parseFunction(ctx) {
    const start = ctx.startLast
    const id = ctx.type === types.name ? parseIdentifier(ctx) : null
    const params = parseFunctionParams(ctx)

    ctx.inFunction = true

    const body = parseFunctionBody(ctx)

    ctx.inFunction = false

    const expression = false
    const generator = false
    const async = false

    return {
        type: "FunctionDeclaration",
        start,
        end: ctx.end,
        id,
        expression,
        generator,
        async,
        params,
        body,
    }
}

function parseFunctionParams(ctx) {
    expect(ctx, types.parenthesisL)

    let first = true

    const params = []
    while (!eat(ctx, types.parenthesisR)) {
        if (first) {
            first = false
        } else {
            expect(ctx, types.comma)
        }

        const left = parseBindingAtom(ctx)
        params.push(left)
    }

    return params
}

function parseFunctionBody(ctx) {
    return parseBlock(ctx)
}

function parseBlock(ctx) {
    const start = ctx.start

    expect(ctx, types.braceL)

    const body = []
    while (ctx.type !== types.braceR) {
        const statement = parseStatement(ctx)
        body.push(statement)
    }

    expect(ctx, types.braceR)

    return {
        type: "BlockStatement",
        start,
        end: ctx.end,
        body,
    }
}

function parseTopLevel(ctx) {
    const start = ctx.start
    const body = []

    while (ctx.type !== types.eof) {
        const statement = parseStatement(ctx)
        body.push(statement)
    }

    return {
        type: "Program",
        body,
        start,
        end: ctx.pos,
    }
}

export function parser(fileName, input) {
    const ctx = {
        fileName,
        input,
        pos: 0,
        start: 0,
        end: 0,
        startLast: 0,
        endLast: 0,

        inFunction: false,

        value: undefined,
        type: null,
    }

    nextToken(ctx)
    const result = parseTopLevel(ctx)

    console.log("-\n", JSON.stringify(result, null, "  "))

    return result
}

function token(label, options = {}) {
    return {
        label,
        keyword: options.keyword || false,
        op: options.op || false,
    }
}

function keyword(name) {
    const keywordToken = token(name, { keyword: true })
    keywords[name] = keywordToken

    return keywordToken
}

const keywords = {}

const types = {
    equals: token("="),
    greaterThan: token(">", { op: true }),
    lessThan: token("<", { op: true }),
    comma: token(","),
    parenthesisL: token("("),
    parenthesisR: token(")"),
    braceL: token("{"),
    braceR: token("}"),
    eof: token("eof"),
    name: token("name"),
    num: token("num"),
    plusMinus: token("+/-", { op: true }),
    var: keyword("var"),
    let: keyword("let"),
    const: keyword("const"),
    function: keyword("function"),
    if: keyword("if"),
    true: keyword("true"),
    false: keyword("false"),
    return: keyword("return"),
}
