import { Config } from "../config"
import { raiseAt, unexpected } from "../error"
import { getFilePath } from "../file"
import { Flags } from "../flags"
import { Module } from "../module"
import * as Node from "../parser/node"
import { createScope, FunctionTypeDeclaration } from "../scope"
import * as Type from "../types"
import { getVar } from "./analyzer-utils"
import { Context } from "./context"
import { handleDeclaration, handleType, resolveDeclaration } from "./declarations"

function handleThrowStatement(ctx: Context, node: Node.ThrowStatement): void {
    if (ctx.currFuncType) {
        ctx.currFuncType.flags |= Flags.Throwing
    }

    expressions[node.argument.kind](ctx, node.argument, 0)
}

function handleForStatement(ctx: Context, node: Node.ForStatement): void {
    ctx.scopeCurr = createScope(ctx.scopeCurr)

    if (node.init) {
        statements[node.init.kind](ctx, node.init, 0)
    }
    if (node.test) {
        expressions[node.test.kind](ctx, node.test, 0)
    }
    if (node.update) {
        expressions[node.update.kind](ctx, node.update, 0)
    }

    statements[node.body.kind](ctx, node.body, 0)

    ctx.scopeCurr = ctx.scopeCurr.parent
}

function handlePropertyAccessExpression(ctx: Context, node: Node.PropertyAccessExpression): Type.Any {
    const expressionType = expressions[node.expression.kind](ctx, node.expression, 0)
    if (expressionType.kind !== Type.Kind.object && expressionType.kind !== Type.Kind.enum) {
        raiseAt(ctx.module, node.expression.start, `Expected object but instead got: ${Type.getName(expressionType)}`)
    }

    const member = expressionType.membersDict[node.name.value]
    if (!member) {
        raiseAt(ctx.module, node.start, `Cannot find name '${Type.getName(expressionType)}.${node.name.value}'`)
    }

    return member.type
}

function handleAsExpression(ctx: Context, node: Node.AsExpression): Type.Any {
    expressions[node.expression.kind](ctx, node.expression, 0)

    const type = handleType(ctx, node.type)
    return type
}

function handleUpdateExpression(ctx: Context, node: Node.UpdateExpression): Type.Any {
    const argType = expressions[node.argument.kind](ctx, node.argument, Flags.Mutating)
    if (argType.kind !== Type.Kind.number) {
        raiseAt(ctx.module, node.start, `An arithmetic operand must be of type 'number'.`)
    }

    return argType
}

function handleAssignmentExpression(ctx: Context, node: Node.AssignmentExpression): Type.Any {
    const leftType = expressions[node.left.kind](ctx, node.left, Flags.Mutating)
    const rightType = expressions[node.right.kind](ctx, node.right, 0)
    if (leftType.kind !== rightType.kind) {
        raiseTypeError(ctx, node.right.start, leftType, rightType)
    }

    return leftType
}

function handleNewExpression(ctx: Context, node: Node.NewExpression): Type.Any {
    const calleeType = expressions[node.callee.kind](ctx, node.callee, 0)
    if (calleeType.kind !== Type.Kind.class) {
        raiseAt(ctx.module, node.callee.start, `Type '${Type.getName(calleeType)}' has no construct signatures.`)
    }

    handleFunctionCall(ctx, node.start, calleeType.constructorFunc, node.args)

    return calleeType
}

function handleArrayExpression(ctx: Context, node: Node.ArrayExpression): Type.Array {
    let arrayType = null

    for (const element of node.elements) {
        const elementType = expressions[element.kind](ctx, element, 0)
        if (!arrayType) {
            arrayType = elementType
        } else if (!isValidType(ctx, arrayType, elementType, element.start)) {
            raiseTypeError(ctx, element.start, arrayType, elementType)
        }
    }

    return Type.createArray(arrayType || Type.coreAliases.unknown)
}

