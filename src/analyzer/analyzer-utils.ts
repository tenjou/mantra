import * as Type from "../types"
import { Context } from "./context"

export function getVar(ctx: Context, name: string): Type.Reference | null {
    let scope = ctx.scopeCurr
    let item = scope.vars[name]
    if (item) {
        return item
    }

    do {
        scope = scope.parent
        item = scope.vars[name]
        if (item) {
            return item
        }
    } while (scope !== ctx.scope)

    return null
}
