import * as Node from "./parser/node"
import { FileInput } from "./tokenizer/tokenizer-types"

export interface Module extends FileInput {
    program: Node.Program
    alias: number
    order: number
}

export function createModule(program: Node.Program, fileDir: string, fileName: string, input: string, alias: number): Module {
    return {
        program,
        fileDir,
        fileName,
        input,
        alias,
        order: 0,
    }
}