function handleObjectExpression(ctx: Context, node: Node.ObjectExpression, flags: number): Type.Object {
    const properties = node.properties
    const members: Type.Reference[] = new Array(properties.length)
    const membersDict: Record<string, Type.Reference> = {}

    for (let n = 0; n < properties.length; n++) {
        const property = properties[n]

        switch (property.name.kind) {
            case "Identifier":
            case "NumericLiteral": {
                if (membersDict[property.name.value]) {
                    raiseAt(ctx.module, property.start, `Duplicate identifier '${property.name.value}'`)
                }

                let type: Type.Any
                if (property.initializer) {
                    type = expressions[property.initializer.kind](ctx, property.initializer, 0)
                } else {
                    const ref = getVar(ctx, property.name.value)
                    if (!ref) {
                        raiseAt(
                            ctx.module,
                            property.start,
                            `No value exists in scope for the shorthand property '${property.name.value}'. Either declare one or provide an initializer.`
                        )
                    }
                    type = ref.type
                }

                const ref = Type.createRef(property.name.value, type, flags)
                members[n] = ref
                membersDict[property.name.value] = ref
                break
            }

            case "ComputedPropertyName": {
                if (!property.initializer) {
                    raiseAt(ctx.module, property.start, `Missing initializer`)
                }
                const type = expressions[property.name.expression.kind](ctx, property.name.expression, 0)
                const valueType = expressions[property.initializer.kind](ctx, property.initializer, 0)
                break
            }
        }
    }

    return {
        kind: Type.Kind.object,
        name: "",
        members,
        membersDict,
        param: null,
        flags: 0,
    }
}

function handleLiteral(_ctx: Context, node: Node.Literal): Type.Any {
    if (node.raw === "null") {
        return Type.coreAliases.null
    } else if (node.raw === "undefined") {
        return Type.coreAliases.undef
    }

    return Type.coreAliases.string
}

function handleNumericLiteral(_ctx: Context, _node: Node.NumericLiteral): Type.Any {
    return Type.coreAliases.number
}

function handleBooleanLiteral(_ctx: Context, _node: Node.BooleanLiteral): Type.Any {
    return Type.coreAliases.boolean
}

function handleTemplateLiteral(ctx: Context, node: Node.TemplateLiteral): Type.Any {
    for (const expression of node.expressions) {
        expressions[expression.kind](ctx, expression, 0)
    }

    return Type.coreAliases.string
}

function handleNullKeyword(_ctx: Context, _node: Node.NullKeyword): Type.Any {
    return Type.coreAliases.null
}

function handleIdentifier(ctx: Context, node: Node.Identifier, flags: number): Type.Any {
    const identifier = getVar(ctx, node.value)
    if (!identifier) {
        raiseAt(ctx.module, node.start, `Cannot find name '${node.value}'`)
    }
    if (flags & Flags.Mutating && identifier.flags & Flags.Const) {
        raiseAt(ctx.module, node.start, `Cannot assign to '${node.value}' because it is a constant`)
    }

    return identifier.type
}

function handleBinaryExpression(ctx: Context, node: Node.BinaryExpression): Type.Any {
    const leftType = expressions[node.left.kind](ctx, node.left, 0)
    const rightType = expressions[node.right.kind](ctx, node.right, 0)

    if (node.operator === "instanceof") {
        raiseAt(ctx.module, node.start, "TODO")
        // return redeclareVar(ctx, leftRef, rightRef.type)
    }

    if (
        (leftType.kind !== Type.Kind.number && leftType.kind !== Type.Kind.string) ||
        (rightType.kind !== Type.Kind.number && rightType.kind !== Type.Kind.string)
    ) {
        raiseAt(
            ctx.module,
            node.left.start,
            `Operator '${node.operator}' cannot be applied to types '${Type.getName(leftType)}' and '${Type.getName(rightType)}'`
        )
    }

    if (node.isComparison) {
        return Type.coreAliases.boolean
    }

    return leftType.kind > rightType.kind ? leftType : rightType
}

