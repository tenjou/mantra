import fs from "fs"
import { parser } from "./parser.js"

const fileName = "./dist/source.js"
const input = fs.readFileSync(fileName, "utf8")

try {
    parser(fileName, input)
} catch (err) {
    console.error(err)
}
