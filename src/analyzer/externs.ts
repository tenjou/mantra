import * as Type from "../types"

export function loadExterns(modulesExports: Record<string, Record<string, Type.Reference>>) {
    modulesExports["path"] = {
        extname: Type.createFunctionRef("extname", [Type.coreAliases.string], Type.coreAliases.string),
        relative: Type.createFunctionRef("relative", [Type.coreAliases.string, Type.coreAliases.string], Type.coreAliases.string),
    }
}
