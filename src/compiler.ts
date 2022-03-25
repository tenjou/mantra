import * as fs from "fs"
import * as path from "path"
import { Config } from "./config"
import { getFilePath } from "./file"
import { Module } from "./module"
import * as Node from "./parser/node"
import { Kind } from "./types"

const mantrLibFileName = "./__mantra__.js"

function parseFunctionDeclaration(ctx: CompilerContext, node: Node.FunctionDeclaration): string {
    const params = parseFunctionParams(ctx, node.params)
    const body = parse[node.body.kind](ctx, node.body)
    const id = node.id ? node.id.value : ""
    const result = `function ${id}(${params}) ${body}\n`

    return result
}

function parseFunctionParams(ctx: CompilerContext, params: Node.Parameter[]): string {
    let result = ""

    for (const param of params) {
        let initializer = ""
        if (param.initializer) {
            const output = parse[param.initializer.kind](ctx, param.initializer)
            initializer = ` = ${output}`
        }

        if (!result) {
            result = `${param.id.value}${initializer}`
            continue
        }

        result += `, ${param.id.value}${initializer}`
    }

    return result
}

function parseEnumDeclaration(ctx: CompilerContext, node: Node.EnumDeclaration): string {
    const name = parseIdentifier(ctx, node.name)

    enterBlock(ctx)

    let members = ""

    switch (node.type) {
        case Kind.string: {
            for (const member of node.members) {
                const memberName = parseIdentifier(ctx, member.name)
                if (member.initializer) {
                    members += `${ctx.spaces}${memberName}: "${member.initializer.value}",\n`
                } else {
                    members += `${ctx.spaces}${memberName}: undefined,\n`
                }
            }
            break
        }

        default: {
            let index = 0
            for (const member of node.members) {
                const memberName = parseIdentifier(ctx, member.name)
                if (member.initializer) {
                    index = parseInt(member.initializer.value, 10)
                }
                members += `${ctx.spaces}${memberName}: ${index},\n`
                index++
            }
            break
        }
    }

    exitBlock(ctx)

    const result = `const ${name} = {\n${members}}`

    return result
}

function parseVariableDeclarator(ctx: CompilerContext, node: Node.VariableDeclarator): string {
    const id = parse[node.id.kind](ctx, node.id)
    if (!node.init) {
        return id
    }

    const init = parse[node.init.kind](ctx, node.init)
    const result = `${id} = ${init}`

    return result
}

function parseDeclarations(ctx: CompilerContext, decls: Node.VariableDeclarator[]): string {
    let result = ""
    for (const decl of decls) {
        if (!result) {
            result = parseVariableDeclarator(ctx, decl)
            continue
        }

        result += `, ${parseVariableDeclarator(ctx, decl)}`
    }

    return result
}

function parseVariableDeclaration(ctx: CompilerContext, node: Node.VariableDeclaration): string {
    const decls = parseDeclarations(ctx, node.declarations)
    const result = `${node.keyword} ${decls}`

    return result
}

function parseExportNamedDeclaration(ctx: CompilerContext, node: Node.ExportNamedDeclaration): string {
    const declaration = parse[node.declaration.kind](ctx, node.declaration)
    if (!declaration) {
        return ""
    }

    const result = `export ${declaration}`
    return result
}

function parseImportClause(_ctx: CompilerContext, importClause: Node.NamespaceImport | Node.NamedImports): string {
    switch (importClause.kind) {
        case "NamedImports": {
            let result = ""

            for (const specifier of importClause.specifiers) {
                const specifierResult = specifier.local ? `${specifier.imported.value}: ${specifier.local.value}` : specifier.imported.value
                if (result) {
                    result += `, ${specifierResult}`
                } else {
                    result = specifierResult
                }
            }

            return `{ ${result} }`
        }

        case "NamespaceImport": {
            return `* as ${importClause.name.value}`
        }
    }
}

