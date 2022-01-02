import { parser, Config } from "./parser/parser"
// import { analyze } from "./analyzer"
// import { compiler } from "./compiler"

function compile(fileName: string, config: Config) {
    try {
        const modules = {}
        const module = parser(config, fileName, modules)
        console.dir(module.program, { depth: null })
        // analyze(config, module, modules)
        // compiler(config, module, modules)
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
