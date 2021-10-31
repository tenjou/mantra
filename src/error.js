export function raise(ctx, error) {
    throw new SyntaxError(`${error}. ${ctx.fileName}:${1}:${ctx.start + 1}`)
}

export function unexpected(ctx) {
    raise(ctx, "Unexpected token")
}
