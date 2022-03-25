import * as Type from "./types"
import * as Node from "./parser/node"

export interface Scope {
    parent: Scope
    vars: Record<string, Type.Reference>
    types: Record<string, Type.Any>
    labels: string[]
    funcs: FunctionTypeDeclaration[]
}

export type FunctionTypeDeclaration = {
    kind: Type.Kind.function
    type: Type.Function
    node: Node.FunctionDeclaration
}

export type TypeDeclaration =
    | FunctionTypeDeclaration
    | {
          kind: Type.Kind.object
          type: Type.Object
          node: Node.InterfaceDeclaration
      }
    | {
          kind: Type.Kind.type
          type: Type.Type
          node: Node.TypeAliasDeclaration
      }

const fakeParent = {} as Scope

export function createScope(parent: Scope | null = null): Scope {
    if (!parent) {
        parent = fakeParent
    }

    return {
        parent,
        vars: {},
        types: {},
        labels: [],
        funcs: [],
    }
}