function parseImportDeclaration(ctx: CompilerContext, node: Node.ImportDeclaration): string {
    const importClause = parseImportClause(ctx, node.importClause)
    const filePath = getFilePath(ctx.module.fileDir, node.source.value)
    const module = ctx.modules[filePath]
    const importPath = module ? `${node.source.value}.js` : filePath
    const result = `import ${importClause} from "${importPath}"\n`

    return result
}

function parseArrowFunction(ctx: CompilerContext, node: Node.ArrowFunction): string {
    const body = parse[node.body.kind](ctx, node.body)
    const params = parseFunctionParams(ctx, node.params)
    const result = `(${params}) => ${body}`

    return result
}

function parseLabeledStatement(ctx: CompilerContext, node: Node.LabeledStatement): string {
    const label = parse[node.label.kind](ctx, node.label)
    const body = parse[node.body.kind](ctx, node.body)
    const result = `${label}: ${body}`

    return result
}

function parseIfStatement(ctx: CompilerContext, node: Node.IfStatement): string {
    const test = parse[node.test.kind](ctx, node.test)
    const consequent = parse[node.consequent.kind](ctx, node.consequent)
    const alternate = node.alternate ? parse[node.alternate.kind](ctx, node.alternate) : null

    let result = `if(${test}) ${consequent}`
    if (alternate) {
        result += ` else ${alternate}`
    }

    return result
}

function parseSwitchStatement(ctx: CompilerContext, node: Node.SwitchStatement): string {
    const discriminant = parse[node.discriminant.kind](ctx, node.discriminant)
    const cases = parseBlock(ctx, node.cases)
    const result = `switch(${discriminant}) ${cases}`

    return result
}

function parseSwitchCase(ctx: CompilerContext, node: Node.SwitchCase): string {
    const test = node.test ? parse[node.test.kind](ctx, node.test) : null
    const consequent = node.consequent.length > 0 ? parseStatements(ctx, node.consequent) : ""
    const result = test ? `case ${test}:${consequent}` : `default:${consequent}`

    return result
}

function parseWhileStatement(ctx: CompilerContext, node: Node.WhileStatement): string {
    const test = parse[node.test.kind](ctx, node.test)
    const body = parse[node.body.kind](ctx, node.body)
    const result = `while(${test}) ${body}${ctx.spaces}`

    return result
}

function parseForStatement(ctx: CompilerContext, node: Node.ForStatement): string {
    const init = node.init ? parse[node.init.kind](ctx, node.init) : ""
    const test = node.test ? parse[node.test.kind](ctx, node.test) : ""
    const update = node.update ? parse[node.update.kind](ctx, node.update) : ""
    const body = parse[node.body.kind](ctx, node.body)
    const result = `for(${init};${test};${update}) ${body}`

    return result
}

function parseForInStatement(ctx: CompilerContext, node: Node.ForInStatement): string {
    const left = parse[node.left.kind](ctx, node.left)
    const right = parse[node.right.kind](ctx, node.right)
    const body = parse[node.body.kind](ctx, node.body)
    const result = `for(${left} in ${right}) ${body}`

    return result
}

function parseForOfStatement(ctx: CompilerContext, node: Node.ForOfStatement): string {
    const left = parse[node.left.kind](ctx, node.left)
    const right = parse[node.right.kind](ctx, node.right)
    const body = parse[node.body.kind](ctx, node.body)
    const result = `for(${left} of ${right}) ${body}`

    return result
}

function parseReturnStatement(ctx: CompilerContext, node: Node.ReturnStatement): string {
    const argument = node.argument ? parse[node.argument.kind](ctx, node.argument) : ""
    const result = `return ${argument}`

    return result
}

function parseBreakStatement(_ctx: CompilerContext, node: Node.BreakStatement): string {
    if (node.label) {
        return `break ${node.label.value}`
    }

    return "break"
}

function parseContinueStatement(_ctx: CompilerContext, node: Node.ContinueStatement): string {
    if (node.label) {
        return `continue ${node.label.value}`
    }

    return "continue"
}

function parseExpressionStatement(ctx: CompilerContext, node: Node.ExpressionStatement): string {
    const result = parse[node.expression.kind](ctx, node.expression)

    return result
}

