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
    throw new SyntaxError(`${error}. ${ctx.fileName}:${1}:${ctx.start + 1}`)
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

function readString(ctx, quote) {
    const start = ctx.pos++

    for (;;) {
        if (ctx.pos >= ctx.input.length) {
            raise(ctx, "Unterminated string constant")
        }

        const charCode = ctx.input.charCodeAt(ctx.pos)
        ctx.pos++

        if (charCode === quote) {
            break
        }
    }

    ctx.type = types.string
    ctx.value = ctx.input.slice(start, ctx.pos)
}

function readNumber(ctx) {
    for (; ctx.pos < Infinity; ctx.pos++) {
        const charCode = ctx.input.charCodeAt(ctx.pos)
        if (charCode < 48 || charCode > 57) {
            break
        }
    }

    ctx.type = types.num
    ctx.value = ctx.input.slice(ctx.start, ctx.pos)
}

function readPlusMinus(ctx, charCode) {
    const nextCharCode = ctx.input.charCodeAt(ctx.pos + 1)
    if (nextCharCode === charCode) {
        ctx.type = types.incrementDecrement
        ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 2)
        ctx.pos += 2
        return
    }

    if (nextCharCode === 61) {
        ctx.type = types.assign
        ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 2)
        ctx.pos += 2
        return
    }

    ctx.type = types.plusMinus
    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.pos++
}

function finishTokenEquals(ctx, type) {
    const nextCharCode = ctx.input.charCodeAt(ctx.pos + 1)
    if (nextCharCode === 61) {
        ctx.type = types.assign
        ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 2)
        ctx.pos += 2
        return
    }

    ctx.type = type
    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.pos++
}

function readEquality(ctx) {
    let size = 1

    let nextCharCode = ctx.input.charCodeAt(ctx.pos + 1)
    if (nextCharCode === 61) {
        size++
    }
    nextCharCode = ctx.input.charCodeAt(ctx.pos + 2)
    if (nextCharCode === 61) {
        size++
    }

    if (size === 1 && nextCharCode === 33) {
        unexpected(ctx)
    }

    ctx.type = size === 1 ? types.assign : types.equality
    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + size)
    ctx.pos += size
}

function readGreaterThan(ctx) {
    const nextCharCode = ctx.input.charCodeAt(ctx.pos + 1)
    if (nextCharCode === 61) {
        ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 2)
        ctx.type = types.greaterThanEquals
        ctx.pos += 2
        return
    }

    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.type = types.greaterThan
    ctx.pos++
}

function readLessThan(ctx) {
    const nextCharCode = ctx.input.charCodeAt(ctx.pos + 1)
    if (nextCharCode === 61) {
        ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 2)
        ctx.type = types.lessThanEquals
        ctx.pos += 2
        return
    }

    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.type = types.lessThan
    ctx.pos++
}

function finishToken(ctx, type) {
    ctx.type = type
    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.pos++
}

