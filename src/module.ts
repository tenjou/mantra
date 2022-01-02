import * as Node from "./parser/node"

export interface Module {
    program: Node.Program
    fileDir: string
    fileName: string
    input: string
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
