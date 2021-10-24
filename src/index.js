import fs from "fs"
import { parser } from "./parser.js"
import { compiler } from "./compiler.js"

const fileName = "./dist/source.js"
const input = fs.readFileSync(fileName, "utf8")

try {
    const program = parser(fileName, input)
    const result = compiler(program)
    console.log(result)
} catch (err) {
    console.error(err.message)
}