function getTokenFromCode(ctx, charCode) {
    switch (charCode) {
        case 34:
        case 39: // " '
            readString(ctx, charCode)
            return

        case 37:
            finishTokenEquals(ctx, types.modulo)
            return

        case 40:
            finishToken(ctx, types.parenthesisL)
            return

        case 41:
            finishToken(ctx, types.parenthesisR)
            return

        case 42:
            finishTokenEquals(ctx, types.star)
            return

        case 43:
        case 45: // '+ -'
            readPlusMinus(ctx, charCode)
            return

        case 44:
            finishToken(ctx, types.comma)
            return

        case 47:
            finishTokenEquals(ctx, types.slash)
            return

        case 48:
        case 49:
        case 50:
        case 51:
        case 52:
        case 53:
        case 54:
        case 55:
        case 56:
        case 57: // 0-9
            readNumber(ctx)
            return

        case 33:
        case 61: // '! ='
            readEquality(ctx)
            return

        case 60:
            readLessThan(ctx)
            return
        case 62:
            readGreaterThan(ctx)
            return

        case 123:
            finishToken(ctx, types.braceL)
            return
        case 125:
            finishToken(ctx, types.braceR)
            return

        case 59:
            finishToken(ctx, types.semicolon)
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

function parseLiteral(ctx) {
    const node = {
        type: "Literal",
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

        case types.string:
        case types.true:
        case types.false:
        case types.null:
            return parseLiteral(ctx)

        case types.parenthesisL:
            return parseParenthesisExpression(ctx)

        case types.new:
            return parseNew(ctx)

        default:
            unexpected(ctx)
    }
}

function parseBindingAtom(ctx) {
    return parseIdentifier(ctx)
}

function parseMaybeUnary(ctx) {
    const start = ctx.start

    if (ctx.type.prefix) {
        const start = ctx.start
        const operator = ctx.value
        const isUpdate = ctx.type === types.incrementDecrement

        nextToken(ctx)

        const argument = parseMaybeUnary(ctx)

        return {
            type: isUpdate ? "UpdateExpression" : "UnaryExpression",
            start,
            end: ctx.end,
            operator,
            prefix: true,
            argument,
        }
    }

    const expr = parseExpressionSubscripts(ctx)

    if (ctx.type.postfix) {
        const operator = ctx.value
        const end = ctx.end

        nextToken(ctx)

        return {
            type: "UpdateExpression",
            start,
            end,
            operator,
            prefix: false,
            argument: expr,
        }
    }

    return expr
}

function parseSubscript(ctx, base) {
    const start = ctx.start

    if (!eat(ctx, types.parenthesisL)) {
        return base
    }

    const callee = base
    const args = parseExpressionList(ctx, types.parenthesisR)

    return {
        type: "CallExpression",
        start,
        end: ctx.end,
        callee,
        arguments: args,
        optional: false,
    }
}

function parseSubscripts(ctx, base) {
    const subscript = parseSubscript(ctx, base)

    return subscript
}

function parseExpressionSubscripts(ctx) {
    const expression = parseExpressionAtom(ctx)

    return parseSubscripts(ctx, expression)
}

function parseExpressionOps(ctx) {
    const expression = parseMaybeUnary(ctx)

    return parseExpressionOp(ctx, expression, -1)
}

function parseExpressionOp(ctx, left, minPrecedence) {
    const precendence = ctx.type.binop
    if (precendence !== 0 && precendence > minPrecedence) {
        const operator = ctx.value

        nextToken(ctx)

        const expression = parseMaybeUnary(ctx)
        const right = parseExpressionOp(ctx, expression, precendence)
        const node = {
            type: "BinaryExpression",
            start: left.start,
            end: ctx.end,
            left,
            operator,
            right,
        }

        return parseExpressionOp(ctx, node, minPrecedence)
    }

    return left
}

function parseMaybeConditional(ctx) {
    return parseExpressionOps(ctx)
}

function parseMaybeAssign(ctx) {
    const left = parseMaybeConditional(ctx)
    if (ctx.type.isAssign) {
        checkLValue(ctx, left)

        const operator = ctx.value

        nextToken(ctx)

        const right = parseMaybeAssign(ctx)

        return {
            type: "AssignmentExpression",
            start: left.start,
            end: ctx.end,
            left,
            operator,
            right,
        }
    }

    return left
}

function parseExpression(ctx) {
    const start = ctx.start
    const expression = parseMaybeAssign(ctx)

    if (ctx.type === types.comma) {
        const expressions = [expression]
        while (eat(ctx, types.comma)) {
            const sequenceExpression = parseMaybeAssign(ctx)
            expressions.push(sequenceExpression)
        }

        return {
            type: "SequenceExpression",
            start,
            end: ctx.end,
            expressions,
        }
    }

    return expression
}

function parseExpressionStatement(ctx, expression) {
    return {
        type: "ExpressionStatement",
        start: expression.start,
        end: ctx.end,
        expression,
    }
}

function parseExpressionList(ctx, closeToken) {
    let first = true

    const expressions = []
    while (!eat(ctx, closeToken)) {
        if (first) {
            first = false
        } else {
            expect(ctx, types.comma)
        }

        const expression = parseMaybeAssign(ctx)
        expressions.push(expression)
    }

    return expressions
}

function parseStatement(ctx) {
    switch (ctx.type) {
        case types.var:
        case types.let:
        case types.const:
            return parseVarStatement(ctx)
        case types.if:
            return parseIfStatement(ctx)
        case types.while:
            return parseWhileStatement(ctx)
        case types.for:
            return parseForStatement(ctx)
        case types.return:
            return parseReturnStatement(ctx)
        case types.function:
            return parseFunctionStatement(ctx)
        case types.braceL:
            return parseBlock(ctx)
        case types.semicolon:
            return parseEmptyStatement(ctx)
    }

    const expression = parseExpression(ctx)
    return parseExpressionStatement(ctx, expression)
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

function parseWhileStatement(ctx) {
    const start = ctx.start

    nextToken(ctx)

    const test = parseParenthesisExpression(ctx)
    const body = parseBlock(ctx)

    return {
        type: "WhileStatement",
        start,
        end: ctx.end,
        test,
        body,
    }
}

function parseForStatement(ctx) {
    const start = ctx.start

    nextToken(ctx)

    expect(ctx, types.parenthesisL)
    const init = ctx.type === types.semicolon ? null : parseVarStatement(ctx)
    expect(ctx, types.semicolon)
    const test = ctx.type === types.semicolon ? null : parseExpression(ctx)
    expect(ctx, types.semicolon)
    const update = ctx.type === types.parenthesisR ? null : parseExpression(ctx)
    expect(ctx, types.parenthesisR)

    const body = parseStatement(ctx)

    return {
        type: "ForStatement",
        start,
        end: ctx.end,
        init,
        test,
        update,
        body,
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

function parseNew(ctx) {
    const start = ctx.start

    nextToken(ctx)

    const callee = parseExpressionAtom(ctx)
    expect(ctx, types.parenthesisL)
    const args = parseExpressionList(ctx, types.parenthesisR)

    return {
        type: "NewExpression",
        start,
        end: ctx.end,
        callee,
        arguments: args,
    }
}

function parseEmptyStatement(ctx) {
    const node = {
        type: "EmptyStatement",
        start: ctx.start,
        end: ctx.end,
    }

    nextToken(ctx)

    return node
}

function parseFunctionStatement(ctx) {
    nextToken(ctx)

    return parseFunction(ctx)
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

function parseVar(ctx, kind) {
    const node = {
        type: "VariableDeclarator",
        start: ctx.start,
        end: 0,
        id: null,
        init: null,
    }

    node.id = parseBindingAtom(ctx)

    if (eat(ctx, types.assign)) {
        node.init = parseMaybeAssign(ctx)
    } else if (kind === "const" && ctx.type !== types.name) {
        raise(ctx, "Missing initializer in const declaration.")
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
        start,
        end: ctx.pos,
        body,
    }
}

function checkLValue(ctx, node) {
    switch (node.type) {
        case "Identifier":
            break

        default:
            raise(ctx, `Invalid left-hand side in assignment expression.`)
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
    return result
}

function token(label, options = {}) {
    return {
        label,
        keyword: options.keyword || false,
        binop: options.binop || 0,
        prefix: options.prefix || false,
        postfix: options.postfix || false,
        isAssign: options.isAssign || false,
    }
}

function keyword(name) {
    const keywordToken = token(name, { keyword: true })
    keywords[name] = keywordToken

    return keywordToken
}

function binop(name, binop) {
    return token(name, { binop })
}

const keywords = {}

const types = {
    assign: token("=", { isAssign: true }),
    equality: token("==/===", { binop: 1 }),
    incrementDecrement: token("++/--", { prefix: true, postfix: true }),
    greaterThan: binop(">", 7),
    lessThan: binop("<", 7),
    greaterThanEquals: binop(">=", 7),
    lessThanEquals: binop("<=", 7),
    star: binop("*", 10),
    slash: binop("/", 10),
    modulo: binop("%", 10),
    comma: token(","),
    semicolon: token(";"),
    parenthesisL: token("("),
    parenthesisR: token(")"),
    braceL: token("{"),
    braceR: token("}"),
    eof: token("eof"),
    name: token("name"),
    num: token("num"),
    string: token("string"),
    plusMinus: token("+/-", { binop: 9, prefix: true }),
    var: keyword("var"),
    let: keyword("let"),
    const: keyword("const"),
    new: keyword("new"),
    function: keyword("function"),
    if: keyword("if"),
    true: keyword("true"),
    false: keyword("false"),
    null: keyword("null"),
    return: keyword("return"),
    while: keyword("while"),
    for: keyword("for"),
}