function handleLogicalExpression(ctx: Context, node: Node.LogicalExpression): Type.Any {
    expressions[node.left.kind](ctx, node.left, 0)
    expressions[node.right.kind](ctx, node.right, 0)

    return Type.coreAliases.boolean
}

function handleFunctionCall(ctx: Context, pos: number, funcType: Type.Function, args: Node.Expression[]): void {
    if (args.length < funcType.argsMin) {
        raiseAt(ctx.module, pos, `Expected ${funcType.argsMin} arguments, but got ${args.length}`)
    }
    if (args.length > funcType.argsMax) {
        raiseAt(ctx.module, pos, `Expected ${funcType.argsMax} arguments, but got ${args.length}`)
    }

    for (let n = 0; n < args.length; n++) {
        const arg = args[n]
        const argType = expressions[arg.kind](ctx, arg, 0)
        const paramType = funcType.params[n].constraint

        if (!isValidType(ctx, paramType, argType, arg.start)) {
            isValidType(ctx, paramType, argType, arg.start)
            raiseTypeError(ctx, arg.start, paramType, argType)
        }
    }
}

function handleCallExpression(ctx: Context, node: Node.CallExpression): Type.Any {
    const calleeType = expressions[node.callee.kind](ctx, node.callee, 0)
    if (calleeType.kind !== Type.Kind.function) {
        raiseAt(
            ctx.module,
            node.callee.start,
            `This expression is not callable.\n  Type '${Type.getName(calleeType)}' has no call signatures`
        )
    }

    handleFunctionCall(ctx, node.start, calleeType, node.args)

    return calleeType.returnType
}

function handleMemberExpression(ctx: Context, node: Node.MemberExpression): Type.Any {
    const type = expressions[node.object.kind](ctx, node.object, 0)
    const typeKind = type.kind

    if (typeKind !== Type.Kind.object && typeKind !== Type.Kind.enum && typeKind !== Type.Kind.string && typeKind !== Type.Kind.number) {
        if (type.kind === Type.Kind.unknown) {
            raiseAt(ctx.module, node.object.start, `'${Type.getName(type)}' is of type 'unknown'`)
        }
        raiseAt(ctx.module, node.object.start, `'${Type.getName(type)}' is not an object`)
    }

    const property = node.property

    if (!node.computed) {
        switch (property.kind) {
            case "Identifier": {
                const propRef = type.membersDict[property.value]
                if (!propRef) {
                    raiseAt(ctx.module, property.start, `Property '${property.value}' does not exist on type '${type.name}'`)
                }
                return propRef.type
            }
        }
    }

    raiseAt(ctx.module, node.start, "TODO")
}

function handleReturnStatement(ctx: Context, node: Node.ReturnStatement): void {
    if (!ctx.currFuncType) {
        raiseAt(ctx.module, node.start, "A 'return' statement can only be used within a function body.")
    }

    let returnType: Type.Any

    if (node.argument) {
        if (ctx.currFuncType.returnType && ctx.currFuncType.returnType !== Type.coreAliases.unknown) {
            expressions[node.argument.kind](ctx, node.argument, 0, ctx.currFuncType.returnType)
            return
        }

        returnType = expressions[node.argument.kind](ctx, node.argument, 0)
    } else {
        returnType = Type.coreAliases.void
    }

    if (!ctx.currFuncType.returnType.kind) {
        ctx.currFuncType.returnType = returnType
    } else if (ctx.currFuncType.returnType.kind !== returnType.kind) {
        raiseTypeError(ctx, node.start, ctx.currFuncType.returnType, returnType)
    }
}

function handleIfStatement(ctx: Context, node: Node.IfStatement): void {
    ctx.scopeCurr = createScope(ctx.scopeCurr)

    expressions[node.test.kind](ctx, node.test, 0)

    switch (node.consequent.kind) {
        case "BlockStatement":
            handleStatements(ctx, node.consequent.body)
            break

        case "ExpressionStatement":
            expressions[node.consequent.expression.kind](ctx, node.consequent.expression, 0)
            break

        default:
            unexpected(ctx.module, node.consequent.start)
    }

    ctx.scopeCurr = ctx.scopeCurr.parent

    if (node.alternate) {
        statements[node.alternate.kind](ctx, node.alternate, 0)
    }
}

