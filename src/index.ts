import { analyze } from "./analyzer/analyzer"
import { compiler } from "./compiler"
import { Config } from "./config"
import { parser } from "./parser/parser"

function compile(fileName: string, config: Config) {
    try {
        const modules = {}
        const module = parser(config, fileName, modules)
        // console.dir(module.program, { depth: null })
        analyze(config, module, modules)
        compiler(config, module, modules)
    } catch (err) {
        if (err instanceof Error) {
            console.error(err.message, "\n\n", err.stack)
        }
    }
}

compile("./source.ts", {
    rootDir: "./test",
    outDir: "./dist",
})

console.log("Compiled")
