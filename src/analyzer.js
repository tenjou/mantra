import fs from "fs"
import path from "path"
import { getLineInfo, raiseAt } from "./error.js"
import {
    coreTypeAliases,
    coreTypeRefs,
    createArg,
    createFunction,
    createObject,
    createUnion,
    Flags,
    isValidType,
    loadCoreTypes,
    TypeKind,
    TypeKindNamed,
    useType,
} from "./types.js"

function handleVariableDeclarator(ctx, node, flags) {
    const newVar = declareVar(ctx, node.id.value, node, flags)

    if (node.init) {
        const initRef = handle[node.init.kind](ctx, node.init, newVar.ref.type)
        if (!newVar.ref.type) {
            newVar.ref.type = initRef.type
        } else if (!isValidType(newVar.ref.type, initRef.type)) {
            raiseTypeError(ctx, node.init.start, newVar.ref.type, initRef.type)
        }
    }
}

function handleVariableDeclaration(ctx, node) {
    const flags = node.keyword === "const" ? Flags.Const : 0

    for (const decl of node.declarations) {
        handleVariableDeclarator(ctx, decl, flags)
    }
}

function handleFunctionDeclaration(ctx, node) {
    if (getVar(ctx, node.id.value)) {
        raise(ctx, node.id, `Duplicate function implementation '${node.id.value}'`)
    }

    const returnType = handleType(ctx, node.returnType)
    const type = createFunction([], returnType)
    const ref = { type, flags: 0 }
    const func = createVar(ref, node)
    func.scope = createScope(ctx.scopeCurr)
    ctx.scopeCurr.vars[node.id.value] = func
    ctx.scopeCurr = func.scope

    for (const param of node.params) {
        switch (param.kind) {
            case "Identifier": {
                const argVar = declareVar(ctx, param.value, param, 0)
                type.args.push(argVar.ref.type)
                type.argsMin++
                break
            }

            case "AssignPattern": {
                const argVar = declareVar(ctx, param.left.value, param.left, 0)
                const rightType = handle[param.right.kind](ctx, param.right)
                if (argVar.type.kind !== rightType.kind) {
                    raiseTypeError(ctx, param.right.start, argVar.type, rightType)
                }
                type.args.push(argVar.type)
                break
            }

            case "ObjectExpression":
                for (const property of param.properties) {
                    declareVar(ctx, property.key.value)
                }
                break

            default:
                raise(ctx, param, "Unsupported feature")
        }
    }

    ctx.scopeCurr = ctx.scopeCurr.parent
    ctx.scopeCurr.funcDecls.push(func)
}

function handleImportDeclaration(ctx, node) {
    if (node.source.value.charCodeAt(0) === 46) {
        const fileDir = path.dirname(ctx.fileName)
        const fileExt = path.extname(node.source.value)
        const sourceFileName = fileExt ? node.source.value : `${node.source.value}.js`
        const filePath = path.resolve(fileDir, sourceFileName)
        if (!fs.existsSync(filePath)) {
            raise(ctx, node, `Cannot find module '${sourceFileName}' or its corresponding type declarations`)
        }
    }

    for (const entry of node.specifiers) {
        declareVar(ctx, entry.imported)
    }
}

function handleExportNamedDeclaration(ctx, node) {
    handle[node.declaration.kind](ctx, node.declaration)
}

function handleType(ctx, type = null, name = "") {
    if (!type) {
        return { kind: TypeKind.unknown, name }
    }

    switch (type.kind) {
        case "UnionType": {
            const types = new Array(type.types.length)
            for (let n = 0; n < type.types.length; n++) {
                const entry = type.types[n]
                types[n] = handleType(ctx, entry)
            }

            return createUnion(name, types)
        }

        case "TypeLiteral": {
            const members = new Array(type.members.length)
            for (let n = 0; n < type.members.length; n++) {
                const entry = type.members[n]
                members[n] = { name: entry.name, type: handleType(ctx, entry.type, entry.name) }
            }

            return createObject(name, members)
        }

        case "NumberKeyword":
            return coreTypeAliases.number

        case "StringKeyword":
            return coreTypeAliases.string

        case "BooleanKeyword":
            return coreTypeAliases.boolean

        default: {
            const coreType = coreTypeAliases[type.value]
            if (!coreType) {
                raise(ctx, type.start, `Cannot find name '${type.value}'`)
            }

            return coreType
        }
    }
}

function handleTypeAliasDeclaration(ctx, node) {
    if (ctx.typeAliases[node.id]) {
        raise(ctx, node, `Type alias name cannot be '${node.id}'`)
    }

    ctx.typeAliases[node.id] = handleType(ctx, node.type, node.id)
}

