import fs from "fs"
import path from "path"
import { parser } from "./parser.js"
import { analyze } from "./analyzer.js"
import { compiler } from "./compiler.js"

const fileName = "./dist/source.ts"
const input = fs.readFileSync(fileName, "utf8")

try {
    const modules = {}
    const filePath = path.resolve("./", fileName)
    const program = parser(filePath, input, modules)
    analyze({ program, modules, filePath })
    const result = compiler(program, modules)
    console.log("")
    console.log(result)
} catch (err) {
    console.error(err.message, "\n\n", err.stack)
}
