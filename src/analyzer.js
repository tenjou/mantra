import path from "path"
import { getLineInfo, raiseAt } from "./error.js"
import { getFilePath } from "./file.js"
import {
    coreTypeAliases,
    coreTypeRefs,
    createArg,
    createArray,
    createEnum,
    createFunction,
    createModule,
    createObject,
    createRef,
    createUnion,
    createVar,
    Flags,
    isValidType,
    loadCoreTypes,
    TypeKind,
} from "./types.js"

function handleVariableDeclarator(ctx, node, flags) {
    const varRef = declareVar(ctx, node.id.value, node, flags)

    if (node.init) {
        const initRef = handle[node.init.kind](ctx, node.init, varRef.type)
        if (!varRef.type.kind) {
            varRef.type = initRef.type
        } else if (!isValidType(varRef.type, initRef.type)) {
            raiseTypeError(ctx, node.init.start, varRef.type, initRef.type)
        }
    }

    if (flags & Flags.Exported) {
        ctx.exports[varRef.name] = varRef
    }
}

function handleVariableDeclaration(ctx, node, flags) {
    if (node.keyword === "const") {
        flags |= Flags.Const
    }

    for (const decl of node.declarations) {
        handleVariableDeclarator(ctx, decl, flags)
    }
}

function handleFunctionDeclaration(ctx, node, flags) {
    if (getVar(ctx, node.id.value)) {
        raise(ctx, node.id, `Duplicate function implementation '${node.id.value}'`)
    }

    const returnType = handleType(ctx, node.returnType)
    const ref = createFunction(node.id.value, [], returnType)
    const scope = createScope(ctx.scopeCurr)

    ctx.scopeCurr.vars[node.id.value] = ref
    ctx.scopeCurr = scope

    for (const param of node.params) {
        switch (param.kind) {
            case "Identifier": {
                const argRef = declareVar(ctx, param.value, param, 0)
                ref.type.args.push(argRef)
                ref.type.argsMin++
                ref.type.argsMax++
                break
            }

            case "AssignPattern": {
                const argVar = declareVar(ctx, param.left.value, param.left, 0)
                const rightType = handle[param.right.kind](ctx, param.right)
                if (argVar.type.kind !== rightType.kind) {
                    raiseTypeError(ctx, param.right.start, argVar.type, rightType)
                }
                type.args.push(argVar)
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
    ctx.scopeCurr.funcDecls.push({
        ref,
        scope,
        node,
    })

    if (flags & Flags.Exported) {
        ctx.exports[ref.name] = ref
    }

    return ref
}

function handleImportClause(ctx, node, moduleExports) {
    if (node.kind === "NamedImports") {
        for (const entry of node.specifiers) {
            const entryId = entry.imported.value
            const exportedRef = moduleExports[entryId]
            if (!exportedRef) {
                raiseAt(ctx, entry.start, `Module '"${node.source.value}"' has no exported member '${entry.imported.value}'`)
            }

            const importedRef = moduleExports[entry.imported.value]
            importVar(ctx, entry.imported.value, importedRef)
        }
    }
}

function handleImportDeclaration(ctx, node) {
    const filePath = getFilePath(ctx.module.fileDir, node.source.value)

    let moduleExports = ctx.modulesExports[filePath]
    if (!moduleExports) {
        const module = ctx.modules[filePath]
        module.order = ctx.module.order + 1
        moduleExports = analyze(ctx.config, module, ctx.modules)
        ctx.modulesExports[filePath] = moduleExports
    }

    if (node.name) {
        if (!moduleExports.defauls) {
            raiseAt(ctx, node.name, `Module '"${filePath}"' has no default export.`)
        }
    }

    if (node.importClause) {
        handleImportClause(ctx, node.importClause, moduleExports)
    }
}

function handleExportNamedDeclaration(ctx, node) {
    handle[node.declaration.kind](ctx, node.declaration, Flags.Exported)
}

function handleType(ctx, type = null, name = "") {
    if (!type) {
        return name ? createRef(coreTypeAliases.unknown, name) : coreTypeRefs.unknown
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

        case "ArrayType":
            return createArray(handleType(ctx, type.elementType))

        case "FunctionType": {
            for (const param of type.params) {
                if (!param.type) {
                    raiseAt(ctx.module, type.start, `Parameter '${param.value}' implicitly has an 'any' type.`)
                }
            }
            return
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
            return name ? createRef(coreTypeAliases.number, name) : coreTypeRefs.number

        case "StringKeyword":
            return name ? createRef(coreTypeAliases.string, name) : coreTypeRefs.string

        case "BooleanKeyword":
            return name ? createRef(coreTypeAliases.boolean, name) : coreTypeRefs.boolean

        case "VoidKeyword":
            return name ? createRef(coreTypeAliases.void, name) : coreTypeRefs.void

        default: {
            const coreType = ctx.typeAliases[type.name]
            if (!coreType) {
                raiseAt(ctx.module, type.start, `Cannot find name '${type.name}'`)
            }

            return coreType
        }
    }
}

function getEnumType(ctx, members) {
    let enumType = TypeKind.unknown

    for (const member of members) {
        if (!member.initializer) {
            continue
        }

        switch (member.initializer.kind) {
            case "NumericLiteral":
                return TypeKind.number

            case "Literal":
                return TypeKind.string

            default:
                raiseAt(ctx.module, member.initializer.start, `Enums can only have numeric or string values`)
        }
    }

    return enumType || TypeKind.number
}

function handleEnumDeclaration(ctx, node) {
    const contentType = getEnumType(ctx, node.members)

    ctx.scopeCurr = createScope(ctx.scopeCurr, node)

    const members = {}
    const values = {}

    switch (contentType) {
        case TypeKind.string:
            for (const member of node.members) {
                if (!member.initializer) {
                    raiseAt(ctx.module, member.start, `Enum member must have initializer`)
                }
                if (member.initializer.kind !== "Literal") {
                    raiseAt(ctx.module, member.initializer.start, `String literal enums can only have literal values`)
                }

                if (members[member.name.value]) {
                    raiseAt(ctx.module, member.start, `Duplicate identifier '${member.name.value}'`)
                }

                members[member.name.value] = createRef(coreTypeAliases.string, member.name.value)
                values[member.initializer.value] = true
            }
            break

        default: {
            let index = 0
            for (const member of node.members) {
                if (member.initializer) {
                    if (member.initializer.kind !== "NumericLiteral") {
                        raiseAt(ctx.module, member.initializer.start, `Numeric enums can only have numeric values`)
                    }
                }

                if (members[member.name.value]) {
                    raiseAt(ctx.module, member.start, `Duplicate identifier '${member.name.value}'`)
                }

                if (member.initializer) {
                    index = member.initializer.value
                }

                members[member.name.value] = createRef(coreTypeAliases.number, member.name.value)
                values[index++] = true
            }
            break
        }
    }

    const enumVar = createEnum(node.name.value, contentType, members, values)
    ctx.scope.vars[node.name.value] = enumVar
    ctx.typeAliases[enumVar.type.name] = enumVar.type
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
    ctx.scopeCurr = createScope(ctx.scopeCurr)

    handle[node.test.kind](ctx, node.test)

    switch (node.consequent.kind) {
        case "BlockStatement":
            handleStatements(ctx, node.consequent.body)
            break

        case "ExpressionStatement":
            handle[node.consequent.expression.kind](ctx, node.consequent.expression)
            break

        default:
            raiseAt(ctx, node.consequent.start, "Unsupported feature")
    }

    ctx.scopeCurr = ctx.scopeCurr.parent

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

    if (!ctx.currFuncType.returnType.type.kind) {
        ctx.currFuncType.returnType = returnRef
    } else if (ctx.currFuncType.returnType.type.kind !== returnRef.type.kind) {
        raiseTypeError(ctx, node.start, ctx.currFuncType.returnType, returnRef.type)
    }
}

function handleThrowStatement(ctx, node) {
    handle[node.argument.kind](ctx, node.argument)
}

function handleTryStatement(ctx, node) {
    handle[node.block.kind](ctx, node.block)

    if (node.handler) {
        const param = node.handler.param
        declareVar(ctx, param.value, param, 0)
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

function handleArrowFunction(ctx, node) {
    handle[node.body.kind](ctx, node.body)

    return coreTypeRefs.unknown
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

    if (node.operator === "instanceof") {
        return redeclareVar(ctx, leftRef, rightRef.type)
    }

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
    const typeRef = handle[node.object.kind](ctx, node.object)
    if (typeRef.type.kind !== TypeKind.object && typeRef.type.kind !== TypeKind.enum) {
        if (typeRef.type.kind === TypeKind.unknown) {
            raiseAt(ctx.module, node.object.start, `'${node.object.value}' is of type 'unknown'`)
        }
        raiseAt(ctx.module, node.object.start, `'${node.object.value}' is not an object`)
    }

    if (!node.computed) {
        const propRef = typeRef.type.members[node.property.value]
        if (!propRef) {
            raiseAt(ctx.module, node.property.start, `Property '${node.property.value}' does not exist on type '${propRef.type.name}'`)
        }
        return propRef
    }

    switch (node.property.kind) {
        case "Literal": {
            const prop = type.props[node.property.value]
            if (!prop) {
                raiseAt(ctx.module, node.property.start, `Property '${node.property.value}' does not exist on type '${type.name}'`)
            }
            return prop
        }
    }

    raiseAt(ctx.module, node.property.start, "Unsupported object property access")
}

function handleCallExpression(ctx, node) {
    const typeRef = handle[node.callee.kind](ctx, node.callee)
    if (typeRef.type.kind !== TypeKind.function) {
        raiseAt(ctx, node.callee.start, `This expression is not callable.\n  Type '${typeRef.type.name}' has no call signatures`)
    }

    if (node.arguments.length < typeRef.type.argsMin) {
        raiseAt(ctx, node.callee.start, `Expected ${typeRef.type.argsMin} arguments, but got ${node.arguments.length}`)
    }
    if (node.arguments.length > typeRef.type.argsMax) {
        raiseAt(ctx, node.callee.start, `Expected ${typeRef.type.argsMax} arguments, but got ${node.arguments.length}`)
    }

    for (let n = 0; n < node.arguments.length; n++) {
        const arg = node.arguments[n]
        const argRef = handle[arg.kind](ctx, arg)
        const funcArgRef = typeRef.type.args[n]

        if (funcArgRef.type.kind === TypeKind.enum) {
            if (funcArgRef.type.kind === TypeKind.args) {
                break
            }
            if (funcArgRef.type.enumType !== argRef.type.kind) {
                raiseTypeError(ctx, arg.start, funcArgRef.type, argRef.type)
            }

            const value = getArgValue(arg)
            if (!funcArgRef.type.values[value]) {
                raiseAt(ctx.module, arg.start, `Argument '${value}' is not assignable to parameter of type '${typeRef.name}'`)
            }
        } else if (funcArgRef.type.kind !== argRef.kind) {
            if (funcArgRef.type.kind === TypeKind.args) {
                break
            }
            raiseTypeError(ctx, arg.start, funcArgRef.type, argRef.type)
        }
    }

    return typeRef.type.returnType
}

function handleArrayExpression(ctx, node) {
    let arrayType = null

    for (const element of node.elements) {
        const elementRef = handle[element.kind](ctx, element)
        if (!arrayType) {
            arrayType = elementRef.type
        } else if (!isValidType(arrayType, elementRef.type)) {
            raiseTypeError(ctx, element.start, arrayType, elementRef.type)
        }
    }

    return createArray(arrayType || coreTypeAliases.unknown)
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

        const varRef = declareVar(ctx, property.key.value, property, 0, true)

        if (property.value) {
            const valueRef = handle[property.value.kind](ctx, property.value)
            varRef.type = valueRef.type
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

    if (type) {
        return { type, flags: 0 }
    }

    return createObject(null, {})
}

function handleIdentifier(ctx, node) {
    const identifier = getVar(ctx, node.value)
    if (!identifier) {
        raiseAt(ctx.module, node.start, `Cannot find name '${node.value}'`)
    }

    return identifier
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

function importVar(ctx, name, ref) {
    const prevVar = getVar(ctx, name, false)
    if (prevVar) {
        raise(ctx, node, `Duplicate identifier '${name}'`)
    }

    ctx.scopeCurr.vars[name] = ref
}

function declareVar(ctx, name, node, flags = 0, isObject = false) {
    const prevVar = getVar(ctx, name, isObject)
    if (prevVar) {
        raise(ctx, node, `Duplicate identifier '${name}'`)
    }

    const varType = handleType(ctx, node.type, name)
    const varRef = { name, type: varType, flags }

    ctx.scopeCurr.vars[name] = varRef

    return varRef
}

function redeclareVar(ctx, varRef, newType) {
    const newVarRef = { type: newType, flags: varRef.flags }
    ctx.scopeCurr.vars[varRef.name] = newVarRef

    return newVarRef
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

function raise(ctx, node, error) {
    const lineInfo = getLineInfo(ctx, node.start)
    const fileName = path.relative("./", ctx.filePath)
    throw new SyntaxError(`${error}. ${fileName}:${lineInfo.line}:${lineInfo.pos + 1}`)
}

function getTypeName(type) {
    if (type.kind === TypeKind.array) {
        return `${getTypeName(type.elementType)}[]`
    }

    return type.name
}

function getArgValue(node) {
    switch (node.kind) {
        case "Literal":
        case "NumericLiteral":
            return node.value
    }

    raiseAt(ctx.module, node.start, `Unsupported argument value`)
}

function raiseTypeError(ctx, start, leftType, rightType) {
    raiseAt(ctx.module, start, `Type '${getTypeName(rightType)}' is not assignable to type '${getTypeName(leftType)}'`)
}

function declareModule(ctx, alias, refs) {
    ctx.modules[alias] = createModule(null, "", "", "", alias)
    ctx.modulesExports[alias] = refs
}

export function analyze(config, module, modules) {
    const scope = createScope(null)
    const ctx = {
        config,
        module,
        modules,
        modulesExports: {},
        exports: {},
        scope,
        scopeCurr: scope,
        currFuncType: null,
        typeAliases: {},
    }

    loadCoreTypes(ctx)

    scope.vars["Infinity"] = coreTypeRefs.number
    scope.vars["NaN"] = coreTypeRefs.number
    scope.vars["console"] = createObject("Console", {
        log: createFunction("console", [createArg("msg", coreTypeAliases.args)]),
    })
    scope.vars["Error"] = createObject("Error", {
        message: createVar(coreTypeAliases.string),
    })
    scope.vars["Object"] = createObject("Object", {
        keys: createFunction("keys", [createArg("o", coreTypeAliases.object)], createArray(coreTypeAliases.string)),
    })

    declareModule(ctx, "fs", {
        readFileSync: createFunction("readFileSync", [createArg("path", TypeKind.string), createArg("encoding", TypeKind.string)]),
    })

    handleStatements(ctx, module.program.body)

    return ctx.exports
}

const handle = {
    EnumDeclaration: handleEnumDeclaration,
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
    ArrowFunction: handleArrowFunction,
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