function handleLabeledStatement(ctx, node) {
    ctx.scopeCurr.labels.push(node.label.value)

    handle[node.body.kind](ctx, node.body)

    ctx.scopeCurr.labels.pop()
}

function handleExpressionStatement(ctx, node) {
    handle[node.expression.kind](ctx, node.expression)
}

function handleConditionExpression(ctx, node) {
    handle[node.test.kind](ctx, node.test)
    handle[node.consequent.kind](ctx, node.consequent)
    handle[node.alternate.kind](ctx, node.alternate)
}

function handleIfStatement(ctx, node) {
    handle[node.test.kind](ctx, node.test)

    if (node.consequent) {
        handle[node.consequent.kind](ctx, node.consequent)
    }
    if (node.alternate) {
        handle[node.alternate.kind](ctx, node.alternate)
    }
}

function handleBreakContinueStatement(ctx, node) {
    if (!node.label) {
        return
    }

    if (!haveLabel(ctx, node.label.value)) {
        const statementName = node.kind === "BreakStatement" ? "break" : "continue"
        raiseAt(ctx, node.label.start, `A '${statementName}' statement can only jump to a label of an enclosing statement`)
    }
}

function handleSwitchStatement(ctx, node) {
    handle[node.discriminant.kind](ctx, node.discriminant)

    for (const entry of node.cases) {
        if (entry.test) {
            handle[entry.test.kind](ctx, entry.test)
        }
        handleStatements(ctx, entry.consequent)
    }
}

function handleWhileStatement(ctx, node) {
    handle[node.test.kind](ctx, node.test)
    handleBlockStatement(ctx, node.body)
}

function handleForStatement(ctx, node) {
    if (node.init) {
        handle[node.init.kind](ctx, node.init)
    }
    if (node.test) {
        handle[node.test.kind](ctx, node.test)
    }
    if (node.update) {
        handle[node.update.kind](ctx, node.update)
    }

    handle[node.body.kind](ctx, node.body)
}

function handleForInStatement(ctx, node) {
    handle[node.left.kind](ctx, node.left)
    handle[node.right.kind](ctx, node.right)
    handle[node.body.kind](ctx, node.body)
}

function handleForOfStatement(ctx, node) {
    handle[node.left.kind](ctx, node.left)
    handle[node.right.kind](ctx, node.right)
    handle[node.body.kind](ctx, node.body)
}

function handleReturnStatement(ctx, node) {
    let returnRef

    if (node.argument) {
        returnRef = handle[node.argument.kind](ctx, node.argument)
    } else {
        returnRef = coreTypeRefs.void
    }

    if (!ctx.currFuncType.returnType.kind) {
        ctx.currFuncType.returnType = returnRef.type
    } else if (ctx.currFuncType.returnType.kind !== returnRef.type.kind) {
        raiseTypeError(ctx, node.start, ctx.currFuncType.returnType, returnRef.type)
    }
}

function handleThrowStatement(ctx, node) {
    handle[node.argument.kind](ctx, node.argument)
}

function handleTryStatement(ctx, node) {
    handle[node.block.kind](ctx, node.block)

    if (node.handler) {
        declareVar(ctx, node.handler.param)
        handle[node.handler.body.kind](ctx, node.handler.body)
    }
    if (node.finalize) {
        handle[node.finalize.kind](ctx, node.finalize)
    }
}

function handleBlockStatement(ctx, node) {
    ctx.scopeCurr = createScope(ctx.scopeCurr)

    handleStatements(ctx, node.body)

    ctx.scopeCurr = ctx.scopeCurr.parent
}

function handleAssignmentExpression(ctx, node) {
    const leftType = handle[node.left.kind](ctx, node.left)
    if (leftType.flags & Flags.Const) {
        raiseAt(ctx, node.left.start, `Cannot assign to '${node.left.value}' because it is a constant`)
    }

    const rightType = handle[node.right.kind](ctx, node.right)

    if (leftType.kind !== rightType.kind) {
        raiseTypeError(ctx, node.right.start, leftType, rightType)
    }
}

function handleUpdateExpression(ctx, node) {
    // TODO: Check if argument is a number.
    handle[node.argument.kind](ctx, node.argument)
}

function handleUnaryExpression(ctx, node) {
    handle[node.argument.kind](ctx, node.argument)
}

function handleLogicalExpression(ctx, node) {
    handle[node.left.kind](ctx, node.left)
    handle[node.right.kind](ctx, node.right)

    return coreTypeRefs.boolean
}

