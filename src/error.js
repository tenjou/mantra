import { isNewLine } from "./utils.js"

export function raiseAt(ctx, pos, error) {
    const lineInfo = getLineInfo(ctx.input, pos)
    const fileName = `./${ctx.fileDir}${ctx.fileName}`
    throw new SyntaxError(`${error}. ${fileName}:${lineInfo.line}:${lineInfo.pos + 1}`)
}

export function raise(ctx, error) {
    raiseAt(ctx, ctx.start, error)
}

export function unexpected(ctx) {
    raise(ctx, "Unexpected token")
}

export function getLineInfo(input, offset) {
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
