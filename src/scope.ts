import * as Node from "./parser/node"
import * as Type from "./types"

interface FunctionDecl {
    funcType: Type.Function
    scope: Scope
    node: Node.FunctionDeclaration
}

export interface Scope {
    parent: Scope
    node: Node.Any | null
    vars: Record<string, Type.Reference>
    types: Record<string, Type.Any>
    funcDecls: FunctionDecl[]
    labels: []
}

export function createScope(parent: Scope, node: Node.Any | null = null): Scope {
    return {
        parent,
        node,
        vars: {},
        types: {},
        funcDecls: [],
        labels: [],
    }
}
