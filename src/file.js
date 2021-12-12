import path from "path"

export function getFilePath(ctx, sourcePath) {
    if (sourcePath.charCodeAt(0) === 46) {
        const fileExt = path.extname(sourcePath) || ".ts"
        const filePath = path.resolve(path.dirname(ctx.module.filePath), sourcePath + fileExt)
        return filePath
    }

    return sourcePath
}
