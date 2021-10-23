function isIdentifierChar(charCode) {
    if (charCode < 65) {
        return false
    }
    if (charCode < 123) {
        return true
    }

    return false
}

function raise(ctx, error) {
    throw new SyntaxError(`${error}. ${ctx.fileName}:${0}:${ctx.start}`)
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

function getTokenFromCode(ctx, charCode) {
    switch (charCode) {
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

    if (isIdentifierChar(charCode)) {
        readWord(ctx)
    } else {
        getTokenFromCode(ctx, charCode)
    }

    ctx.endLast = ctx.end
    ctx.end = ctx.pos
}

function eat(ctx, type) {
    if (ctx.type === type) {
        nextToken(ctx)
        return true
    }

    return false
}

function parseIdentifier(ctx) {
    const node = {
        type: "Identifier",
        start: ctx.start,
        end: ctx.pos,
        name: ctx.value,
    }

    nextToken(ctx)

    return node
}

function parseNumericLiteral(ctx) {
    const node = {
        type: "NumericLiteral",
        start: ctx.start,
        end: ctx.end,
        value: ctx.value,
    }

    nextToken(ctx)

    return node
}

function parseExpressionAtom(ctx) {
    switch (ctx.type) {
        case types.name:
            return parseIdentifier(ctx)
        case types.num:
            return parseNumericLiteral(ctx)

        default:
            raise(ctx, "Unexpected token")
    }
}

function parseBindingAtom(ctx) {
    return parseIdentifier(ctx)
}

function parseMaybeAssign(ctx) {
    const left = parseExpressionAtom(ctx)

    if (ctx.type.binop) {
        return parseBinaryExpression(ctx, left)
    }

    return left
}

function parseExpression(ctx) {
    const start = ctx.pos
    const expression = parseMaybeAssign(ctx)

    return {
        type: "ExpressionStatement",
        expression,
        start,
        end: ctx.pos,
    }
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
        right,
        op,
    }
}

function parseStatement(ctx) {
    switch (ctx.type) {
        case types.var:
        case types.let:
        case types.const:
            return parseVarStatement(ctx)
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
        binop: options.binop || false,
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
    comma: token(","),
    eof: token("eof"),
    name: token("name"),
    num: token("num"),
    plusMinus: token("+/-", { binop: true }),
    var: keyword("var"),
    let: keyword("let"),
    const: keyword("const"),
}
