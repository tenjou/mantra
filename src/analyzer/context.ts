import { Config } from "../config"
import { Module } from "../module"
import * as Type from "../types"
import * as Node from "../parser/node"

export type TypeDeclaration =
    | {
          kind: Type.Kind.function
          type: Type.Function
          node: Node.FunctionDeclaration
      }
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

export interface Context {
    config: Config
    module: Module
    modules: Record<string, Module>
    modulesExports: Record<string, Type.Reference[]>
    exports: Type.Reference[]
    scope: Type.Scope
    scopeCurr: Type.Scope
    currFuncType: Type.Function | null
    resolvingTypes: Record<string, TypeDeclaration>
}
