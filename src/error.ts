import { isNewLine } from "./parser/utils"

interface Context {
    input: string
    fileDir: string
    fileName: string
}

interface LineInfo {
    line: number
    pos: number
}

export function raiseAt(ctx: Context, pos: number, error: string): never {
    const lineInfo = getLineInfo(ctx.input, pos)
    const fileName = `./${ctx.fileDir}${ctx.fileName}`
    throw new SyntaxError(`${error}. ${fileName}:${lineInfo.line}:${lineInfo.pos + 1}`)
}

export function unexpected(ctx: Context): never {
    raiseAt(ctx, 0, "Unexpected token")
}

export function getLineInfo(input: string, offset: number): LineInfo {
    let line = 1
    let pos = 0

    for (let n = 0; n < offset; n++) {
        const charCode = input.charCodeAt(n)
        if (isNewLine(charCode)) {
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