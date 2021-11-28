import path from "path"

export function getFilePath(ctx, sourcePath) {
    const fileExt = path.extname(sourcePath) || ".ts"
    const filePath = path.resolve(path.dirname(ctx.module.filePath), sourcePath + fileExt)

    return filePath
}