function handleBinaryExpression(ctx, node) {
    const leftRef = handle[node.left.kind](ctx, node.left)
    const rightRef = handle[node.right.kind](ctx, node.right)

    if (
        (leftRef.type.kind !== TypeKind.number && leftRef.type.kind !== TypeKind.string) ||
        (rightRef.type.kind !== TypeKind.number && rightRef.type.kind !== TypeKind.string)
    ) {
        raiseAt(
            ctx,
            node.left.start,
            `Operator '${node.operator}' cannot be applied to types '${leftRef.type.name}' and '${rightRef.type.name}'`
        )
    }

    if (node.isComparison) {
        return coreTypeRefs.boolean
    }

    return leftRef.type.kind > rightRef.type.kind ? leftRef : rightRef
}

function handleMemberExpression(ctx, node) {
    const type = handle[node.object.kind](ctx, node.object)
    if (type.kind !== TypeKind.object) {
        raiseAt(ctx, node.object.start, `'${node.object.value}' is not an object`)
    }

    if (!node.computed) {
        const prop = type.props[node.property.value]
        if (!prop) {
            raiseAt(ctx, node.property.start, `Property '${node.property.value}' does not exist on type '${type.name}'`)
        }
        return prop
    }

    switch (node.property.kind) {
        case "Literal": {
            const prop = type.props[node.property.value]
            if (!prop) {
                raiseAt(ctx, node.property.start, `Property '${node.property.value}' does not exist on type '${type.name}'`)
            }
            return prop
        }
    }

    raiseAt(ctx, node.property.start, "Unsupported object property access")
}

function handleCallExpression(ctx, node) {
    const typeRef = handle[node.callee.kind](ctx, node.callee)
    if (typeRef.type.kind !== TypeKind.function) {
        raiseAt(ctx, node.callee.start, `This expression is not callable.\n  Type '${typeRef.type.name}' has no call signatures`)
    }

    if (node.arguments.length < typeRef.type.argsMin) {
        raiseAt(ctx, node.callee.start, `Expected ${type.argsMin} arguments, but got ${node.arguments.length}`)
    }
    if (node.arguments.length > type.argsMax) {
        raiseAt(ctx, node.callee.start, `Expected ${type.argsMax} arguments, but got ${node.arguments.length}`)
    }

    for (let n = 0; n < node.arguments.length; n++) {
        const arg = node.arguments[n]
        const argType = handle[arg.kind](ctx, arg)
        const funcArgType = type.args[n]
        if (funcArgType.kind !== argType.kind) {
            raiseTypeError(ctx, arg.start, funcArgType, argType)
        }
    }
}

function handleArrayExpression(ctx, node) {
    for (const element of node.elements) {
        handle[element.kind](ctx, element)
    }
}

function handleObjectType(ctx, name, node, type) {
    if (type.kind !== TypeKind.object) {
        return null
    }

    for (const member of type.members) {
        const memberVar = ctx.scopeCurr.vars[member.name]
        if (!memberVar) {
            return null
            // raiseAt(ctx, node.start, `Property '${member.name}' is missing in type '{}' but required in type '${type.name}'`)
        }
        if (memberVar.ref.type !== member.type) {
            raiseTypeError(ctx, memberVar.node.start, member.type, memberVar.ref.type)
        }
    }

    if (node.properties.length > type.members.length) {
        loop: for (const property of node.properties) {
            for (const member of type.members) {
                if (member.name === property.key.value) {
                    continue loop
                }
            }

            raiseAt(ctx, property.start, `'${property.key.value}' does not exist in type '${name}'`)
        }
    }

    return type
}

function handleObjectExpression(ctx, node, type = null) {
    ctx.scopeCurr = createScope(ctx.scopeCurr)

    for (const property of node.properties) {
        if (property.op !== "init") {
            raise(ctx, property, "Unsupported feature")
        }

        const newVar = declareVar(ctx, property.key.value, property, 0, true)

        if (property.value) {
            const valueRef = handle[property.value.kind](ctx, property.value)
            newVar.ref.type = valueRef.type
        }
    }

    if (type) {
        let mostLikelyType = null

        if (type.kind === TypeKind.union) {
            for (const typeEntry of type.types) {
                const objectType = handleObjectType(ctx, type.name, node, typeEntry)
                if (objectType) {
                    mostLikelyType = objectType
                }
            }
        } else {
            mostLikelyType = handleObjectType(ctx, type.name, node, type)
        }

        if (!mostLikelyType) {
            raiseAt(ctx, node.start, `Type '{}' is not assignable to type '${type.name}'`)
        }

        type = mostLikelyType
    }

    ctx.scopeCurr = ctx.scopeCurr.parent

    return { type: type || createObject(null, {}), flags: 0 }
}

function handleIdentifier(ctx, node) {
    const identifier = getVar(ctx, node.value)
    if (!identifier) {
        raise(ctx, node, `Cannot find name '${node.value}'`)
    }

    return identifier.ref
}

function handleTemplateLiteral(ctx, node) {
    for (const expression of node.expressions) {
        handle[expression.kind](ctx, expression)
    }
}