function parseCatchClause(ctx: CompilerContext, node: Node.CatchClause): string {
    const param = parse[node.param.kind](ctx, node.param)
    const block = parse[node.body.kind](ctx, node.body)
    const result = `catch(${param}) ${block}`

    return result
}

function parseTryStatement(ctx: CompilerContext, node: Node.TryStatement): string {
    const block = parse[node.block.kind](ctx, node.block)
    const handler = node.handler ? ` ${parseCatchClause(ctx, node.handler)}` : ""
    const finalizer = node.finalizer ? ` finally ${parseBlockStatement(ctx, node.finalizer)}` : ""
    const result = `try ${block}${handler}${finalizer}`

    return result
}

function parseThrowStatement(ctx: CompilerContext, node: Node.ThrowStatement): string {
    const argument = parse[node.argument.kind](ctx, node.argument)
    const result = `throw ${argument}`

    return result
}

function parseEmptyStatement(_ctx: CompilerContext, _node: Node.EmptyStatement): string {
    return ""
}

function parsePropertyAccessExpression(ctx: CompilerContext, node: Node.PropertyAccessExpression): string {
    const expression = parse[node.expression.kind](ctx, node.expression)
    const name = parse[node.name.kind](ctx, node.name)

    return `${expression}.${name}`
}

function parseSequenceExpression(ctx: CompilerContext, node: Node.SequenceExpression): string {
    let result = ""

    for (const expression of node.expressions) {
        const parsedExpression = parse[expression.kind](ctx, expression)

        if (result) {
            result = parsedExpression
            continue
        }

        result += `, ${parsedExpression}`
    }

    return result
}

function parseConditionalExpression(ctx: CompilerContext, node: Node.ConditionalExpression): string {
    const test = parse[node.test.kind](ctx, node.test)
    const consequent = parse[node.consequent.kind](ctx, node.consequent)
    const alternate = parse[node.alternate.kind](ctx, node.alternate)
    const result = `${test} ? ${consequent} : ${alternate}`

    return result
}

function parseBinaryExpression(ctx: CompilerContext, node: Node.BinaryExpression | Node.LogicalExpression, depth = 0): string {
    const left = parse[node.left.kind](ctx, node.left, depth + 1)
    const right = parse[node.right.kind](ctx, node.right, depth + 1)

    if (depth > 0) {
        return `(${left} ${node.operator} ${right})`
    }

    return `${left} ${node.operator} ${right}`
}

function parseAssignmentExpression(ctx: CompilerContext, node: Node.AssignmentExpression): string {
    const left = parse[node.left.kind](ctx, node.left)
    const right = parse[node.right.kind](ctx, node.right)
    const result = `${left} ${node.operator} ${right}`

    return result
}

function parseUpdateExpression(ctx: CompilerContext, node: Node.UpdateExpression): string {
    const argument = parse[node.argument.kind](ctx, node.argument)
    const result = node.prefix ? `${node.operator}${argument}` : `${argument}${node.operator}`

    return result
}

function parseMemberExpression(ctx: CompilerContext, node: Node.MemberExpression): string {
    const object = parse[node.object.kind](ctx, node.object)
    const property = parse[node.property.kind](ctx, node.property)

    if (node.computed) {
        const result = `${object}[${property}]`
        return result
    }

    const result = `${object}.${property}`
    return result
}

function parseAsExpression(ctx: CompilerContext, node: Node.AsExpression): string {
    const expression = parse[node.expression.kind](ctx, node.expression)

    return expression
}

function parseCallExpression(ctx: CompilerContext, node: Node.CallExpression): string {
    const callee = parse[node.callee.kind](ctx, node.callee)
    const args = parseArgs(ctx, node.args)
    const result = `${callee}(${args})`

    return result
}

function parseConditionExpression(ctx: CompilerContext, node: Node.ConditionalExpression): string {
    const test = parse[node.test.kind](ctx, node.test)
    const consequent = parse[node.consequent.kind](ctx, node.consequent)
    const alternate = parse[node.alternate.kind](ctx, node.alternate)
    const result = `${test} ? ${consequent} : ${alternate}`

    return result
}