function handleVariableDeclarator(ctx: Context, node: Node.VariableDeclarator, flags: number = 0): void {
    const varRef = declareVar(ctx, node, flags)

    if (node.init) {
        const initType = expressions[node.init.kind](ctx, node.init, flags)

        if (varRef.type.kind !== Type.Kind.unknown && !isValidType(ctx, varRef.type, initType, node.init.start)) {
            raiseTypeError(ctx, node.start, varRef.type, initType)
        }

        varRef.type = initType
    }

    if (flags & Flags.Exported) {
        ctx.module.exportedVars.push(varRef)
    }
}

function handleVariableDeclaration(ctx: Context, node: Node.VariableDeclaration, flags: number = 0): void {
    if (node.keyword === "const") {
        flags |= Flags.Const
    }

    for (const decl of node.declarations) {
        handleVariableDeclarator(ctx, decl, flags)
    }
}

function handleExportNamedDeclaration(ctx: Context, node: Node.ExportNamedDeclaration): void {
    statements[node.declaration.kind](ctx, node.declaration, Flags.Exported)
}

function handleParams(ctx: Context, params: Node.Parameter[]): void {
    for (let nParam = 0; nParam < params.length; nParam++) {
        const param = params[nParam]
        const paramRef = declareVar(ctx, param)

        if (param.initializer) {
            const paramType = expressions[param.initializer.kind](ctx, param.initializer, 0)

            if (!isValidType(ctx, paramRef.type, paramType, param.initializer.start)) {
                raiseTypeError(ctx, param.initializer.start, paramRef.type, paramType)
            }
        }
    }
}

function handleFunctionDeclaration(ctx: Context, node: Node.FunctionDeclaration, flags: number = 0): Type.Any {
    const name = node.id ? node.id.value : ""

    let ref: Type.Reference
    if (name) {
        const refVar = getVar(ctx, name)
        if (!refVar) {
            raiseAt(ctx.module, node.start, `Missing function reference: ${name}`)
        }
        ref = refVar
    } else {
        const type = Type.createFunction("", [], Type.coreAliases.unknown)
        ref = Type.createRef("", type)
    }

    if (ref.type.kind !== Type.Kind.function) {
        raiseAt(ctx.module, node.start, `Expected function type: ${name}, but instead got: ${ref.type.kind}`)
    }

    if (name && flags & Flags.Exported) {
        ctx.module.exportedVars.push(ref)
    }

    return ref.type
}

function resolveFunctionDeclaration(ctx: Context, { type, node }: FunctionTypeDeclaration): void {
    const scope = createScope(ctx.scopeCurr)
    ctx.scopeCurr = scope
    ctx.currFuncType = type

    handleParams(ctx, node.params)

    if (node.body.kind === "BlockStatement") {
        handleStatements(ctx, node.body.body)
    } else {
        raiseAt(ctx.module, node.body.start, "Unsupported feature")
    }

    if (type.flags & Flags.Throwing) {
        type.returnType = Type.coreAliases.never
    }

    ctx.scopeCurr = ctx.scopeCurr.parent
}

function handleBlockStatement(ctx: Context, node: Node.BlockStatement): void {
    ctx.scopeCurr = createScope(ctx.scopeCurr)

    handleStatements(ctx, node.body)

    ctx.scopeCurr = ctx.scopeCurr.parent
}

