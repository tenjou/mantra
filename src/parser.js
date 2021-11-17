import { raise, unexpected } from "./error.js"
import { canInsertSemicolon, eat, expect, expectContextual, kinds, nextTemplateToken, nextToken } from "./tokenizer.js"

function parseIdentifier(ctx) {
    if (ctx.kind !== kinds.name && !ctx.kind.keyword) {
        unexpected(ctx)
    }

    const node = {
        kind: "Identifier",
        start: ctx.start,
        end: ctx.end,
        value: ctx.value,
    }

    nextToken(ctx)

    return node
}

function parseNumericLiteral(ctx) {
    const node = {
        kind: "NumericLiteral",
        start: ctx.start,
        end: ctx.end,
        value: ctx.value,
    }

    nextToken(ctx)

    return node
}

function parseLiteral(ctx) {
    const node = {
        kind: "Literal",
        start: ctx.start,
        end: ctx.end,
        value: ctx.value,
        raw: ctx.raw,
    }

    nextToken(ctx)

    return node
}

function parseExpressionAtom(ctx) {
    switch (ctx.kind) {
        case kinds.name:
            return parseIdentifier(ctx)

        case kinds.num:
            return parseNumericLiteral(ctx)

        case kinds.text:
        case kinds.true:
        case kinds.false:
        case kinds.null:
        case kinds.break:
        case kinds._undefined:
            return parseLiteral(ctx)

        case kinds.parenthesisL:
            return parseParenthesisExpression(ctx)

        case kinds.braceL:
            return parseObjectExpression(ctx)

        case kinds.bracketL:
            return parseArrayExpression(ctx)

        case kinds.new:
            return parseNew(ctx)

        case kinds.backQuote:
            return parseTemplate(ctx)

        default:
            unexpected(ctx)
    }
}

function parseBindingAtom(ctx) {
    if (ctx.kind === kinds.braceL) {
        return parseObjectExpression(ctx)
    }

    return parseIdentifier(ctx)
}

function parseTypeAnnotation(ctx) {
    const node = {
        kind: "TypeAnnotation",
        start: ctx.start,
        end: 0,
        value: ctx.value,
    }

    nextToken(ctx)
    node.end = ctx.end

    return node
}

function parseMaybeDefault(ctx) {
    const start = ctx.start
    const left = parseBindingAtom(ctx)

    if (ctx.kind === kinds.colon) {
        nextToken(ctx)
        left.type = parseTypeAnnotation(ctx)
    }

    if (!eat(ctx, kinds.assign)) {
        return left
    }

    const right = parseMaybeAssign(ctx)

    return {
        kind: "AssignPattern",
        start,
        end: ctx.end,
        left,
        right,
    }
}

