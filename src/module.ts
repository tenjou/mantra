import * as Node from "./parser/node"
import * as Type from "./types"
import { FileInput } from "./tokenizer/tokenizer-types"
import { Scope } from "./scope"

export interface Module extends FileInput {
    program: Node.Program
    alias: number
    order: number
    scope: Scope | null
    exportedVars: Type.Reference[]
    exportedTypes: (Type.Type | Type.Object)[]
}

export function createModule(program: Node.Program, fileDir: string, fileName: string, input: string, alias: number): Module {
    return {
        program,
        fileDir,
        fileName,
        input,
        alias,
        order: 0,
        scope: null,
        exportedVars: [],
        exportedTypes: [],
    }
}