function handleLiteral(_ctx, node) {
    if (node.value === "true" || node.value === "false") {
        return coreTypeRefs.boolean
    }

    return coreTypeRefs.string
}

function handleNumericLiteral(_ctx, _node) {
    return { type: coreTypeAliases.number, flags: 0 }
}

function handleStatements(ctx, body) {
    const scopeCurr = ctx.scopeCurr

    for (const node of body) {
        handle[node.kind](ctx, node)
    }

    const funcDecls = ctx.scopeCurr.funcDecls
    for (const decl of funcDecls) {
        const prevFuncType = ctx.currFuncType
        ctx.scopeCurr = decl.scope
        ctx.currFuncType = decl.ref.type

        handle[decl.node.body.kind](ctx, decl.node.body)

        ctx.currFuncType = prevFuncType
    }

    ctx.scopeCurr = scopeCurr
}

function haveLabel(ctx, label) {
    let scope = ctx.scopeCurr

    while (scope) {
        for (const scopeLabel of scope.labels) {
            if (scopeLabel === label) {
                return true
            }
        }

        scope = scope.parent
    }

    return false
}

function getVar(ctx, value, isObject) {
    if (isObject) {
        const item = ctx.scopeCurr.vars[value]
        if (item) {
            return item
        }
    } else {
        let scope = ctx.scopeCurr

        while (scope) {
            let item = scope.vars[value]
            if (item) {
                return item
            }
            scope = scope.parent
        }
    }

    return null
}

function declareVar(ctx, name, node, flags, isObject = false) {
    const prevVar = getVar(ctx, name, isObject)
    if (prevVar) {
        raise(ctx, node, `Duplicate identifier '${name}'`)
    }

    const type = handleType(ctx, node.type, name)
    const ref = { type, flags }
    const newVar = createVar(ref, node)
    ctx.scopeCurr.vars[name] = newVar

    return newVar
}

function createScope(parent, node = null) {
    return {
        parent,
        node,
        vars: {},
        funcDecls: [],
        labels: [],
    }
}

function createVar(ref, node = null) {
    return {
        scope: null,
        ref,
        node,
    }
}

function raise(ctx, node, error) {
    const lineInfo = getLineInfo(ctx, node.start)
    throw new SyntaxError(`${error}. ${ctx.fileName}:${lineInfo.line}:${lineInfo.pos + 1}`)
}

function raiseTypeError(ctx, start, leftType, rightType) {
    raiseAt(ctx, start, `Type '${rightType.name}' is not assignable to type '${leftType.name}'`)
}

export function analyze({ program, input, fileName }) {
    const scope = createScope(null)
    const ctx = {
        input,
        fileName,
        scope,
        scopeCurr: scope,
        currFuncType: null,
        typeAliases: {},
    }

    loadCoreTypes(ctx)

    scope.vars["Infinity"] = createVar()
    scope.vars["NaN"] = createVar()
    scope.vars["console"] = createVar(
        createObject("Console", {
            log: createFunction([createArg("data", TypeKind.string)]),
        })
    )

    handleStatements(ctx, program.body)
}

const handle = {
    TypeAliasDeclaration: handleTypeAliasDeclaration,
    VariableDeclaration: handleVariableDeclaration,
    FunctionDeclaration: handleFunctionDeclaration,
    ImportDeclaration: handleImportDeclaration,
    ExportNamedDeclaration: handleExportNamedDeclaration,
    LabeledStatement: handleLabeledStatement,
    ExpressionStatement: handleExpressionStatement,
    ConditionExpression: handleConditionExpression,
    IfStatement: handleIfStatement,
    BreakStatement: handleBreakContinueStatement,
    ContinueStatement: handleBreakContinueStatement,
    SwitchStatement: handleSwitchStatement,
    WhileStatement: handleWhileStatement,
    ForStatement: handleForStatement,
    ForInStatement: handleForInStatement,
    ForOfStatement: handleForOfStatement,
    ReturnStatement: handleReturnStatement,
    ThrowStatement: handleThrowStatement,
    TryStatement: handleTryStatement,
    BlockStatement: handleBlockStatement,
    AssignmentExpression: handleAssignmentExpression,
    UpdateExpression: handleUpdateExpression,
    UnaryExpression: handleUnaryExpression,
    LogicalExpression: handleLogicalExpression,
    BinaryExpression: handleBinaryExpression,
    MemberExpression: handleMemberExpression,
    CallExpression: handleCallExpression,
    ArrayExpression: handleArrayExpression,
    ObjectExpression: handleObjectExpression,
    Identifier: handleIdentifier,
    TemplateLiteral: handleTemplateLiteral,
    Literal: handleLiteral,
    NumericLiteral: handleNumericLiteral,
}
