import fs from "fs"
import * as path from "path"
import { Config } from "../config"
import { raiseAt, unexpected } from "../error"
import { createModule, Module } from "../module"
import {
    canInsertSemicolon,
    eat,
    expect,
    expectContextual,
    kinds,
    nextTemplateToken,
    nextToken,
    possibleArrowFunction,
} from "../tokenizer/tokenizer"
import { Token, Tokenizer } from "../tokenizer/tokenizer-types"
import { Kind } from "../types"
import * as Node from "./node"
import * as TypeNode from "./type-node"

export interface Context extends Tokenizer {
    config: Config
    inFunction: boolean
    types: {}
    modules: Record<string, Module>
}

let aliasCounter = 0

function parseNumericLiteral(ctx: Context): Node.NumericLiteral {
    const node: Node.NumericLiteral = {
        kind: "NumericLiteral",
        start: ctx.start,
        end: ctx.end,
        value: ctx.value,
    }

    nextToken(ctx)

    return node
}

function parseBooleanLiteral(ctx: Context): Node.BooleanLiteral {
    const node: Node.BooleanLiteral = {
        kind: "BooleanLiteral",
        start: ctx.start,
        end: ctx.end,
        value: ctx.value,
    }

    nextToken(ctx)

    return node
}

function parseLiteral(ctx: Context): Node.Literal {
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

function parseNullKeyword(ctx: Context): Node.NullKeyword {
    const start = ctx.start

    nextToken(ctx)

    return {
        kind: "NullKeyword",
        start: start,
        end: ctx.end,
    }
}

function parseIdentifier(ctx: Context): Node.Identifier {
    if (ctx.kind !== kinds.name && !ctx.kind.keyword) {
        unexpected(ctx, ctx.start)
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

function parseParenthesisExpression(ctx: Context): Node.Expression {
    if (possibleArrowFunction(ctx)) {
        return parseArrowFunction(ctx)
    }

    expect(ctx, kinds.parenthesisL)

    const expression = parseExpression(ctx)

    expect(ctx, kinds.parenthesisR)

    return expression
}

function parseExpressionAtom(ctx: Context): Node.Expression {
    switch (ctx.kind) {
        case kinds.name:
            return parseIdentifier(ctx)

        case kinds.num:
            return parseNumericLiteral(ctx)

        case kinds.true:
        case kinds.false:
            return parseBooleanLiteral(ctx)

        case kinds.text:
        case kinds.break:
        case kinds.undef:
            return parseLiteral(ctx)

        case kinds.null:
            return parseNullKeyword(ctx)

        case kinds.bracketL:
            return parseArrayExpression(ctx)

        case kinds.parenthesisL:
            return parseParenthesisExpression(ctx)

        case kinds.braceL:
            return parseObjectExpression(ctx)

        case kinds.new:
            return parseNew(ctx)

        case kinds.backQuote:
            return parseTemplate(ctx)
    }

    if (ctx.kind.keyword) {
        return parseIdentifier(ctx)
    }

    unexpected(ctx, ctx.pos)
}

function parseBindingAtom(ctx: Context): Node.BindingAtom {
    if (ctx.kind === kinds.braceL) {
        return parseObjectExpression(ctx)
    }

    return parseIdentifier(ctx)
}

function parseTypeLiteral(ctx: Context): TypeNode.Literal | TypeNode.MappedType {
    const start = ctx.start

    expect(ctx, kinds.braceL)

    if (eat(ctx, kinds.bracketL)) {
        const typeParam = parseTypeParameter(ctx)

        expect(ctx, kinds.bracketR)
        expect(ctx, kinds.colon)

        const type = parseTypeAnnotationEntry(ctx)

        expect(ctx, kinds.braceR)

        return {
            kind: "MappedType",
            start,
            end: ctx.end,
            type,
            typeParam,
        }
    }

    const members: TypeNode.PropertySignature[] = []

    while (!eat(ctx, kinds.braceR)) {
        const name = parseIdentifier(ctx)

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

function parseMaybeDefault(ctx: Context): Node.AssignPattern | Node.BindingAtom {
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

function parseMaybeUnary(ctx: Context): Node.Expression {
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

function parseSubscript(ctx: Context, base: Node.Expression): Node.Expression {
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
        args,
        optional: false,
    }
}

function parseSubscripts(ctx: Context, base: Node.Expression): Node.Expression {
    while (true) {
        const subscript = parseSubscript(ctx, base)
        if (base === subscript) {
            break
        }

        base = subscript
    }

    return base
}

function parseExpressionSubscripts(ctx: Context): Node.Expression {
    const expression = parseExpressionAtom(ctx)

    return parseSubscripts(ctx, expression)
}

function parseExpressionOps(ctx: Context): Node.Expression {
    const expression = parseMaybeUnary(ctx)

    return parseExpressionOp(ctx, expression, -1)
}

function parseExpressionOp(ctx: Context, left: Node.Expression, minPrecedence: number): Node.Expression {
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

function parseMaybeConditional(ctx: Context): Node.Expression {
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

function parseMaybeAssign(ctx: Context): Node.Expression {
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

    if (eat(ctx, kinds.as)) {
        const type = parseTypeAnnotation(ctx)

        return {
            kind: "AsExpression",
            start: left.start,
            end: ctx.end,
            expression: left,
            type,
        }
    }

    return left
}

function parseExpression(ctx: Context): Node.Expression {
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

function parseLabeledStatement(ctx: Context, label: Node.Any): Node.LabeledStatement {
    const body = parseStatement(ctx)

    return {
        kind: "LabeledStatement",
        start: label.start,
        end: ctx.end,
        body,
        label,
    }
}

function parseExpressionStatement(ctx: Context, expression: Node.Expression): Node.ExpressionStatement {
    return {
        kind: "ExpressionStatement",
        start: expression.start,
        end: ctx.end,
        expression,
    }
}

function parseExpressionList(ctx: Context, closeToken: Token): Node.Expression[] {
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

function parseStatement(ctx: Context): Node.Statement {
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
        case kinds.interface:
            return parseInterface(ctx)
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

function parseVarStatement(ctx: Context): Node.VariableDeclaration {
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

function parseBreakContinueStatement(ctx: Context): Node.ContinueStatement | Node.BreakStatement {
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

function parseIfStatement(ctx: Context): Node.IfStatement {
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

function parseSwitchStatement(ctx: Context): Node.SwitchStatement {
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
            unexpected(ctx, ctx.start)
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

function parseWhileStatement(ctx: Context): Node.WhileStatement {
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

function parseForInOf(ctx: Context, left: Node.VariableDeclaration, start: number): Node.ForInStatement | Node.ForOfStatement {
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

function parseForStatement(ctx: Context): Node.ForStatement | Node.ForInStatement | Node.ForOfStatement {
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

function parseReturnStatement(ctx: Context): Node.ReturnStatement {
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

function parseArrowFunction(ctx: Context): Node.ArrowFunction {
    const start = ctx.start
    const params = parseParameters(ctx)

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

function parseProperty(ctx: Context): Node.PropertyAssignment {
    const start = ctx.start

    let name: Node.Identifier | Node.NumericLiteral | Node.ComputedPropertyName
    let shouldHaveInitializer = false

    if (eat(ctx, kinds.bracketL)) {
        const id = parseIdentifier(ctx)

        if (eat(ctx, kinds.dot)) {
            const expression = parsePropertyAccessExpression(ctx, id)

            shouldHaveInitializer = true
            name = {
                kind: "ComputedPropertyName",
                start,
                end: ctx.end,
                expression,
            }
        } else {
            name = id
        }

        expect(ctx, kinds.bracketR)
    } else if (ctx.kind === kinds.name) {
        name = parseIdentifier(ctx)
    } else {
        name = parseNumericLiteral(ctx)
    }

    let initializer: Node.Expression | null = null
    if (shouldHaveInitializer ? expect(ctx, kinds.colon) : eat(ctx, kinds.colon)) {
        initializer = parseMaybeAssign(ctx)
    }

    return {
        kind: "PropertyAssignment",
        start,
        end: ctx.end,
        name,
        initializer,
    }
}

function parseObjectExpression(ctx: Context): Node.ObjectExpression {
    const start = ctx.start
    const properties: Node.PropertyAssignment[] = []

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

function parseArrayExpression(ctx: Context): Node.ArrayExpression {
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

function parseNew(ctx: Context): Node.NewExpression {
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
        args: args,
    }
}

function parseTemplateElement(ctx: Context): Node.TemplateElement {
    nextTemplateToken(ctx)

    return {
        kind: "TemplateElement",
        start: ctx.start,
        end: ctx.end,
        value: ctx.value,
    }
}

function parseTemplate(ctx: Context): Node.TemplateLiteral {
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
            unexpected(ctx, expression.start)
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

function parseEmptyStatement(ctx: Context): Node.EmptyStatement {
    const node: Node.EmptyStatement = {
        kind: "EmptyStatement",
        start: ctx.start,
        end: ctx.end,
    }

    nextToken(ctx)

    return node
}

function parseExport(ctx: Context): Node.ExportNamedDeclaration {
    const start = ctx.start

    nextToken(ctx)

    if (!canExportStatement(ctx.kind)) {
        unexpected(ctx, start)
    }

    const declaration = parseStatement(ctx)
    const specifiers: Node.Statement[] = []
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

function parseImportSpecifiers(ctx: Context): Node.ImportSpecifier[] {
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

function parseImportClause(ctx: Context): Node.NamespaceImport | Node.NamedImports {
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
            unexpected(ctx, start)
    }
}

function parseImport(ctx: Context): Node.ImportDeclaration {
    const start = ctx.start

    nextToken(ctx)

    let name: Node.Identifier | null = null

    if (ctx.kind === kinds.name) {
        name = parseIdentifier(ctx)
        eat(ctx, kinds.comma)
    }

    const importClause = parseImportClause(ctx)

    expectContextual(ctx, "from")

    const source = parseLiteral(ctx)
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

function parseTypeAnnotationEntry(ctx: Context): TypeNode.Any {
    if (ctx.kind === kinds.braceL) {
        return parseTypeLiteral(ctx)
    }
    if (ctx.kind === kinds.parenthesisL) {
        return parseFunctionType(ctx)
    }
    if (ctx.kind !== kinds.name && ctx.kind !== kinds.null && ctx.kind !== kinds.undef && ctx.kind !== kinds.never) {
        unexpected(ctx, ctx.start)
    }

    const left = parseIdentifier(ctx)

    switch (left.value) {
        case "number":
            return {
                kind: "NumberKeyword",
                start: left.start,
                end: ctx.end,
            }

        case "string":
            return {
                kind: "StringKeyword",
                start: left.start,
                end: ctx.end,
            }

        case "boolean":
            return {
                kind: "BooleanKeyword",
                start: left.start,
                end: ctx.end,
            }

        case "null":
            return {
                kind: "NullKeyword",
                start: left.start,
                end: ctx.end,
            }

        case "void":
            return {
                kind: "VoidKeyword",
                start: left.start,
                end: ctx.end,
            }

        case "undefined":
            return {
                kind: "UndefinedKeyword",
                start: left.start,
                end: ctx.end,
            }

        case "never":
            return {
                kind: "NeverKeyword",
                start: left.start,
                end: ctx.end,
            }

        default: {
            if (ctx.kind === kinds.dot) {
                nextToken(ctx)
                const right = parseIdentifier(ctx)

                return {
                    kind: "QualifiedName",
                    start: left.start,
                    end: ctx.end,
                    left,
                    right,
                }
            }

            let typeArgs: TypeNode.Any[] | null = null

            if (ctx.kind === kinds.lessThan) {
                nextToken(ctx)

                typeArgs = [parseTypeAnnotation(ctx)]
                while (!eat(ctx, kinds.greaterThan)) {
                    expect(ctx, kinds.comma)

                    const typeArg = parseTypeAnnotation(ctx)
                    typeArgs.push(typeArg)
                }
            }

            return {
                kind: "TypeReference",
                start: left.start,
                end: ctx.endLast,
                name: left,
                typeArgs,
            }
        }
    }
}

function parseTypeAnnotation(ctx: Context): TypeNode.Any {
    eat(ctx, kinds.bitwiseOr)

    let type = parseTypeAnnotationEntry(ctx)

    if (ctx.kind === kinds.bracketL) {
        nextToken(ctx)
        expect(ctx, kinds.bracketR)

        type = {
            kind: "ArrayType",
            start: type.start,
            end: ctx.end,
            elementType: type,
        }
    }

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
    }

    return type
}

function parseTypeParameter(ctx: Context): TypeNode.TypeParameter {
    const start = ctx.pos
    const name = parseIdentifier(ctx)

    let constraint: TypeNode.Any | null = null
    if ((ctx.kind === kinds.name && ctx.value === "extends") || ctx.kind === kinds.in) {
        nextToken(ctx)
        constraint = parseTypeAnnotation(ctx)
    }

    return {
        kind: "TypeParameter",
        name,
        start,
        end: ctx.end,
        constraint,
    }
}

function parseTypeAliasDeclaration(ctx: Context): Node.TypeAliasDeclaration {
    nextToken(ctx)

    const start = ctx.start
    const id = parseIdentifier(ctx)

    let typeParams: TypeNode.TypeParameter[] | null = null
    if (eat(ctx, kinds.lessThan)) {
        typeParams = [parseTypeParameter(ctx)]

        while (!eat(ctx, kinds.greaterThan)) {
            expect(ctx, kinds.comma)
            typeParams.push(parseTypeParameter(ctx))
        }
    }

    expect(ctx, kinds.assign)

    const type = parseTypeAnnotation(ctx)

    return {
        kind: "TypeAliasDeclaration",
        start,
        end: ctx.end,
        id,
        type,
        typeParams,
    }
}

function parseInterface(ctx: Context): Node.InterfaceDeclaration {
    const start = ctx.start

    nextToken(ctx)
    const name = parseIdentifier(ctx)

    let heritageClauses: Node.HeritageClause[] | null = null
    if (eat(ctx, kinds.extends)) {
        const heritageName = parseIdentifier(ctx)

        heritageClauses = [
            {
                kind: "HeritageClause",
                start: heritageName.start,
                end: ctx.end,
                name: heritageName,
            },
        ]
    }

    expect(ctx, kinds.braceL)

    const members: TypeNode.PropertySignature[] = []
    while (!eat(ctx, kinds.braceR)) {
        const name = parseIdentifier(ctx)

        expect(ctx, kinds.colon)

        const type = parseTypeAnnotation(ctx)

        members.push({
            kind: "PropertySignature",
            start: name.start,
            end: ctx.end,
            name,
            type,
        })
    }

    return {
        kind: "InterfaceDeclaration",
        start,
        end: ctx.end,
        name,
        members,
        heritageClauses,
    }
}

function parseParamsType(ctx: Context): TypeNode.Parameter[] {
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

function parseFunctionType(ctx: Context): TypeNode.Function {
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

function parseEnumInitializer(ctx: Context): Node.Literal | Node.NumericLiteral | null {
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
        case kinds.undef:
            return parseLiteral(ctx)
    }

    return null
}

function parseEnumMember(ctx: Context): Node.EnumMember {
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

function parseEnum(ctx: Context): Node.EnumDeclaration {
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

function parseThrowStatement(ctx: Context): Node.ThrowStatement {
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

function parseFunctionStatement(ctx: Context): Node.FunctionDeclaration {
    nextToken(ctx)

    return parseFunctionDeclaration(ctx)
}

function parseFunctionDeclaration(ctx: Context): Node.FunctionDeclaration {
    const start = ctx.startLast
    const id = ctx.kind === kinds.name ? parseIdentifier(ctx) : null
    const params = parseParameters(ctx)

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

function parsePropertyAccessExpression(
    ctx: Context,
    expression: Node.Identifier | Node.PropertyAccessExpression
): Node.PropertyAccessExpression {
    const name = parseIdentifier(ctx)
    const node: Node.PropertyAccessExpression = {
        kind: "PropertyAccessExpression",
        start: name.start,
        end: ctx.end,
        expression,
        name,
    }

    if (eat(ctx, kinds.dot)) {
        return parsePropertyAccessExpression(ctx, node)
    }

    return node
}

function parseParametersExpression(ctx: Context): Node.ParameterExpresion {
    switch (ctx.kind) {
        case kinds.name: {
            const name = parseIdentifier(ctx)
            if (eat(ctx, kinds.dot)) {
                return parsePropertyAccessExpression(ctx, name)
            }
            return name
        }

        case kinds.num:
            return parseNumericLiteral(ctx)

        case kinds.true:
        case kinds.false:
            return parseBooleanLiteral(ctx)

        case kinds.text:
        case kinds.null:
        case kinds.undef:
            return parseLiteral(ctx)
    }

    unexpected(ctx, ctx.start)
}

function parseParameters(ctx: Context): Node.Parameter[] {
    expect(ctx, kinds.parenthesisL)

    const params: Node.Parameter[] = []
    while (!eat(ctx, kinds.parenthesisR)) {
        if (params.length > 0) {
            expect(ctx, kinds.comma)
        }

        const start = ctx.start
        const id = parseIdentifier(ctx)

        let isOptional = false
        if (eat(ctx, kinds.question)) {
            isOptional = true
        }

        let type: TypeNode.Any | null = null
        if (eat(ctx, kinds.colon)) {
            type = parseTypeAnnotation(ctx)
        }

        let initializer: Node.ParameterExpresion | null = null
        if (eat(ctx, kinds.assign)) {
            initializer = parseParametersExpression(ctx)
        }

        params.push({
            kind: "Parameter",
            start,
            end: ctx.end,
            id,
            initializer,
            type,
            isOptional,
        })
    }

    return params
}

function parseFunctionBody(ctx: Context): Node.BlockStatement {
    return parseBlock(ctx)
}

function parseTryStatement(ctx: Context): Node.TryStatement {
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
        raiseAt(ctx, ctx.start, "Missing catch or finally clause")
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

function parseBlock(ctx: Context): Node.BlockStatement {
    expect(ctx, kinds.braceL)

    const start = ctx.start
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

function parseVar(ctx: Context, kind: string): Node.VariableDeclarator {
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

function parseTopLevel(ctx: Context): Node.Program {
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

function checkLValue(ctx: Tokenizer, node: Node.Expression): void {
    switch (node.kind) {
        case "Identifier":
        case "MemberExpression":
            break

        default:
            raiseAt(ctx, node.start, `Invalid left-hand side in assignment expression.`)
    }
}

function canExportStatement(token: Token): boolean {
    return (
        token === kinds.function ||
        token === kinds.const ||
        token === kinds.let ||
        token === kinds.enum ||
        token === kinds.interface ||
        token === kinds.type
    )
}

export function parser(config: Config, srcFileName: string, modules = {}) {
    const fileDir = path.relative("./", path.dirname(srcFileName))
    const fileName = path.relative("./", srcFileName)
    const filePath = path.resolve(config.rootDir, fileName)
    const input = fs.readFileSync(filePath, "utf8")

    const ctx: Context = {
        config,
        inFunction: false,
        types: {},
        modules,

        fileDir,
        fileName,
        input,
        pos: 0,
        start: 0,
        end: 0,
        startLast: 0,
        endLast: 0,
        value: "",
        raw: "",
        kind: kinds.eof,
    }

    nextToken(ctx)

    const program = parseTopLevel(ctx)
    const alias = aliasCounter++

    return createModule(program, fileDir, fileName, input, alias)
}