function handleStatements(ctx: Context, body: Node.Statement[]): void {
    const scopeCurr = ctx.scopeCurr

    ctx.resolvingTypes = {}

    for (const node of body) {
        handleDeclaration(ctx, node, false)
    }

    for (const key in ctx.resolvingTypes) {
        const typeDecl = ctx.resolvingTypes[key]
        resolveDeclaration(ctx, typeDecl)
    }

    for (const node of body) {
        statements[node.kind](ctx, node, 0)
    }

    for (const func of scopeCurr.funcs) {
        resolveFunctionDeclaration(ctx, func)
    }

    scopeCurr.funcs.length = 0

    ctx.scopeCurr = scopeCurr
}

function handleExpressionStatement(ctx: Context, node: Node.ExpressionStatement): void {
    expressions[node.expression.kind](ctx, node.expression, 0)
}

function handleNoop(_ctx: Context, _node: Node.Statement): void {}

function isValidType(ctx: Context, leftType: Type.Any, rightType: Type.Any, pos: number, shallowCheck: boolean = false): boolean {
    switch (leftType.kind) {
        case Type.Kind.unknown:
            return true

        case Type.Kind.type: {
            if (leftType === rightType) {
                return true
            }
            return isValidType(ctx, leftType.type, rightType, pos)
        }

        case Type.Kind.object: {
            if (leftType === rightType) {
                return true
            }
            if (rightType.kind === Type.Kind.object) {
                if (shallowCheck) {
                    return false
                }

                return compareMembers(ctx, leftType, rightType)
            }
            if (leftType.members.length === 0) {
                return rightType.kind === Type.Kind.enum
            }

            return false
        }

        case Type.Kind.function: {
            if (rightType.kind !== Type.Kind.function) {
                return false
            }

            const leftParams = leftType.params
            const rightParams = rightType.params

            if (rightParams.length < leftParams.length) {
                return true
            }

            for (let nArg = 0; nArg < leftParams.length; nArg++) {
                const leftParam = leftParams[nArg].constraint
                const rightParam = rightParams[nArg].constraint
                if (leftParam.kind !== rightParam.kind) {
                    raiseTypeError(ctx, pos, leftType, rightType)
                }
                return true
            }

            return true
        }

        case Type.Kind.array: {
            if (rightType.kind !== Type.Kind.array) {
                return false
            }
            if (rightType.elementType === Type.coreAliases.unknown) {
                return true
            }

            return isValidType(ctx, leftType.elementType, rightType.elementType, pos)
        }

        case Type.Kind.enum: {
            if (rightType.kind === Type.Kind.enumMember) {
                return rightType.enum === leftType
            }
            return false
        }

        case Type.Kind.enumMember: {
            if (rightType.kind !== Type.Kind.enumMember) {
                return false
            }
            const isValid = leftType.enum === rightType.enum
            return isValid
        }

        case Type.Kind.union: {
            if (rightType.kind == Type.Kind.union) {
                loop: for (const leftParam of leftType.types) {
                    let foundSubstitue = false
                    for (const rightParam of rightType.types) {
                        if (isValidType(ctx, leftParam, rightParam, pos)) {
                            foundSubstitue = true
                            continue loop
                        }
                    }
                    if (!foundSubstitue) {
                        return false
                    }
                }
            }

            for (const leftParam of leftType.types) {
                if (isValidType(ctx, leftParam, rightType, pos, true)) {
                    return true
                }
            }
            for (const leftParam of leftType.types) {
                if (isValidType(ctx, leftParam, rightType, pos)) {
                    return true
                }
            }

            return false
        }

        case Type.Kind.mapped: {
            if (rightType.kind !== Type.Kind.object) {
                return false
            }

            if (leftType.type.kind !== Type.Kind.unknown && rightType.members.length > 0) {
                let typeIsValid = true
                for (const member of rightType.members) {
                    if (leftType.typeParameter !== member.type && !isValidType(ctx, leftType.type, member.type, pos)) {
                        typeIsValid = false
                        break
                    }
                }
                if (!typeIsValid) {
                    return false
                }
            }

            return true
        }
    }

    return leftType === rightType
}

