import { raise, unexpected } from "./error.js"
import { canInsertSemicolon, eat, expect, expectContextual, nextTemplateToken, nextToken, types } from "./tokenizer.js"

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
        case types.break:
            return parseLiteral(ctx)

        case types.parenthesisL:
            return parseParenthesisExpression(ctx)

        case types.braceL:
            return parseObject(ctx)

        case types.new:
            return parseNew(ctx)

        case types.backQuote:
            return parseTemplate(ctx)

        default:
            unexpected(ctx)
    }
}

function parseBindingAtom(ctx) {
    return parseIdentifier(ctx)
}

function parseMaybeDefault(ctx) {
    const start = ctx.start
    const left = parseBindingAtom(ctx)

    if (!eat(ctx, types.assign)) {
        return left
    }

    const right = parseMaybeAssign(ctx)

    return {
        type: "AssignPattern",
        start,
        end: ctx.end,
        left,
        right,
    }
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
    const computed = eat(ctx, types.bracketL)

    if (computed || eat(ctx, types.dot)) {
        const object = parseSubscript(ctx, base)

        let property
        if (computed) {
            property = parseExpression(ctx)
            expect(ctx, types.bracketR)
        } else {
            property = parseIdentifier(ctx)
        }

        return {
            type: "MemberExpression",
            start: base.start,
            end: ctx.end,
            object,
            property,
            computed,
        }
    } else if (!eat(ctx, types.parenthesisL)) {
        return base
    }

    const start = ctx.start
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
    while (true) {
        const subscript = parseSubscript(ctx, base)
        if (base === subscript) {
            break
        }

        base = subscript
    }

    return base
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
        const isLogical = ctx.type === types.logicalOr || ctx.type === types.logicalAnd

        nextToken(ctx)

        const expression = parseMaybeUnary(ctx)
        const right = parseExpressionOp(ctx, expression, precendence)
        const node = {
            type: isLogical ? "LogicalExpression" : "BinaryExpression",
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
    const start = ctx.start
    const expression = parseExpressionOps(ctx)

    if (eat(ctx, types.question)) {
        const consequent = parseMaybeAssign(ctx)

        expect(ctx, types.colon)

        const alternate = parseMaybeAssign(ctx)

        return {
            type: "ConditionExpression",
            start,
            end: ctx.end,
            test: expression,
            consequent,
            alternate,
        }
    }

    return expression
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
        case types.break:
            return parseBreak(ctx)
        case types.if:
            return parseIfStatement(ctx)
        case types.switch:
            return parseSwitchStatement(ctx)
        case types.while:
            return parseWhileStatement(ctx)
        case types.for:
            return parseForStatement(ctx)
        case types.return:
            return parseReturnStatement(ctx)
        case types.function:
            return parseFunctionStatement(ctx)
        case types.throw:
            return parseThrowStatement(ctx)
        case types.braceL:
            return parseBlock(ctx)
        case types.semicolon:
            return parseEmptyStatement(ctx)
        case types.export:
            return parseExport(ctx)
        case types.import:
            return parseImport(ctx)
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

function parseBreak(ctx) {
    const start = ctx.start

    nextToken(ctx)

    return {
        type: "BreakStatement",
        start,
        end: ctx.endLast,
        label: null,
    }
}

function parseIfStatement(ctx) {
    const start = ctx.start

    nextToken(ctx)

    const test = parseParenthesisExpression(ctx)
    const consequent = parseStatement(ctx)
    const alternate = eat(ctx, types.else) ? parseStatement(ctx) : null

    return {
        type: "IfStatement",
        start,
        end: ctx.end,
        test,
        consequent,
        alternate,
    }
}

function parseSwitchStatement(ctx) {
    const start = ctx.start

    nextToken(ctx)

    const discriminant = parseParenthesisExpression(ctx)
    const cases = []

    expect(ctx, types.braceL)

    let currCase = null
    while (ctx.type !== types.braceR) {
        if (ctx.type === types.case || ctx.type === types.default) {
            const nodeStart = ctx.start
            const isCase = ctx.type === types.case

            nextToken(ctx)

            const test = isCase ? parseExpression(ctx) : null

            expect(ctx, types.colon)

            currCase = {
                type: "SwitchCase",
                start: nodeStart,
                end: ctx.end,
                consequent: [],
                test,
            }
            cases.push(currCase)
            continue
        }

        if (!currCase) {
            unexpected(ctx)
        }

        const expression = parseStatement(ctx)
        currCase.consequent.push(expression)
    }

    eat(ctx, types.braceR)

    return {
        type: "SwitchStatement",
        start,
        end: ctx.end,
        discriminant,
        cases,
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

    let argument = null
    if (!canInsertSemicolon(ctx)) {
        argument = parseExpression(ctx)
    }

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

function parseProperty(ctx) {
    const start = ctx.start
    const key = parseLiteral(ctx)

    let value = null
    if (eat(ctx, types.colon)) {
        value = parseMaybeAssign(ctx)
    }

    return {
        type: "Property",
        start,
        end: ctx.end,
        key,
        value,
        kind: "init",
    }
}

function parseObject(ctx) {
    const start = ctx.start
    const properties = []

    nextToken(ctx)

    while (!eat(ctx, types.braceR)) {
        const prop = parseProperty(ctx)
        properties.push(prop)

        expect(ctx, types.comma)
    }

    return {
        type: "ObjectExpression",
        start,
        end: ctx.end,
        properties,
    }
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

function parseTemplateElement(ctx) {
    nextTemplateToken(ctx)

    return {
        type: "TemplateElement",
        start: ctx.start,
        end: ctx.end,
        value: ctx.value,
    }
}

function parseTemplate(ctx) {
    const start = ctx.start
    const element = parseTemplateElement(ctx)
    const expressions = []
    const quasis = [element]

    for (;;) {
        nextTemplateToken(ctx)
        expect(ctx, types.dollarBraceL)

        const expression = parseExpression(ctx)
        expressions.push(expression)

        if (ctx.type !== types.braceR) {
            unexpected(ctx)
        }

        const span = parseTemplateElement(ctx)
        quasis.push(span)

        if (ctx.type === types.backQuote) {
            break
        }
    }

    nextToken(ctx)

    return {
        type: "TemplateLiteral",
        start,
        end: ctx.end,
        expressions,
        quasis,
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

function parseImportSpecifiers(ctx) {
    const nodes = []
    let first = true

    expect(ctx, types.braceL)

    while (!eat(ctx, types.braceR)) {
        if (first) {
            first = false
        } else {
            expect(ctx, types.comma)
        }

        const start = ctx.start
        const imported = parseIdentifier(ctx)

        nodes.push({
            type: "ImportSpecifier",
            start,
            end: ctx.end,
            imported,
            local: null,
        })
    }

    return nodes
}

function parseExport(ctx) {
    const start = ctx.start

    nextToken(ctx)

    if (!canExportStatement(ctx)) {
        unexpected(ctx)
    }

    const declaration = parseStatement(ctx)
    const specifiers = []
    const source = null

    return {
        type: "ExportNamedDeclaration",
        start,
        end: ctx.end,
        declaration,
        specifiers,
        source,
    }
}

function parseImport(ctx) {
    const start = ctx.start

    nextToken(ctx)

    const specifiers = parseImportSpecifiers(ctx)

    expectContextual(ctx, "from")

    const source = parseExpressionAtom(ctx)

    return {
        type: "ImportDeclaration",
        start,
        end: ctx.end,
        specifiers,
        source,
    }
}

function parseThrowStatement(ctx) {
    const start = ctx.start

    nextToken(ctx)

    const argument = parseExpression(ctx)

    return {
        type: "ThrowStatement",
        start,
        end: ctx.end,
        argument,
    }
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

        const left = parseMaybeDefault(ctx)
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

    const end = ctx.end

    expect(ctx, types.braceR)

    return {
        type: "BlockStatement",
        start,
        end,
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
        case "MemberExpression":
            break

        default:
            raise(ctx, `Invalid left-hand side in assignment expression.`)
    }
}

function canExportStatement(ctx) {
    return ctx.type === types.function || ctx.type === types.const || ctx.type === types.let
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
