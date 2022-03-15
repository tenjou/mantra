import * as Type from "../types"

export function loadExterns(modulesExports: Record<string, Type.Reference[]>) {
    modulesExports["path"] = [
        Type.createFunctionRef("extname", [Type.coreAliases.string], Type.coreAliases.string),
        Type.createFunctionRef("relative", [Type.coreAliases.string, Type.coreAliases.string], Type.coreAliases.string),
    ]
}