function parseExpressionList(ctx: CompilerContext, elements: Node.Expression[]): string {
    let result = ""

    for (const element of elements) {
        if (result) {
            result = parse[element.kind](ctx, element)
            continue
        }

        result += `, ${parse[element.kind](ctx, element)}`
    }

    return result
}

function parseArrayExpression(ctx: CompilerContext, node: Node.ArrayExpression): string {
    const elements = parseExpressionList(ctx, node.elements)
    const result = `[${elements}]`

    return result
}

function parseObjectExpression(ctx: CompilerContext, node: Node.ObjectExpression): string {
    if (node.properties.length === 0) {
        return "{}"
    }

    let result = `{`

    enterBlock(ctx)

    for (const property of node.properties) {
        const nodeResult = parseProperty(ctx, property)
        result += `\n${ctx.spaces}${nodeResult}`
    }

    exitBlock(ctx)

    result += `\n${ctx.spaces}}`

    return result
}

function parseProperty(ctx: CompilerContext, node: Node.Property): string {
    const id = parse[node.id.kind](ctx, node.id)
    const key = node.computed ? `[${id}]` : id

    if (node.value) {
        const value = parse[node.value.kind](ctx, node.value)
        const result = `${key}: ${value},`
        return result
    }

    const result = `${key},`
    return result
}

function parseArgs(ctx: CompilerContext, args: Node.Expression[]) {
    let result = ""
    let first = true

    for (const arg of args) {
        if (first) {
            first = false
            result = parse[arg.kind](ctx, arg)
        } else {
            result += `, ${parse[arg.kind](ctx, arg)}`
        }
    }

    return result
}

function parseStatements(ctx: CompilerContext, statements: Node.Statement[]): string {
    enterBlock(ctx)

    let result = ""

    for (const statement of statements) {
        const statementResult = parse[statement.kind](ctx, statement)
        if (statementResult) {
            result += `\n${ctx.spaces}${statementResult}`
        }
    }

    exitBlock(ctx)

    return result
}

function parseIdentifier(_ctx: CompilerContext, node: Node.Identifier): string {
    return node.value
}

function parseNumericLiteral(_ctx: CompilerContext, node: Node.NumericLiteral): string {
    return node.value
}

function parseBooleanLiteral(_ctx: CompilerContext, node: Node.BooleanLiteral): string {
    return node.value
}

function parseLiteral(_ctx: CompilerContext, node: Node.Literal): string {
    return node.raw
}

function parseTemplateLiteral(ctx: CompilerContext, node: Node.TemplateLiteral): string {
    let result = ""

    for (let n = 0; n < node.quasis.length; n++) {
        const quasisNode = node.quasis[n]
        if (n >= 1) {
            const expressionNode = node.expressions[n - 1]
            const expression = parse[expressionNode.kind](ctx, expressionNode)
            result += `\${${expression}}${quasisNode.value}`
        } else {
            result = quasisNode.value
        }
    }

    return `\`${result}\``
}

function parseAssignParam(ctx: CompilerContext, node: Node.AssignPattern): string {
    const left = parse[node.left.kind](ctx, node.left)
    const right = parse[node.right.kind](ctx, node.right)
    const result = `${left} = ${right}`

    return result
}

function parseNoop(_ctx: CompilerContext, _node: Node.Any): string {
    return ""
}

function parseBlockStatement(ctx: CompilerContext, node: Node.BlockStatement): string {
    return parseBlock(ctx, node.body)
}

function parseBlock(ctx: CompilerContext, body: Node.Statement[] | Node.SwitchCase[]): string {
    let result = `{`

    enterBlock(ctx)

    for (const statement of body) {
        const statementResult = parse[statement.kind](ctx, statement)
        if (statementResult) {
            result += `\n${ctx.spaces}${statementResult}`
        }
    }

    exitBlock(ctx)

    result += `\n${ctx.spaces}}`

    return result
}

interface CompilerContext {
    module: Module
    modules: Record<string, Module>
    spaces: string
}