function compareMembers(ctx: Context, leftType: Type.Object, rightType: Type.Object) {
    const membersLeft = leftType.members
    const membersRight = rightType.members

    loop: for (let n = 0; n < membersLeft.length; n++) {
        const memberLeft = membersLeft[n]
        for (let m = 0; m < membersRight.length; m++) {
            const memberRight = membersRight[m]
            if (memberLeft.name !== memberRight.name) {
                continue
            }

            if (memberLeft.type === memberRight.type) {
                continue loop
            }

            if (memberLeft.type.kind === Type.Kind.object) {
                if (memberRight.type.kind === Type.Kind.object) {
                    if (compareMembers(ctx, memberLeft.type, memberRight.type)) {
                        continue loop
                    }
                } else {
                    return false
                }
            } else {
                return false
            }
        }

        return (memberLeft.flags & Flags.Optional) !== 0
    }

    return membersLeft.length === membersRight.length
}

function raiseTypeError(ctx: Context, start: number, leftType: Type.Any, rightType: Type.Any, name: string = "") {
    if (name) {
        raiseAt(
            ctx.module,
            start,
            `Variable '${name}' with type '${Type.getName(rightType)}' is not assignable to type '${Type.getName(leftType)}'`
        )
    }
    raiseAt(ctx.module, start, `Type '${Type.getName(rightType)}' is not assignable to type '${Type.getName(leftType)}'`)
}

function declareVar(ctx: Context, node: Node.VariableDeclarator | Node.Parameter, flags = 0): Type.Reference {
    const name = node.id.value
    const prevVar = getVar(ctx, name)
    if (prevVar) {
        raiseAt(ctx.module, node.start, `Duplicate identifier '${name}'`)
    }

    const type = handleType(ctx, node.type, null, node.id.value)
    const ref = Type.createRef(name, type, flags)

    ctx.scopeCurr.vars[name] = ref

    return ref
}

export function analyzeModule(ctx: Context, module: Module) {
    module.scope = createScope(ctx.scope)

    const prevModule = ctx.module
    ctx.module = module
    ctx.scopeCurr = module.scope

    handleStatements(ctx, module.program.body)

    ctx.module = prevModule
    ctx.scopeCurr = prevModule.scope || ctx.scope
}

export function analyze(config: Config, module: Module, modules: Record<string, Module>) {
    const scope = createScope()
    scope.parent = scope

    const ctx: Context = {
        config,
        module,
        modules,
        scope,
        scopeCurr: scope,
        currFuncType: null,
        resolvingTypes: {},
    }

    scope.vars["path"] = Type.createObjectRef("Object", [
        Type.createFunctionRef("extname", { path: Type.coreAliases.string }, Type.coreAliases.string),
        Type.createFunctionRef("relative", { from: Type.coreAliases.string, to: Type.coreAliases.string }, Type.coreAliases.string),
    ])
    scope.vars["Object"] = Type.createObjectRef("Object", [
        Type.createFunctionRef("keys", { o: Type.coreAliases.object }, Type.createArray(Type.coreAliases.string)),
    ])
    scope.vars["Error"] = Type.createClassRef(
        "Error",
        Type.createConstructor([Type.createParameter("message", Type.coreAliases.string, Flags.Optional)], 0)
    )
    scope.vars["SyntaxError"] = Type.createClassRef(
        "SyntaxError",
        Type.createConstructor([Type.createParameter("message", Type.coreAliases.string, Flags.Optional)], 0)
    )

    scope.types["Record"] = Type.createType(
        "Record",
        [
            Type.createParameter("K", Type.createUnion([Type.coreAliases.string, Type.coreAliases.number])),
            Type.createParameter("T", Type.coreAliases.unknown),
        ],
        Type.createMappedType(Type.createUnion([Type.coreAliases.string, Type.coreAliases.number]), Type.coreAliases.unknown)
    )

    return analyzeModule(ctx, module)
}

type StatementFunc = (ctx: Context, node: any, flags: number) => void

