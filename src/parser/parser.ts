import fs from "fs"
import * as path from "path"
import { Config } from "../config"
import { raiseAt, unexpected } from "../error"
import { createModule, Module } from "../module"
import { Kind } from "../types"
import * as Node from "./node"
import { canInsertSemicolon, eat, expect, expectContextual, kinds, nextTemplateToken, nextToken } from "./tokenizer"
import { Token } from "./tokenizer-types"
import * as TypeNode from "./type-node"

export interface ParserContext {
    config: Config
    fileDir: string
    fileName: string
    input: string
    pos: number
    start: number
    end: number
    startLast: number
    endLast: number

    inFunction: boolean

    value: string
    raw: string
    kind: Token

    types: {}
    modules: Record<string, Module>
}

let aliasCounter = 0

function parseNumericLiteral(ctx: ParserContext): Node.NumericLiteral {
    const node: Node.NumericLiteral = {
        kind: "NumericLiteral",
        start: ctx.start,
        end: ctx.end,
        value: ctx.value,
    }

    nextToken(ctx)

    return node
}

function parseBooleanLiteral(ctx: ParserContext): Node.BooleanLiteral {
    const node: Node.BooleanLiteral = {
        kind: "BooleanLiteral",
        start: ctx.start,
        end: ctx.end,
        value: ctx.value,
    }

    nextToken(ctx)

    return node
}

function parseLiteral(ctx: ParserContext): Node.Literal {
    const node: Node.Literal = {
        kind: "Literal",
        start: ctx.start,
        end: ctx.end,
        value: ctx.value,
        raw: ctx.raw,
    }

    nextToken(ctx)

    return node
}

function parseIdentifier(ctx: ParserContext): Node.Identifier {
    if (ctx.kind !== kinds.name && !ctx.kind.keyword) {
        unexpected(ctx)
    }

    const node: Node.Identifier = {
        kind: "Identifier",
        start: ctx.start,
        end: ctx.end,
        value: ctx.value,
    }

    nextToken(ctx)

    return node
}

function parseExpressionAtom(ctx: ParserContext): Node.Expression {
    switch (ctx.kind) {
        case kinds.name:
            return parseIdentifier(ctx)

        case kinds.num:
            return parseNumericLiteral(ctx)

        case kinds.true:
        case kinds.false:
            return parseBooleanLiteral(ctx)

        case kinds.text:
        case kinds.null:
        case kinds.break:
        case kinds._undefined:
            return parseLiteral(ctx)

        case kinds.bracketL:
            return parseArrayExpression(ctx)

        case kinds.parenthesisL:
            return parseArrowFunction(ctx)

        case kinds.braceL:
            return parseObjectExpression(ctx)

        case kinds.new:
            return parseNew(ctx)

        case kinds.backQuote:
            return parseTemplate(ctx)
    }

    unexpected(ctx)
}

function parseBindingAtom(ctx: ParserContext): Node.BindingAtom {
    if (ctx.kind === kinds.braceL) {
        return parseObjectExpression(ctx)
    }

    return parseIdentifier(ctx)
}

function parseTypeLiteral(ctx: ParserContext): TypeNode.Literal {
    const start = ctx.start

    expect(ctx, kinds.braceL)

    const members: TypeNode.PropertySignature[] = []

    while (!eat(ctx, kinds.braceR)) {
        const start = ctx.start
        const name = ctx.value

        nextToken(ctx)
        expect(ctx, kinds.colon)

        const type = parseTypeAnnotation(ctx)

        eat(ctx, kinds.semicolon)

        members.push({
            kind: "PropertySignature",
            start: start,
            end: ctx.end,
            name,
            type,
        })
    }

    return {
        kind: "TypeLiteral",
        start,
        end: ctx.end,
        members,
    }
}

function parseMaybeDefault(ctx: ParserContext): Node.AssignPattern | Node.BindingAtom {
    const start = ctx.start
    const left = parseBindingAtom(ctx)

    let type: TypeNode.Any | null = null
    if (ctx.kind === kinds.colon) {
        nextToken(ctx)
        type = parseTypeAnnotation(ctx)
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
        type,
    }
}