function parseMaybeUnary(ctx) {
    const start = ctx.start

    if (ctx.kind.prefix) {
        const operator = ctx.value
        const isUpdate = ctx.kind === kinds.incrementDecrement

        nextToken(ctx)

        const argument = parseMaybeUnary(ctx)

        return {
            kind: isUpdate ? "UpdateExpression" : "UnaryExpression",
            start,
            end: ctx.end,
            operator,
            prefix: true,
            argument,
        }
    }

    const expr = parseExpressionSubscripts(ctx)

    if (ctx.kind.postfix) {
        const operator = ctx.value
        const end = ctx.end

        nextToken(ctx)

        return {
            kind: "UpdateExpression",
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
    const computed = eat(ctx, kinds.bracketL)

    if (computed || eat(ctx, kinds.dot)) {
        const object = parseSubscript(ctx, base)

        let property
        if (computed) {
            property = parseExpression(ctx)
            expect(ctx, kinds.bracketR)
        } else {
            property = parseIdentifier(ctx)
        }

        return {
            kind: "MemberExpression",
            start: base.start,
            end: ctx.end,
            object,
            property,
            computed,
        }
    } else if (!eat(ctx, kinds.parenthesisL)) {
        return base
    }

    const start = ctx.start
    const callee = base
    const args = parseExpressionList(ctx, kinds.parenthesisR)

    return {
        kind: "CallExpression",
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
    const precendence = ctx.kind.binop
    if (precendence !== 0 && precendence > minPrecedence) {
        const operator = ctx.value
        const isLogical = ctx.kind === kinds.logicalOr || ctx.kind === kinds.logicalAnd

        nextToken(ctx)

        const expression = parseMaybeUnary(ctx)
        const right = parseExpressionOp(ctx, expression, precendence)
        const node = {
            kind: isLogical ? "LogicalExpression" : "BinaryExpression",
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

    if (eat(ctx, kinds.question)) {
        const consequent = parseMaybeAssign(ctx)

        expect(ctx, kinds.colon)

        const alternate = parseMaybeAssign(ctx)

        return {
            kind: "ConditionExpression",
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
    if (ctx.kind.isAssign) {
        checkLValue(ctx, left)

        const operator = ctx.value

        nextToken(ctx)

        const right = parseMaybeAssign(ctx)

        return {
            kind: "AssignmentExpression",
            start: left.start,
            end: ctx.end,
            left,
            operator,
            right,
            type: null,
        }
    }

    return left
}

function parseExpression(ctx) {
    const start = ctx.start
    const expression = parseMaybeAssign(ctx)

    if (ctx.kind === kinds.comma) {
        const expressions = [expression]
        while (eat(ctx, kinds.comma)) {
            const sequenceExpression = parseMaybeAssign(ctx)
            expressions.push(sequenceExpression)
        }

        return {
            kind: "SequenceExpression",
            start,
            end: ctx.end,
            expressions,
        }
    }

    return expression
}

function parseExpressionStatement(ctx, expression) {
    return {
        kind: "ExpressionStatement",
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
            expect(ctx, kinds.comma)
        }

        const expression = parseMaybeAssign(ctx)
        expressions.push(expression)
    }

    return expressions
}

function parseStatement(ctx) {
    switch (ctx.kind) {
        case kinds.var:
        case kinds.let:
        case kinds.const:
            return parseVarStatement(ctx)
        case kinds.break:
            return parseBreakStatement(ctx)
        case kinds.continue:
            return parseContinueStatement(ctx)
        case kinds.if:
            return parseIfStatement(ctx)
        case kinds.switch:
            return parseSwitchStatement(ctx)
        case kinds.while:
            return parseWhileStatement(ctx)
        case kinds.for:
            return parseForStatement(ctx)
        case kinds.return:
            return parseReturnStatement(ctx)
        case kinds.function:
            return parseFunctionStatement(ctx)
        case kinds.try:
            return parseTryStatement(ctx)
        case kinds.throw:
            return parseThrowStatement(ctx)
        case kinds.braceL:
            return parseBlock(ctx)
        case kinds.semicolon:
            return parseEmptyStatement(ctx)
        case kinds.export:
            return parseExport(ctx)
        case kinds.import:
            return parseImport(ctx)
    }

    const expression = parseExpression(ctx)
    return parseExpressionStatement(ctx, expression)
}

function parseVarStatement(ctx) {
    const node = {
        kind: "VariableDeclaration",
        start: ctx.start,
        end: 0,
        keyword: ctx.value,
        declarations: [],
    }

    nextToken(ctx)

    for (;;) {
        const decl = parseVar(ctx, node.kind)
        node.declarations.push(decl)

        if (!eat(ctx, kinds.comma)) {
            break
        }
    }

    node.end = ctx.end

    return node
}

function parseBreakStatement(ctx) {
    const start = ctx.start

    nextToken(ctx)

    return {
        kind: "BreakStatement",
        start,
        end: ctx.endLast,
        label: null,
    }
}

function parseContinueStatement(ctx) {
    const start = ctx.start

    nextToken(ctx)

    return {
        kind: "ContinueStatement",
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
    const alternate = eat(ctx, kinds.else) ? parseStatement(ctx) : null

    return {
        kind: "IfStatement",
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

    expect(ctx, kinds.braceL)

    let currCase = null
    while (ctx.kind !== kinds.braceR) {
        if (ctx.kind === kinds.case || ctx.kind === kinds.default) {
            const nodeStart = ctx.start
            const isCase = ctx.kind === kinds.case

            nextToken(ctx)

            const test = isCase ? parseExpression(ctx) : null

            expect(ctx, kinds.colon)

            currCase = {
                kind: "SwitchCase",
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

    eat(ctx, kinds.braceR)

    return {
        kind: "SwitchStatement",
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
        kind: "WhileStatement",
        start,
        end: ctx.end,
        test,
        body,
    }
}

function parseForInOf(ctx, left, start) {
    const isForIn = ctx.kind === kinds.in

    nextToken(ctx)

    const right = isForIn ? parseExpression(ctx) : parseMaybeAssign(ctx)

    expect(ctx, kinds.parenthesisR)

    const body = parseStatement(ctx)

    return {
        kind: isForIn ? "ForInStatement" : "ForOfStatement",
        start,
        end: ctx.end,
        left,
        right,
        body,
    }
}

function parseForStatement(ctx) {
    const start = ctx.start
    let init = null

    nextToken(ctx)

    expect(ctx, kinds.parenthesisL)

    if (ctx.kind === kinds.const || ctx.kind === kinds.let) {
        init = parseVarStatement(ctx)

        if (ctx.kind === kinds.in || ctx.kind === kinds.of) {
            return parseForInOf(ctx, init, start)
        }
    }

    expect(ctx, kinds.semicolon)
    const test = ctx.kind === kinds.semicolon ? null : parseExpression(ctx)
    expect(ctx, kinds.semicolon)
    const update = ctx.kind === kinds.parenthesisR ? null : parseExpression(ctx)
    expect(ctx, kinds.parenthesisR)

    const body = parseStatement(ctx)

    return {
        kind: "ForStatement",
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
        kind: "ReturnStatement",
        start,
        end: ctx.endLast,
        argument,
    }
}

function parseParenthesisExpression(ctx) {
    expect(ctx, kinds.parenthesisL)
    const expression = parseExpression(ctx)
    expect(ctx, kinds.parenthesisR)

    return expression
}

function parseProperty(ctx) {
    const start = ctx.start

    let key
    let computed = false

    if (eat(ctx, kinds.bracketL)) {
        key = parseMaybeAssign(ctx)
        computed = true
        expect(ctx, kinds.bracketR)
    } else if (ctx.kind === kinds.string || ctx.kind === kinds.number) {
        key = parseExpressionAtom(ctx)
    } else {
        key = parseIdentifier(ctx)
    }

    let value = null
    if (eat(ctx, kinds.colon)) {
        value = parseMaybeAssign(ctx)
    }

    return {
        kind: "Property",
        start,
        end: ctx.end,
        key,
        value,
        computed,
        op: "init",
    }
}

function parseObjectExpression(ctx) {
    const start = ctx.start
    const properties = []
    let first = true

    nextToken(ctx)

    while (!eat(ctx, kinds.braceR)) {
        if (first) {
            first = false
        } else {
            expect(ctx, kinds.comma)

            if (ctx.kind === kinds.braceR) {
                nextToken(ctx)
                break
            }
        }

        const prop = parseProperty(ctx)
        properties.push(prop)
    }

    return {
        kind: "ObjectExpression",
        start,
        end: ctx.end,
        properties,
    }
}

function parseArrayExpression(ctx) {
    const start = ctx.start

    nextToken(ctx)

    const elements = parseExpressionList(ctx, kinds.bracketR)

    return {
        kind: "ArrayExpression",
        start,
        end: ctx.end,
        elements,
    }
}

function parseNew(ctx) {
    const start = ctx.start

    nextToken(ctx)

    const callee = parseExpressionAtom(ctx)
    expect(ctx, kinds.parenthesisL)
    const args = parseExpressionList(ctx, kinds.parenthesisR)

    return {
        kind: "NewExpression",
        start,
        end: ctx.end,
        callee,
        arguments: args,
    }
}

function parseTemplateElement(ctx) {
    nextTemplateToken(ctx)

    return {
        kind: "TemplateElement",
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

    while (ctx.kind !== kinds.backQuote) {
        nextTemplateToken(ctx)
        expect(ctx, kinds.dollarBraceL)

        const expression = parseExpression(ctx)
        expressions.push(expression)

        if (ctx.kind !== kinds.braceR) {
            unexpected(ctx)
        }

        const span = parseTemplateElement(ctx)
        quasis.push(span)
    }

    nextToken(ctx)

    return {
        kind: "TemplateLiteral",
        start,
        end: ctx.end,
        expressions,
        quasis,
    }
}

function parseEmptyStatement(ctx) {
    const node = {
        kind: "EmptyStatement",
        start: ctx.start,
        end: ctx.end,
    }

    nextToken(ctx)

    return node
}

function parseImportSpecifiers(ctx) {
    const nodes = []

    if (ctx.kind === kinds.name) {
        const start = ctx.start
        const end = ctx.end
        const imported = parseIdentifier(ctx)

        checkLValue(ctx, imported)

        const node = {
            kind: "ImportDefaultSpecifier",
            start,
            end,
            imported,
        }
        nodes.push(node)

        if (!eat(ctx, kinds.comma)) {
            return nodes
        }
    }

    let first = true

    expect(ctx, kinds.braceL)

    while (!eat(ctx, kinds.braceR)) {
        if (first) {
            first = false
        } else {
            expect(ctx, kinds.comma)
        }

        const start = ctx.start
        const imported = parseIdentifier(ctx)

        nodes.push({
            kind: "ImportSpecifier",
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
        kind: "ExportNamedDeclaration",
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
        kind: "ImportDeclaration",
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
        kind: "ThrowStatement",
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
    const id = ctx.kind === kinds.name ? parseIdentifier(ctx) : null
    const params = parseFunctionParams(ctx)

    ctx.inFunction = true

    const body = parseFunctionBody(ctx)

    ctx.inFunction = false

    const expression = false
    const generator = false
    const async = false

    return {
        kind: "FunctionDeclaration",
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
    expect(ctx, kinds.parenthesisL)

    let first = true

    const params = []
    while (!eat(ctx, kinds.parenthesisR)) {
        if (first) {
            first = false
        } else {
            expect(ctx, kinds.comma)
        }

        const left = parseMaybeDefault(ctx)
        params.push(left)
    }

    return params
}

function parseFunctionBody(ctx) {
    return parseBlock(ctx)
}

function parseTryStatement(ctx) {
    const start = ctx.start

    nextToken(ctx)

    const block = parseBlock(ctx)
    let handler = null
    let finalizer = null

    if (ctx.kind === kinds.catch) {
        const startClause = ctx.start

        nextToken(ctx)
        expect(ctx, kinds.parenthesisL)

        const param = parseBindingAtom(ctx)
        checkLValue(ctx, param)
        expect(ctx, kinds.parenthesisR)

        const body = parseBlock(ctx)

        handler = {
            kind: "CatchClause",
            start: startClause,
            end: ctx.end,
            param,
            body,
        }
    }

    finalizer = eat(ctx, kinds.finally) ? parseBlock(ctx) : null

    if (!handler && !finalizer) {
        raise(ctx, "Missing catch or finally clause")
    }

    return {
        kind: "TryStatement",
        start,
        end: ctx.end,
        block,
        handler,
        finalizer,
    }
}

function parseBlock(ctx) {
    const start = ctx.start

    expect(ctx, kinds.braceL)

    const body = []
    while (ctx.kind !== kinds.braceR) {
        const statement = parseStatement(ctx)
        body.push(statement)
    }

    const end = ctx.end

    expect(ctx, kinds.braceR)

    return {
        kind: "BlockStatement",
        start,
        end,
        body,
    }
}

function parseVar(ctx, kind) {
    const node = {
        kind: "VariableDeclarator",
        start: ctx.start,
        end: 0,
        id: null,
        init: null,
        type: null,
    }

    node.id = parseBindingAtom(ctx)

    if (ctx.kind === kinds.colon) {
        nextToken(ctx)
        node.type = parseTypeAnnotation(ctx)
    }

    if (eat(ctx, kinds.assign)) {
        node.init = parseMaybeAssign(ctx)
    } else if (kind === "const" && ctx.kind !== kinds.in && ctx.kind !== kinds.of) {
        raise(ctx, "Missing initializer in const declaration.")
    }

    node.end = ctx.end

    return node
}

function parseTopLevel(ctx) {
    const start = ctx.start
    const body = []

    while (ctx.kind !== kinds.eof) {
        const statement = parseStatement(ctx)
        body.push(statement)
    }

    return {
        kind: "Program",
        start,
        end: ctx.pos,
        body,
    }
}

function checkLValue(ctx, node) {
    switch (node.kind) {
        case "Identifier":
        case "MemberExpression":
            break

        default:
            raise(ctx, `Invalid left-hand side in assignment expression.`)
    }
}

function canExportStatement(ctx) {
    return ctx.kind === kinds.function || ctx.kind === kinds.const || ctx.kind === kinds.let
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
        raw: undefined,
        kind: null,

        types: {},
    }

    nextToken(ctx)

    const result = parseTopLevel(ctx)
    return result
}
