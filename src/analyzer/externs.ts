import * as Type from "../types"

export function loadExterns(modulesExports: Record<string, Type.Reference[]>) {
    modulesExports["path"] = [
        Type.createFunctionRef("extname", { path: Type.coreAliases.string }, Type.coreAliases.string),
        Type.createFunctionRef("relative", { from: Type.coreAliases.string, to: Type.coreAliases.string }, Type.coreAliases.string),
    ]
}