const statements: Record<string, StatementFunc> = {
    ThrowStatement: handleThrowStatement,
    ForStatement: handleForStatement,
    ReturnStatement: handleReturnStatement,
    IfStatement: handleIfStatement,
    InterfaceDeclaration: handleNoop,
    TypeAliasDeclaration: handleNoop,
    EnumDeclaration: handleNoop,
    VariableDeclaration: handleVariableDeclaration,
    ImportDeclaration: handleNoop,
    ExportNamedDeclaration: handleExportNamedDeclaration,
    FunctionDeclaration: handleFunctionDeclaration,
    BlockStatement: handleBlockStatement,
    ExpressionStatement: handleExpressionStatement,
}

type ExpressionFunc = (ctx: Context, node: any, flags: number, type?: Type.Any) => Type.Any

const expressions: Record<string, ExpressionFunc> = {
    Literal: handleLiteral,
    NumericLiteral: handleNumericLiteral,
    BooleanLiteral: handleBooleanLiteral,
    TemplateLiteral: handleTemplateLiteral,
    NullKeyword: handleNullKeyword,
    Identifier: handleIdentifier,
    BinaryExpression: handleBinaryExpression,
    LogicalExpression: handleLogicalExpression,
    CallExpression: handleCallExpression,
    MemberExpression: handleMemberExpression,
    ObjectExpression: handleObjectExpression,
    ArrayExpression: handleArrayExpression,
    PropertyAccessExpression: handlePropertyAccessExpression,
    AsExpression: handleAsExpression,
    UpdateExpression: handleUpdateExpression,
    AssignmentExpression: handleAssignmentExpression,
    NewExpression: handleNewExpression,
}

type HandleFunc = (ctx: Context, node: any) => void

const handle: Record<string, HandleFunc> = {
    // VariableDeclarator: handleVariableDeclarator,
    // LabeledStatement: handleLabeledStatement,
    // ConditionalExpression: handleConditionalExpression,
    // IfStatement: handleIfStatement,
    // BreakStatement: handleBreakContinueStatement,
    // ContinueStatement: handleBreakContinueStatement,
    // SwitchStatement: handleSwitchStatement,
    // WhileStatement: handleWhileStatement,
    // ForInStatement: handleForInStatement,
    // ForOfStatement: handleForOfStatement,
    // TryStatement: handleTryStatement,
    // BlockStatement: handleBlockStatement,
    // EmptyStatement: handleEmptyStatement,
    // ArrowFunction: handleArrowFunction,
    // UnaryExpression: handleUnaryExpression,
    // LogicalExpression: handleLogicalExpression,
    //
    // CallExpression: handleCallExpression,
    // SequenceExpression: handleSequenceExpression,
    // AssignPattern: handleAssignPattern,
}

// function handleLabeledStatement(ctx: Context, node: Node.LabeledStatement): void {
//     ctx.scopeCurr.labels.push(node.label.value)

//     handle[node.body.kind](ctx, node.body)

//     ctx.scopeCurr.labels.pop()
// }

// function handleConditionalExpression(ctx: Context, node: Node.ConditionalExpression): void {
//     handle[node.test.kind](ctx, node.test)
//     handle[node.consequent.kind](ctx, node.consequent)
//     handle[node.alternate.kind](ctx, node.alternate)
// }

// function handleBreakContinueStatement(ctx, node) {
//     if (!node.label) {
//         return
//     }

//     if (!haveLabel(ctx, node.label.value)) {
//         const statementName = node.kind === "BreakStatement" ? "break" : "continue"
//         raiseAt(ctx, node.label.start, `A '${statementName}' statement can only jump to a label of an enclosing statement`)
//     }
// }

// function handleSwitchStatement(ctx, node) {
//     handle[node.discriminant.kind](ctx, node.discriminant)

//     for (const entry of node.cases) {
//         if (entry.test) {
//             handle[entry.test.kind](ctx, entry.test)
//         }
//         handleStatements(ctx, entry.consequent)
//     }
// }

