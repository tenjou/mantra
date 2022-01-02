import * as fs from "fs"
import * as path from "path"
import { TypeKind } from "./types.js"
import { getFilePath } from "./file"

const mantrLibFileName = "./__mantra__.js"

function parseFunctionDeclaration(ctx, node) {
    const params = parseFunctionParams(ctx, node.params)
    const body = parse[node.body.kind](ctx, node.body)
    const result = `function ${node.id.value}(${params}) ${body}\n`

    return result
}

function parseFunctionParams(ctx, params) {
    let result = ""
    let first = true

    for (const param of params) {
        const paramResult = parse[param.kind](ctx, param)

        if (first) {
            first = false
            result = paramResult
            continue
        }

        result += `, ${paramResult}`
    }

    return result
}

function parseEnumDeclaration(ctx, node) {
    const name = parseIdentifier(ctx, node.name)

    enterBlock(ctx)

    let members = ""

    switch (node.type) {
        case TypeKind.string: {
            for (const member of node.members) {
                const memberName = parseIdentifier(ctx, member.name)
                members += `${ctx.spaces}${memberName}: "${member.initializer.value}",\n`
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

function parseVariableDeclaration(ctx, node) {
    const decls = parseDeclarations(ctx, node.declarations)
    const result = `${node.keyword} ${decls}`

    return result
}

function parseDeclarations(ctx, decls) {
    let result = ""
    for (const decl of decls) {
        const init = decl.init ? ` = ${parse[decl.init.kind](ctx, decl.init)}` : ""

        if (result) {
            result += `, ${decl.id.value}${init}`
        } else {
            result = `${decl.id.value}${init}`
        }
    }

    return result
}

function parseExportNamedDeclaration(ctx, node) {
    const declaration = parse[node.declaration.kind](ctx, node.declaration)
    const result = `export ${declaration}`

    return result
}

function parseImportClause(_ctx, importClause) {
    let result = ""

    switch (importClause.kind) {
        case "NamedImports": {
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
    }

    return result
}

function parseImportDeclaration(ctx, node) {
    const specifiers = parseImportClause(ctx, node.importClause)
    const filePath = getFilePath(ctx.module.fileDir, node.source.value)
    const module = ctx.modules[filePath]
    const importPath = module.program ? `${node.source.value}.js` : filePath
    const result = `import ${specifiers} from "${importPath}"\n`

    return result
}

function parseArrowFunction(ctx, node) {
    const body = parse[node.body.kind](ctx, node.body)
    const params = parseFunctionParams(ctx, node.params)
    const result = `(${params}) => ${body}`

    return result
}

function parseLabeledStatement(ctx, node) {
    const label = parse[node.label.kind](ctx, node.label)
    const body = parse[node.body.kind](ctx, node.body)
    const result = `${label}: ${body}`

    return result
}

function parseIfStatement(ctx, node) {
    const test = parse[node.test.kind](ctx, node.test)
    const consequent = parse[node.consequent.kind](ctx, node.consequent)
    const alternate = node.alternate ? parse[node.alternate.kind](ctx, node.alternate) : null

    let result = `if(${test}) ${consequent}`
    if (alternate) {
        result += ` else ${alternate}`
    }

    return result
}

function parseSwitchStatement(ctx, node) {
    const discriminant = parse[node.discriminant.kind](ctx, node.discriminant)
    const cases = parseBlock(ctx, node.cases)
    const result = `switch(${discriminant}) ${cases}`

    return result
}

function parseSwitchCase(ctx, node) {
    const test = node.test ? parse[node.test.kind](ctx, node.test) : null
    const consequent = node.consequent.length > 0 ? parseStatements(ctx, node.consequent) : ""
    const result = test ? `case ${test}:${consequent}` : `default:${consequent}`

    return result
}

function parseWhileStatement(ctx, node) {
    const test = parse[node.test.kind](ctx, node.test)
    const body = parseBlockStatement(ctx, node.body)
    const result = `while(${test}) ${body}${ctx.spaces}`

    return result
}

function parseForStatement(ctx, node) {
    const init = node.init ? parse[node.init.kind](ctx, node.init) : ""
    const test = node.test ? parse[node.test.kind](ctx, node.test) : ""
    const update = node.update ? parse[node.update.kind](ctx, node.update) : ""
    const body = parse[node.body.kind](ctx, node.body)
    const result = `for(${init};${test};${update}) ${body}`

    return result
}

function parseForInStatement(ctx, node) {
    const left = parse[node.left.kind](ctx, node.left)
    const right = parse[node.right.kind](ctx, node.right)
    const body = parse[node.body.kind](ctx, node.body)
    const result = `for(${left} in ${right}) ${body}`

    return result
}

function parseForOfStatement(ctx, node) {
    const left = parse[node.left.kind](ctx, node.left)
    const right = parse[node.right.kind](ctx, node.right)
    const body = parse[node.body.kind](ctx, node.body)
    const result = `for(${left} of ${right}) ${body}`

    return result
}

function parseReturnStatement(ctx, node) {
    const argument = node.argument ? parse[node.argument.kind](ctx, node.argument) : ""
    const result = `return ${argument}`

    return result
}

function parseBreakStatement(_ctx, node) {
    if (node.label) {
        return `break ${node.label.value}`
    }

    return "break"
}

function parseContinueStatement(_ctx, node) {
    if (node.label) {
        return `continue ${node.label.value}`
    }

    return "continue"
}

function parseExpressionStatement(ctx, node) {
    const result = parse[node.expression.kind](ctx, node.expression)

    return result
}

function parseCatchClause(ctx, node) {
    const param = parse[node.param.kind](ctx, node.param)
    const block = parse[node.body.kind](ctx, node.body)
    const result = `catch(${param}) ${block}`

    return result
}

function parseTryStatement(ctx, node) {
    const block = parse[node.block.kind](ctx, node.block)
    const handler = node.handler ? ` ${parseCatchClause(ctx, node.handler)}` : ""
    const finalizer = node.finalizer ? ` finally ${parseBlockStatement(ctx, node.finalizer)}` : ""
    const result = `try ${block}${handler}${finalizer}`

    return result
}

function parseThrowStatement(ctx, node) {
    const argument = parse[node.argument.kind](ctx, node.argument)
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
        const parsedExpression = parse[expression.kind](ctx, expression)

        if (first) {
            first = false
            result = parsedExpression
        } else {
            result += `, ${parsedExpression}`
        }
    }

    return result
}

function parseBinaryExpression(ctx, node, depth = 0) {
    const left = parse[node.left.kind](ctx, node.left, depth + 1)
    const right = parse[node.right.kind](ctx, node.right, depth + 1)

    if (depth > 0) {
        return `(${left} ${node.operator} ${right})`
    }

    return `${left} ${node.operator} ${right}`
}

function parseAssignmentExpression(ctx, node) {
    const left = parse[node.left.kind](ctx, node.left)
    const right = parse[node.right.kind](ctx, node.right)
    const result = `${left} ${node.operator} ${right}`

    return result
}

function parseUpdateExpression(ctx, node) {
    const argument = parse[node.argument.kind](ctx, node.argument)
    const result = node.prefix ? `${node.operator}${argument}` : `${argument}${node.operator}`

    return result
}

function parseMemberExpression(ctx, node) {
    const object = parse[node.object.kind](ctx, node.object)
    const property = parse[node.property.kind](ctx, node.property)

    if (node.computed) {
        const result = `${object}[${property}]`
        return result
    }

    const result = `${object}.${property}`
    return result
}

function parseCallExpression(ctx, node) {
    const callee = parse[node.callee.kind](ctx, node.callee)
    const args = parseArgs(ctx, node.arguments)
    const result = `${callee}(${args})`

    return result
}

function parseConditionExpression(ctx, node) {
    const test = parse[node.test.kind](ctx, node.test)
    const consequent = parse[node.consequent.kind](ctx, node.consequent)
    const alternate = parse[node.alternate.kind](ctx, node.alternate)
    const result = `${test} ? ${consequent} : ${alternate}`

    return result
}

function parseExpressionList(ctx, elements) {
    let result = ""
    let first = true

    for (const element of elements) {
        if (first) {
            first = false
            result = parse[element.kind](ctx, element)
        } else {
            result += `, ${parse[element.kind](ctx, element)}`
        }
    }

    return result
}

function parseArrayExpression(ctx, node) {
    const elements = parseExpressionList(ctx, node.elements)
    const result = `[${elements}]`

    return result
}

function parseObjectExpression(ctx, node) {
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

function parseProperty(ctx, node) {
    const key = node.computed ? `[${parse[node.key.kind](ctx, node.key)}]` : parse[node.key.kind](ctx, node.key)

    if (node.value) {
        const value = parse[node.value.kind](ctx, node.value)
        const result = `${key}: ${value},`
        return result
    }

    const result = `${key},`
    return result
}

function parseArgs(ctx, args) {
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

function parseStatements(ctx, statements) {
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

function parseIdentifier(_ctx, node) {
    return node.value
}

function parseNumericLiteral(_ctx, node) {
    return node.value
}

function parseLiteral(_ctx, node) {
    return node.raw
}

function parseTemplateLiteral(ctx, node) {
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

function parseAssignParam(ctx, node) {
    const left = parse[node.left.kind](ctx, node.left)
    const right = parse[node.right.kind](ctx, node.right)
    const result = `${left} = ${right}`

    return result
}

function parseNoop(_ctx, _node) {
    return ""
}

function parseBlockStatement(ctx, node) {
    return parseBlock(ctx, node.body)
}

function parseBlock(ctx, body) {
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

function compile(config, module, modules, indexModule = false) {
    const ctx = {
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

export function compiler(config, module, modules) {
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

function enterBlock(ctx) {
    ctx.spaces += "  "
}

function exitBlock(ctx) {
    ctx.spaces = ctx.spaces.substr(0, ctx.spaces.length - 2)
}

const parse = {
    TypeAliasDeclaration: parseNoop,
    EnumDeclaration: parseEnumDeclaration,
    VariableDeclaration: parseVariableDeclaration,
    FunctionDeclaration: parseFunctionDeclaration,
    ExportNamedDeclaration: parseExportNamedDeclaration,
    ImportDeclaration: parseImportDeclaration,
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
    ArrayExpression: parseArrayExpression,
    ObjectExpression: parseObjectExpression,
    TemplateLiteral: parseTemplateLiteral,
    NumericLiteral: parseNumericLiteral,
    Literal: parseLiteral,
    Identifier: parseIdentifier,
    AssignPattern: parseAssignParam,
}
