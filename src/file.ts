import * as path from "path"

export function getFilePath(fileDir: string, sourcePath: string): string {
    if (sourcePath.charCodeAt(0) === 46) {
        const fileExt = path.extname(sourcePath) || ".ts"
        const filePath = path.relative(fileDir, `${sourcePath}${fileExt}`)
        return filePath
    }

    return sourcePath
}
