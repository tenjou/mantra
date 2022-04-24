import { FileInput } from "./tokenizer-types"

interface LineInfo {
    line: number
    pos: number
}

export function raiseAt(ctx: FileInput, pos: number, error: string): never {
    const lineInfo = getLineInfo(ctx.input, pos)
    const fileName = `./test/${ctx.fileDir}${ctx.fileName}`
    throw new SyntaxError(`${error}. ${fileName}:${lineInfo.line}:${lineInfo.pos + 1}`)
}

export function unexpected(ctx: FileInput, pos: number, label: string = ""): never {
    if (label) {
        raiseAt(ctx, pos, `'${label}' expected`)
    } else {
        raiseAt(ctx, pos, "Unexpected token")
    }
}

export function getLineInfo(input: string, offset: number): LineInfo {
    let line = 1
    let pos = 0

    for (let n = 0; n < offset; n++) {
        const charCode = input.charCodeAt(n)
        if (charCode === 13) {
            line++
            n++
            pos = 0
        } else if (charCode === 10) {
            line++
            pos = 0
        } else {
            pos++
        }
    }

    return {
        line,
        pos,
    }
}