function parseMaybeUnary(ctx: ParserContext): Node.Expression {
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

function parseSubscript(ctx: ParserContext, base: Node.Expression): Node.Expression {
    const computed = eat(ctx, kinds.bracketL)

    if (computed || eat(ctx, kinds.dot)) {
        const object = parseSubscript(ctx, base)

        let property: Node.Expression
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
    const args = parseExpressionList(ctx, kinds.parenthesisR)

    return {
        kind: "CallExpression",
        start,
        end: ctx.end,
        callee: base,
        arguments: args,
        optional: false,
    }
}

function parseSubscripts(ctx: ParserContext, base: Node.Expression): Node.Expression {
    while (true) {
        const subscript = parseSubscript(ctx, base)
        if (base === subscript) {
            break
        }

        base = subscript
    }

    return base
}

function parseExpressionSubscripts(ctx: ParserContext): Node.Expression {
    const expression = parseExpressionAtom(ctx)

    return parseSubscripts(ctx, expression)
}

function parseExpressionOps(ctx: ParserContext): Node.Expression {
    const expression = parseMaybeUnary(ctx)

    return parseExpressionOp(ctx, expression, -1)
}

function parseExpressionOp(ctx: ParserContext, left: Node.Expression, minPrecedence: number): Node.Expression {
    const precendence = ctx.kind.binop
    if (precendence !== 0 && precendence > minPrecedence) {
        const operator = ctx.value
        const isLogical = ctx.kind === kinds.logicalOr || ctx.kind === kinds.logicalAnd
        const isComparison = ctx.kind.isComparison

        nextToken(ctx)

        const expression = parseMaybeUnary(ctx)
        const right = parseExpressionOp(ctx, expression, precendence)

        const node: Node.LogicalExpression | Node.BinaryExpression = {
            kind: isLogical ? "LogicalExpression" : "BinaryExpression",
            start: left.start,
            end: ctx.end,
            left,
            operator,
            right,
            isComparison,
        }

        return parseExpressionOp(ctx, node, minPrecedence)
    }

    return left
}

function parseMaybeConditional(ctx: ParserContext): Node.Expression {
    const start = ctx.start
    const test = parseExpressionOps(ctx)

    if (eat(ctx, kinds.question)) {
        const consequent = parseMaybeAssign(ctx)

        expect(ctx, kinds.colon)

        const alternate = parseMaybeAssign(ctx)

        return {
            kind: "ConditionalExpression",
            start,
            end: ctx.end,
            test,
            consequent,
            alternate,
        }
    }

    return test
}

function parseMaybeAssign(ctx: ParserContext): Node.Expression {
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

function parseExpression(ctx: ParserContext): Node.Expression {
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

function parseLabeledStatement(ctx: ParserContext, label: Node.Any): Node.LabeledStatement {
    const body = parseStatement(ctx)

    return {
        kind: "LabeledStatement",
        start: label.start,
        end: ctx.end,
        body,
        label,
    }
}

function parseExpressionStatement(ctx: ParserContext, expression: Node.Expression): Node.ExpressionStatement {
    return {
        kind: "ExpressionStatement",
        start: expression.start,
        end: ctx.end,
        expression,
    }
}

function parseExpressionList(ctx: ParserContext, closeToken: Token): Node.Expression[] {
    const expressions: Node.Expression[] = []

    while (!eat(ctx, closeToken)) {
        if (expressions.length > 0) {
            expect(ctx, kinds.comma)
        }

        const expression = parseMaybeAssign(ctx)
        expressions.push(expression)
    }

    return expressions
}

function parseStatement(ctx: ParserContext): Node.Statement {
    switch (ctx.kind) {
        case kinds.var:
        case kinds.let:
        case kinds.const:
            return parseVarStatement(ctx)
        case kinds.break:
        case kinds.continue:
            return parseBreakContinueStatement(ctx)
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
        case kinds.type:
            return parseTypeAliasDeclaration(ctx)
        case kinds.enum:
            return parseEnum(ctx)
    }

    const startKind = ctx.kind
    const expression = parseExpression(ctx)

    if (startKind === kinds.name && expression.kind === "Identifier" && eat(ctx, kinds.colon)) {
        return parseLabeledStatement(ctx, expression)
    }

    return parseExpressionStatement(ctx, expression)
}

function parseVarStatement(ctx: ParserContext): Node.VariableDeclaration {
    const node: Node.VariableDeclaration = {
        kind: "VariableDeclaration",
        start: ctx.start,
        end: 0,
        keyword: ctx.value,
        declarations: [],
    }

    nextToken(ctx)

    for (;;) {
        const decl = parseVar(ctx, node.keyword)
        node.declarations.push(decl)

        if (!eat(ctx, kinds.comma)) {
            break
        }
    }

    node.end = ctx.end

    return node
}

function parseBreakContinueStatement(ctx: ParserContext): Node.ContinueStatement | Node.BreakStatement {
    const start = ctx.start
    const kind = ctx.kind === kinds.continue ? "ContinueStatement" : "BreakStatement"

    nextToken(ctx)

    let label = null
    if (ctx.kind === kinds.name) {
        label = parseIdentifier(ctx)
    }

    return {
        kind,
        start,
        end: ctx.endLast,
        label,
    }
}

function parseIfStatement(ctx: ParserContext): Node.IfStatement {
    const start = ctx.start

    nextToken(ctx)

    const test = parseExpression(ctx)
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

function parseSwitchStatement(ctx: ParserContext): Node.SwitchStatement {
    const start = ctx.start

    nextToken(ctx)

    const discriminant = parseExpression(ctx)
    const cases: Node.SwitchCase[] = []

    expect(ctx, kinds.braceL)

    let currCase: Node.SwitchCase | null = null
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
                test,
                consequent: [],
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

function parseWhileStatement(ctx: ParserContext): Node.WhileStatement {
    const start = ctx.start

    nextToken(ctx)

    const test = parseExpression(ctx)
    const body = parseStatement(ctx)

    return {
        kind: "WhileStatement",
        start,
        end: ctx.end,
        test,
        body,
    }
}

function parseForInOf(ctx: ParserContext, left: Node.VariableDeclaration, start: number): Node.ForInStatement | Node.ForOfStatement {
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

function parseForStatement(ctx: ParserContext): Node.ForStatement | Node.ForInStatement | Node.ForOfStatement {
    const start = ctx.start
    let init: Node.VariableDeclaration | null = null

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

function parseReturnStatement(ctx: ParserContext): Node.ReturnStatement {
    if (!ctx.inFunction) {
        raiseAt(ctx, ctx.pos, "Illegal return statement")
    }

    const start = ctx.start

    nextToken(ctx)

    let argument: Node.Expression | null = null
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

function parseArrowFunction(ctx: ParserContext): Node.ArrowFunction {
    const start = ctx.start
    const params = parseFunctionParams(ctx)

    expect(ctx, kinds.arrow)

    let returnType = null
    if (ctx.kind === kinds.colon) {
        nextToken(ctx)
        returnType = parseTypeAnnotation(ctx)
    }

    ctx.inFunction = true
    const body = parseFunctionBody(ctx)
    ctx.inFunction = false

    return {
        kind: "ArrowFunction",
        start,
        end: ctx.end,
        body,
        params,
        returnType,
    }
}

function parseProperty(ctx: ParserContext): Node.Property {
    const start = ctx.start

    let key: Node.Identifier
    let computed = false

    // if (eat(ctx, kinds.bracketL)) {
    //     key = parseMaybeAssign(ctx)
    //     computed = true
    //     expect(ctx, kinds.bracketR)
    // } else if (ctx.kind === kinds.string || ctx.kind === kinds.number) {
    //     key = parseExpressionAtom(ctx)
    // } else {
    key = parseIdentifier(ctx)
    // }

    let value: Node.Expression | null = null
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

function parseObjectExpression(ctx: ParserContext): Node.ObjectExpression {
    const start = ctx.start
    const properties: Node.Property[] = []

    nextToken(ctx)

    while (!eat(ctx, kinds.braceR)) {
        if (properties.length > 0) {
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
        type: null,
        properties,
    }
}

function parseArrayExpression(ctx: ParserContext): Node.ArrayExpression {
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

function parseNew(ctx: ParserContext): Node.NewExpression {
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

function parseTemplateElement(ctx: ParserContext): Node.TemplateElement {
    nextTemplateToken(ctx)

    return {
        kind: "TemplateElement",
        start: ctx.start,
        end: ctx.end,
        value: ctx.value,
    }
}

function parseTemplate(ctx: ParserContext): Node.TemplateLiteral {
    const start = ctx.start
    const element = parseTemplateElement(ctx)
    const expressions: Node.Expression[] = []
    const quasis: Node.TemplateElement[] = [element]

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

function parseEmptyStatement(ctx: ParserContext): Node.EmptyStatement {
    const node: Node.EmptyStatement = {
        kind: "EmptyStatement",
        start: ctx.start,
        end: ctx.end,
    }

    nextToken(ctx)

    return node
}

function parseExport(ctx: ParserContext): Node.ExportNamedDeclaration {
    const start = ctx.start

    nextToken(ctx)

    if (!canExportStatement(ctx)) {
        unexpected(ctx)
    }

    const declaration = parseStatement(ctx)
    const specifiers: Node.Any[] = []
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

function parseImportSpecifiers(ctx: ParserContext): Node.ImportSpecifier[] {
    const specifiers: Node.ImportSpecifier[] = []

    expect(ctx, kinds.braceL)

    while (!eat(ctx, kinds.braceR)) {
        if (specifiers.length > 0) {
            expect(ctx, kinds.comma)
        }

        const start = ctx.start
        const imported = parseIdentifier(ctx)

        specifiers.push({
            kind: "ImportSpecifier",
            start,
            end: ctx.end,
            imported,
            local: null,
        })
    }

    return specifiers
}

function parseImportClause(ctx: ParserContext): Node.NamespaceImport | Node.NamedImports {
    const start = ctx.start

    switch (ctx.kind) {
        case kinds.star: {
            nextToken(ctx)
            expectContextual(ctx, "as")

            const name = parseIdentifier(ctx)
            return {
                kind: "NamespaceImport",
                start,
                end: ctx.end,
                name,
            }
        }

        case kinds.braceL: {
            const specifiers = parseImportSpecifiers(ctx)

            return {
                kind: "NamedImports",
                start,
                end: ctx.end,
                specifiers,
            }
        }

        default:
            unexpected(ctx)
    }
}

function parseImport(ctx: ParserContext): Node.ImportDeclaration {
    const start = ctx.start

    nextToken(ctx)

    let name: Node.Identifier | null = null

    if (ctx.kind === kinds.name) {
        name = parseIdentifier(ctx)
        eat(ctx, kinds.comma)
    }

    const importClause = parseImportClause(ctx)

    expectContextual(ctx, "from")

    const source = parseIdentifier(ctx)
    if (source.value.charCodeAt(0) === 46) {
        const fileExt = path.extname(source.value) || ".ts"
        const filePath = path.relative("./", `${source.value}${fileExt}`)
        const fullFilePath = path.resolve(ctx.config.rootDir, filePath)
        if (!fs.existsSync(fullFilePath)) {
            raiseAt(ctx, source.start, `Cannot find module '${fullFilePath}' or its corresponding type declarations`)
        }

        if (!ctx.modules[filePath]) {
            const module = parser(ctx.config, filePath, ctx.modules)
            ctx.modules[module.fileName] = module
        }
    }

    return {
        kind: "ImportDeclaration",
        start,
        end: ctx.end,
        importClause,
        name,
        source,
    }
}

function parseTypeAnnotationEntry(ctx: ParserContext): TypeNode.Any {
    if (ctx.kind === kinds.braceL) {
        return parseTypeLiteral(ctx)
    }
    if (ctx.kind === kinds.parenthesisL) {
        return parseFunctionType(ctx)
    }

    if (ctx.kind !== kinds.name) {
        unexpected(ctx)
    }

    const start = ctx.start
    const value = ctx.value

    nextToken(ctx)

    switch (value) {
        case "number":
            return {
                kind: "NumberKeyword",
                start,
                end: ctx.end,
            }

        case "string":
            return {
                kind: "StringKeyword",
                start,
                end: ctx.end,
            }

        case "boolean":
            return {
                kind: "BooleanKeyword",
                start,
                end: ctx.end,
            }

        case "void":
            return {
                kind: "VoidKeyword",
                start,
                end: ctx.end,
            }

        default:
            return {
                kind: "TypeReference",
                start,
                end: ctx.endLast,
                name: value,
            }
    }
}

function parseTypeAnnotation(ctx: ParserContext): TypeNode.Any {
    eat(ctx, kinds.bitwiseOr)

    const type = parseTypeAnnotationEntry(ctx)

    if (ctx.kind === kinds.bitwiseOr) {
        const types = [type]

        while (eat(ctx, kinds.bitwiseOr)) {
            const newType = parseTypeAnnotationEntry(ctx)
            types.push(newType)
        }

        return {
            kind: "UnionType",
            start: type.start,
            end: ctx.end,
            types,
        }
    } else if (ctx.kind === kinds.bracketL) {
        nextToken(ctx)
        expect(ctx, kinds.bracketR)

        return {
            kind: "ArrayType",
            start: type.start,
            end: ctx.end,
            elementType: type,
        }
    }

    return type
}

function parseTypeAliasDeclaration(ctx: ParserContext): Node.TypeAliasDeclaration {
    const start = ctx.start
    nextToken(ctx)

    const id = ctx.value
    nextToken(ctx)

    expect(ctx, kinds.assign)

    const type = parseTypeAnnotation(ctx)

    return {
        kind: "TypeAliasDeclaration",
        start,
        end: ctx.end,
        id,
        type,
    }
}

function parseParamsType(ctx: ParserContext): TypeNode.Parameter[] {
    expect(ctx, kinds.parenthesisL)

    const params: TypeNode.Parameter[] = []
    while (!eat(ctx, kinds.parenthesisR)) {
        if (params.length > 0) {
            expect(ctx, kinds.comma)
        }

        const start = ctx.start
        const name = parseIdentifier(ctx)

        expect(ctx, kinds.colon)

        const type = parseTypeAnnotation(ctx)

        params.push({
            kind: "Parameter",
            start,
            end: ctx.end,
            name,
            type,
        })
    }

    return params
}

function parseFunctionType(ctx: ParserContext): TypeNode.Function {
    const start = ctx.start
    const params = parseParamsType(ctx)

    expect(ctx, kinds.arrow)

    const type = parseTypeAnnotationEntry(ctx)

    return {
        kind: "FunctionType",
        start,
        end: ctx.end,
        type,
        params,
    }
}

function parseEnumInitializer(ctx: ParserContext): Node.Literal | Node.NumericLiteral | null {
    if (!eat(ctx, kinds.assign)) {
        return null
    }

    switch (ctx.kind) {
        case kinds.num:
            return parseNumericLiteral(ctx)

        case kinds.text:
        case kinds.true:
        case kinds.false:
        case kinds.null:
        case kinds.break:
        case kinds._undefined:
            return parseLiteral(ctx)
    }

    return null
}

function parseEnumMember(ctx: ParserContext): Node.EnumMember {
    const start = ctx.start
    const name = parseIdentifier(ctx)
    const initializer = parseEnumInitializer(ctx)

    return {
        kind: "EnumMember",
        start,
        end: ctx.end,
        name,
        initializer,
    }
}

function parseEnum(ctx: ParserContext): Node.EnumDeclaration {
    const start = ctx.start

    nextToken(ctx)
    const name = parseIdentifier(ctx)

    expect(ctx, kinds.braceL)

    const members: Node.EnumMember[] = []
    while (!eat(ctx, kinds.braceR)) {
        const member = parseEnumMember(ctx)
        members.push(member)

        expect(ctx, kinds.comma)
    }

    return {
        kind: "EnumDeclaration",
        start,
        end: ctx.end,
        name,
        members,
        type: Kind.unknown,
    }
}

function parseThrowStatement(ctx: ParserContext): Node.ThrowStatement {
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

function parseFunctionStatement(ctx: ParserContext): Node.FunctionDeclaration {
    nextToken(ctx)

    return parseFunctionDeclaration(ctx)
}

function parseFunctionDeclaration(ctx: ParserContext): Node.FunctionDeclaration {
    const start = ctx.startLast
    const id = ctx.kind === kinds.name ? parseIdentifier(ctx) : null
    const params = parseFunctionParams(ctx)

    let returnType: TypeNode.Any | null = null
    if (ctx.kind === kinds.colon) {
        nextToken(ctx)
        returnType = parseTypeAnnotation(ctx)
    }

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
        returnType,
    }
}

function parseFunctionParams(ctx: ParserContext): Node.Parameter[] {
    expect(ctx, kinds.parenthesisL)

    const params: Node.Parameter[] = []
    while (!eat(ctx, kinds.parenthesisR)) {
        if (params.length > 0) {
            expect(ctx, kinds.comma)
        }

        const start = ctx.start
        const id = parseIdentifier(ctx)

        let type: TypeNode.Any | null = null
        if (eat(ctx, kinds.colon)) {
            type = parseTypeAnnotation(ctx)
        }

        let initializer: Node.Expression | null = null
        if (eat(ctx, kinds.assign)) {
            initializer = parseExpressionAtom(ctx)
        }

        params.push({
            kind: "Parameter",
            start,
            end: ctx.end,
            id,
            initializer,
            type,
        })
    }

    return params
}

function parseFunctionBody(ctx: ParserContext): Node.BlockStatement {
    return parseBlock(ctx)
}

function parseTryStatement(ctx: ParserContext): Node.TryStatement {
    const start = ctx.start

    nextToken(ctx)

    const block = parseBlock(ctx)
    let handler: Node.CatchClause | null = null
    let finalizer: Node.BlockStatement | null = null

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
        raiseAt(ctx, ctx.pos, "Missing catch or finally clause")
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

function parseBlock(ctx: ParserContext): Node.BlockStatement {
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

function parseVar(ctx: ParserContext, kind: string): Node.VariableDeclarator {
    const start = ctx.start
    const id = parseIdentifier(ctx)

    let type: TypeNode.Any | null = null
    if (ctx.kind === kinds.colon) {
        nextToken(ctx)
        type = parseTypeAnnotation(ctx)
    }

    let init: Node.Expression | null = null
    if (eat(ctx, kinds.assign)) {
        init = parseMaybeAssign(ctx)
    } else if (kind === "const" && ctx.kind !== kinds.in && ctx.kind !== kinds.of) {
        raiseAt(ctx, ctx.pos, "Missing initializer in const declaration.")
    }

    return {
        kind: "VariableDeclarator",
        start: start,
        end: ctx.end,
        id,
        init,
        type,
    }
}

function parseTopLevel(ctx: ParserContext): Node.Program {
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

function checkLValue(ctx: ParserContext, node: Node.Expression): void {
    switch (node.kind) {
        case "Identifier":
        case "MemberExpression":
            break

        default:
            raiseAt(ctx, node.start, `Invalid left-hand side in assignment expression.`)
    }
}

function canExportStatement(ctx: ParserContext): boolean {
    return ctx.kind === kinds.function || ctx.kind === kinds.const || ctx.kind === kinds.let || ctx.kind === kinds.enum
}

export function parser(config: Config, srcFileName: string, modules = {}) {
    const fileDir = path.relative("./", path.dirname(srcFileName))
    const fileName = path.relative("./", srcFileName)
    const filePath = path.resolve(`${config.rootDir}/${fileDir}`, fileName)
    const input = fs.readFileSync(filePath, "utf8")

    const ctx: ParserContext = {
        config,
        fileDir,
        fileName,
        input,
        pos: 0,
        start: 0,
        end: 0,
        startLast: 0,
        endLast: 0,

        inFunction: false,

        value: "",
        raw: "",
        kind: kinds.eof,

        types: {},
        modules,
    }

    nextToken(ctx)

    const program = parseTopLevel(ctx)
    const alias = aliasCounter++

    return createModule(program, fileDir, fileName, input, alias)
}
