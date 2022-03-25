import { Config } from "../config"
import { Module } from "../module"
import { Scope, TypeDeclaration } from "../scope"
import * as Type from "../types"

export interface Context {
    config: Config
    module: Module
    modules: Record<string, Module>
    modulesExports: Record<string, Type.Reference[]>
    exports: Type.Reference[]
    scope: Scope
    scopeCurr: Scope
    currFuncType: Type.Function | null
    resolvingTypes: Record<string, TypeDeclaration>
}
