import { isNewLine } from "./utils.js"

export function raise(ctx, error) {
    const lineInfo = getLineInfo(ctx, ctx.start)
    throw new SyntaxError(`${error}. ${ctx.fileName}:${lineInfo.line}:${lineInfo.pos}`)
}

export function unexpected(ctx) {
    raise(ctx, "Unexpected token")
}

export function getLineInfo(ctx, offset) {
    let line = 1
    let pos = 0

    for (let n = 0; n < offset; n++) {
        const charCode = ctx.input.charCodeAt(n)
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
