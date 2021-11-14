import { raise } from "./error.js"

function createType(name) {
    return {
        name,
    }
}

export function getType(ctx, name) {
    const type = types[name]
    if (!type) {
        raise(ctx, `Cannot find type: ${name}`)
    }

    return type
}

export const types = {
    number: createType("number"),
    string: createType("string"),
    boolean: createType("boolean"),
    function: createType("function"),
}