function compile(config: Config, module: Module, modules: Record<string, Module>, indexModule = false) {
    const ctx: CompilerContext = {
        module,
        modules,
        spaces: "",
    }

    let result = indexModule ? `"use strict"\n\nimport "${mantrLibFileName}"\n\n` : `"use strict"\n\n`

    for (const node of module.program.body) {
        const statementResult = parse[node.kind](ctx, node)
        if (statementResult) {
            result += `${ctx.spaces}${statementResult}\n`
        }
    }

    const fileName = path.parse(module.fileName).name
    const targetPath = path.resolve(config.outDir, `${fileName}.js`)
    fs.writeFileSync(targetPath, result)

    exitBlock(ctx)
}

export function compiler(config: Config, module: Module, modules: Record<string, Module>) {
    const outPath = path.resolve("./", config.outDir)
    if (fs.existsSync(outPath)) {
        fs.rmdirSync(outPath, { recursive: true })
    }
    fs.mkdirSync(outPath, { recursive: true })

    const mantraLibResult = "global.__modules__ = {}\n\n"
    const mantraLibFilePath = path.resolve(config.outDir, mantrLibFileName)
    fs.writeFileSync(mantraLibFilePath, mantraLibResult)

    const modulesToCompile = Object.values(modules).sort((a, b) => a.order - b.order)
    for (const moduleToCompile of modulesToCompile) {
        if (!moduleToCompile.program) {
            continue
        }
        compile(config, moduleToCompile, modules, false)
    }

    compile(config, module, modules, true)
}

function enterBlock(ctx: CompilerContext): void {
    ctx.spaces += "  "
}

function exitBlock(ctx: CompilerContext): void {
    ctx.spaces = ctx.spaces.substring(0, ctx.spaces.length - 2)
}

type NodeParserFunc = (ctx: CompilerContext, node: any, depth?: number) => string

const parse: Record<string, NodeParserFunc> = {
    TypeAliasDeclaration: parseNoop,
    InterfaceDeclaration: parseNoop,
    EnumDeclaration: parseEnumDeclaration,
    VariableDeclaration: parseVariableDeclaration,
    FunctionDeclaration: parseFunctionDeclaration,
    ExportNamedDeclaration: parseExportNamedDeclaration,
    ImportDeclaration: parseImportDeclaration,
    VariableDeclarator: parseVariableDeclarator,
    ArrowFunction: parseArrowFunction,
    LabeledStatement: parseLabeledStatement,
    IfStatement: parseIfStatement,
    SwitchStatement: parseSwitchStatement,
    SwitchCase: parseSwitchCase,
    WhileStatement: parseWhileStatement,
    ForStatement: parseForStatement,
    ForInStatement: parseForInStatement,
    ForOfStatement: parseForOfStatement,
    ReturnStatement: parseReturnStatement,
    BreakStatement: parseBreakStatement,
    ContinueStatement: parseContinueStatement,
    ExpressionStatement: parseExpressionStatement,
    TryStatement: parseTryStatement,
    ThrowStatement: parseThrowStatement,
    BlockStatement: parseBlockStatement,
    EmptyStatement: parseEmptyStatement,
    PropertyAccessExpression: parsePropertyAccessExpression,
    SequenceExpression: parseSequenceExpression,
    ConditionalExpression: parseConditionalExpression,
    BinaryExpression: parseBinaryExpression,
    LogicalExpression: parseBinaryExpression,
    AssignmentExpression: parseAssignmentExpression,
    UpdateExpression: parseUpdateExpression,
    UnaryExpression: parseUpdateExpression,
    MemberExpression: parseMemberExpression,
    AsExpression: parseAsExpression,
    CallExpression: parseCallExpression,
    NewExpression: parseCallExpression,
    ConditionExpression: parseConditionExpression,
    ArrayExpression: parseArrayExpression,
    ObjectExpression: parseObjectExpression,
    TemplateLiteral: parseTemplateLiteral,
    BooleanLiteral: parseBooleanLiteral,
    NumericLiteral: parseNumericLiteral,
    Literal: parseLiteral,
    Identifier: parseIdentifier,
    AssignPattern: parseAssignParam,
}
