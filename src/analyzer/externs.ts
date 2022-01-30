import * as Type from "../types"

export function loadExterns(modulesExports: Record<string, Record<string, Type.Reference>>) {
    modulesExports["path"] = {
        extname: createFunction("extname", [Type.coreAliases.string], Type.coreAliases.string),
        relative: createFunction("relative", [Type.coreAliases.string, Type.coreAliases.string], Type.coreAliases.string),
    }
}

function createFunction(name: string, params: Type.Any[], returnType: Type.Any) {
    return Type.createRef(name, Type.createFunction(name, params, returnType))
}