// function handleWhileStatement(ctx, node) {
//     handle[node.test.kind](ctx, node.test)
//     handleBlockStatement(ctx, node.body)
// }

// function handleForInStatement(ctx, node) {
//     handle[node.left.kind](ctx, node.left)
//     handle[node.right.kind](ctx, node.right)
//     handle[node.body.kind](ctx, node.body)
// }

// function handleForOfStatement(ctx, node) {
//     handle[node.left.kind](ctx, node.left)
//     handle[node.right.kind](ctx, node.right)
//     handle[node.body.kind](ctx, node.body)
// }

// function handleTryStatement(ctx: Context, node: Node.TryStatement): void {
//     handle[node.block.kind](ctx, node.block)

//     if (node.handler) {
//         const param = node.handler.param
//         declareVar(ctx, param.value, param, 0)
//         handle[node.handler.body.kind](ctx, node.handler.body)
//     }
//     if (node.finalizer) {
//         handle[node.finalizer.kind](ctx, node.finalizer)
//     }
// }

// function handleEmptyStatement(_ctx: Context, _node: Node.EmptyStatement): void {}

// function handleArrowFunction(ctx, node) {
//     const returnType = node.returnType ? handleType(ctx, node.returnType) : ctx.typeAliases.void
//     const prevFuncType = ctx.currFuncType
//     const scope = createScope(ctx.scopeCurr)
//     const params = handleParams(ctx, scope, node.params)
//     const funcType = createFunction("", params, returnType)

//     ctx.currFuncType = funcType
//     ctx.scopeCurr = scope

//     handleStatements(ctx, node.body.body)

//     ctx.scopeCurr = scope.parent
//     ctx.currFuncType = prevFuncType

//     const ref = { name: "", flags: 0, type: funcType }
//     return ref
// }

// function handleUnaryExpression(ctx, node) {
//     handle[node.argument.kind](ctx, node.argument)
// }

// function handleObjectType(ctx, name, node, type) {
//     if (type.kind !== TypeKind.object) {
//         return null
//     }

//     for (const member of type.members) {
//         const memberVar = ctx.scopeCurr.vars[member.name]
//         if (!memberVar) {
//             return null
//             // raiseAt(ctx, node.start, `Property '${member.name}' is missing in type '{}' but required in type '${type.name}'`)
//         }
//         if (memberVar.ref.type !== member.type) {
//             raiseTypeError(ctx, memberVar.node.start, member.type, memberVar.ref.type)
//         }
//     }

//     if (node.properties.length > type.members.length) {
//         loop: for (const property of node.properties) {
//             for (const member of type.members) {
//                 if (member.name === property.key.value) {
//                     continue loop
//                 }
//             }

//             raiseAt(ctx, property.start, `'${property.key.value}' does not exist in type '${name}'`)
//         }
//     }

//     return type
// }

// function handleSequenceExpression(ctx: Context, node: Node.SequenceExpression): void {
//     for (const expression of node.expressions) {
//         handle[expression.kind](ctx, expression)
//     }
// }

// function handleAssignPattern(_ctx: Context, _node: Node.AssignPattern): void {}

// function haveLabel(ctx: Context, label: Node.LabeledStatement): boolean {
//     let scope = ctx.scopeCurr

//     while (scope) {
//         for (const scopeLabel of scope.labels) {
//             if (scopeLabel === label) {
//                 return true
//             }
//         }

//         scope = scope.parent
//     }

//     return false
// }

// function importVar(ctx: Context, name: string, ref) {
// const preimport { getVar } from './analyzer-utils';
// if (prevVar) {
//     raise(ctx, node, `Duplicate identifier '${name}'`)
// }

// ctx.scopeCurr.vars[name] = ref
// }

// function redeclareVar(ctx, varRef, newType) {
//     const newVarRef = { type: newType, flags: varRef.flags }
//     ctx.scopeCurr.vars[varRef.name] = newVarRef

//     return newVarRef
// }
