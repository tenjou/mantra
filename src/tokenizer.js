import { raise, unexpected } from "./error.js"

function isIdentifierStart(charCode) {
    if (charCode < 65) {
        return charCode === 36 // $
    }
    if (charCode < 91) {
        return true
    }
    if (charCode < 97) {
        return charCode === 95 // _
    }
    if (charCode < 123) {
        return true
    }

    return false
}

function isIdentifierChar(charCode) {
    if (charCode < 48) {
        return charCode == 36 // $
    }
    if (charCode < 58) {
        return true
    }
    if (charCode < 65) {
        return false
    }
    if (charCode < 91) {
        return true
    }
    if (charCode < 97) {
        return charCode === 95 // _
    }
    if (charCode < 123) {
        return true
    }

    return false
}

function isNewLine(charCode) {
    return charCode === 10 || charCode === 13
}

function skipSpace(ctx) {
    while (ctx.pos < ctx.input.length) {
        const charCode = ctx.input.charCodeAt(ctx.pos)
        switch (charCode) {
            case 10:
            case 32:
                ctx.pos++
                break

            case 47: // '/'
                skipLineComment(ctx)
                break

            default:
                return
        }
    }
}

function skipLineComment(ctx) {
    ctx.pos += 2

    let charCode = ctx.input.charCodeAt(ctx.pos)
    while (ctx.pos < ctx.input.length && !isNewLine(charCode)) {
        ctx.pos++
        charCode = ctx.input.charCodeAt(ctx.pos)
    }
}

function readWord(ctx) {
    while (ctx.pos < ctx.input.length) {
        const charCode = ctx.input.charCodeAt(ctx.pos)
        if (!isIdentifierChar(charCode)) {
            break
        }

        ctx.pos++
    }

    ctx.value = ctx.input.slice(ctx.start, ctx.pos)

    const keyword = keywords[ctx.value]
    if (keyword) {
        ctx.kind = keyword
    } else {
        ctx.kind = kinds.name
    }
}

function readString(ctx, quote) {
    const start = ctx.pos++

    for (;;) {
        if (ctx.pos >= ctx.input.length) {
            raise(ctx, "Unterminated string constant")
        }

        const charCode = ctx.input.charCodeAt(ctx.pos)
        ctx.pos++

        if (charCode === quote) {
            break
        }
    }

    ctx.kind = kinds.string
    ctx.value = ctx.input.slice(start, ctx.pos)
}

function readNumber(ctx) {
    for (; ctx.pos < Infinity; ctx.pos++) {
        const charCode = ctx.input.charCodeAt(ctx.pos)
        if (charCode < 48 || charCode > 57) {
            break
        }
    }

    ctx.kind = kinds.num
    ctx.value = ctx.input.slice(ctx.start, ctx.pos)
}

function readPlusMinus(ctx, charCode) {
    const nextCharCode = ctx.input.charCodeAt(ctx.pos + 1)
    if (nextCharCode === charCode) {
        ctx.kind = kinds.incrementDecrement
        ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 2)
        ctx.pos += 2
        return
    }

    if (nextCharCode === 61) {
        ctx.kind = kinds.assign
        ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 2)
        ctx.pos += 2
        return
    }

    ctx.kind = kinds.plusMinus
    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.pos++
}

function finishTokenAssign(ctx, kind) {
    const nextCharCode = ctx.input.charCodeAt(ctx.pos + 1)
    if (nextCharCode === 61) {
        ctx.kind = kinds.assign
        ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 2)
        ctx.pos += 2
        return
    }

    ctx.kind = kind
    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.pos++
}

function readEquality(ctx) {
    let size = 1

    let nextCharCode = ctx.input.charCodeAt(ctx.pos + 1)
    if (nextCharCode === 61) {
        size++
    }
    nextCharCode = ctx.input.charCodeAt(ctx.pos + 2)
    if (nextCharCode === 61) {
        size++
    }

    if (size === 1 && nextCharCode === 33) {
        unexpected(ctx)
    }

    ctx.kind = size === 1 ? kinds.assign : kinds.equality
    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + size)
    ctx.pos += size
}

function readGreaterThan(ctx) {
    const nextCharCode = ctx.input.charCodeAt(ctx.pos + 1)
    if (nextCharCode === 61) {
        ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 2)
        ctx.kind = kinds.greaterThanEquals
        ctx.pos += 2
        return
    }

    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.kind = kinds.greaterThan
    ctx.pos++
}

function readLessThan(ctx) {
    const nextCharCode = ctx.input.charCodeAt(ctx.pos + 1)
    if (nextCharCode === 61) {
        ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 2)
        ctx.kind = kinds.lessThanEquals
        ctx.pos += 2
        return
    }

    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.kind = kinds.lessThan
    ctx.pos++
}

function readLogicalOr(ctx) {
    const nextCharCode = ctx.input.charCodeAt(ctx.pos + 1)
    if (nextCharCode === 124) {
        ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 2)
        ctx.kind = kinds.logicalOr
        ctx.pos += 2
        return
    }

    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.kind = kinds.bitwiseOr
    ctx.pos += 1
}

function readLogicalAnd(ctx) {
    const nextCharCode = ctx.input.charCodeAt(ctx.pos + 1)
    if (nextCharCode === 38) {
        ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 2)
        ctx.kind = kinds.logicalAnd
        ctx.pos += 2
        return
    }

    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.kind = kinds.bitwiseAnd
    ctx.pos += 1
}

function finishToken(ctx, kind) {
    ctx.kind = kind
    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.pos++
}

function getTokenFromCode(ctx, charCode) {
    switch (charCode) {
        case 33:
            finishToken(ctx, kinds.exclamation)
            return
        case 34:
        case 39: // " '
            readString(ctx, charCode)
            return
        case 37:
            finishTokenAssign(ctx, kinds.modulo)
            return
        case 40:
            finishToken(ctx, kinds.parenthesisL)
            return
        case 41:
            finishToken(ctx, kinds.parenthesisR)
            return
        case 42:
            finishTokenAssign(ctx, kinds.star)
            return
        case 43:
        case 45: // '+ -'
            readPlusMinus(ctx, charCode)
            return
        case 44:
            finishToken(ctx, kinds.comma)
            return
        case 46: // '.'
            finishToken(ctx, kinds.dot)
            return
        case 47:
            finishTokenAssign(ctx, kinds.slash)
            return

        case 48:
        case 49:
        case 50:
        case 51:
        case 52:
        case 53:
        case 54:
        case 55:
        case 56:
        case 57: // 0-9
            readNumber(ctx)
            return

        case 58: // ':'
            finishToken(ctx, kinds.colon)
            return

        case 33:
        case 61: // '! ='
            readEquality(ctx)
            return

        case 60: // <
            readLessThan(ctx)
            return
        case 62: // >
            readGreaterThan(ctx)
            return
        case 63:
            finishToken(ctx, kinds.question)
            return

        case 123: // {
            finishToken(ctx, kinds.braceL)
            return
        case 125: // }
            finishToken(ctx, kinds.braceR)
            return

        case 59: // ;
            finishToken(ctx, kinds.semicolon)
            return

        case 38: // '&'
            readLogicalAnd(ctx)
            return
        case 91: // '['
            finishToken(ctx, kinds.bracketL)
            return
        case 93: // '['
            finishToken(ctx, kinds.bracketR)
            return
        case 94: // '^'
            finishTokenAssign(ctx, kinds.bitwiseXor)
            return
        case 96: // '`'
            finishToken(ctx, kinds.backQuote)
            return
        case 124: // |
            readLogicalOr(ctx)
            return
    }

    raise(ctx, "Unsupported feature")
}

function readTemplateToken(ctx) {
    let output = ""
    let chunkStart = ctx.pos

    for (;;) {
        if (ctx.pos >= ctx.input.length) {
            raise(ctx, "Unterminated template")
        }

        const charCode = ctx.input.charCodeAt(ctx.pos)
        if (charCode === 36) {
            if (ctx.pos === ctx.start && ctx.kind === kinds.template) {
                ctx.kind = kinds.dollarBraceL
                ctx.value = ctx.kind.label
                ctx.pos += 2
                return
            }

            const nextCharCode = ctx.input.charCodeAt(ctx.pos + 1)
            if (nextCharCode === 123) {
                output += ctx.input.slice(chunkStart, ctx.pos)
                ctx.kind = kinds.template
                ctx.value = output
                return
            }
        }

        if (charCode === 96) {
            output += ctx.input.slice(chunkStart, ctx.pos)
            ctx.kind = kinds.backQuote
            ctx.value = output
            ctx.pos++
            return
        } else if (charCode === 92) {
            output += ctx.input.slice(chunkStart, ctx.pos + 2)
            ctx.pos += 2
            chunkStart = ctx.pos
        } else if (isNewLine(charCode)) {
            output += ctx.input.slice(chunkStart, ctx.pos)
            ctx.pos++
        } else {
            ctx.pos++
        }
    }
}

export function nextToken(ctx) {
    skipSpace(ctx)

    if (ctx.pos >= ctx.input.length) {
        ctx.kind = kinds.eof
        return
    }

    ctx.startLast = ctx.start
    ctx.start = ctx.pos

    const charCode = ctx.input.charCodeAt(ctx.pos)

    if (isIdentifierStart(charCode)) {
        readWord(ctx)
    } else {
        getTokenFromCode(ctx, charCode)
    }

    ctx.endLast = ctx.end
    ctx.end = ctx.pos
}

export function nextTemplateToken(ctx) {
    ctx.startLast = ctx.start
    ctx.start = ctx.pos

    readTemplateToken(ctx)

    ctx.endLast = ctx.end
    ctx.end = ctx.pos
}

export function eat(ctx, kind) {
    if (ctx.kind === kind) {
        nextToken(ctx)
        return true
    }

    return false
}

export function expect(ctx, kind) {
    eat(ctx, kind) || unexpected(ctx)
}

function eatContextual(ctx, str) {
    if (ctx.kind === kinds.name && ctx.value === str) {
        nextToken(ctx)
        return true
    }

    return false
}

export function expectContextual(ctx, str) {
    eatContextual(ctx, str) || unexpected(ctx)
}

export function canInsertSemicolon(ctx) {
    for (let n = ctx.endLast; n < ctx.pos; n++) {
        const charCode = ctx.input.charCodeAt(n)
        if (charCode === 10) {
            return true
        }
    }

    return false
}

function token(label, options = {}) {
    return {
        label,
        keyword: options.keyword || false,
        binop: options.binop || 0,
        prefix: options.prefix || false,
        postfix: options.postfix || false,
        isAssign: options.isAssign || false,
    }
}

function keyword(name) {
    const keywordToken = token(name, { keyword: true })
    keywords[name] = keywordToken

    return keywordToken
}

function binop(name, binop) {
    return token(name, { binop })
}

const keywords = {}

export const kinds = {
    assign: token("=", { isAssign: true }),
    incrementDecrement: token("++/--", { prefix: true, postfix: true }),
    exclamation: token("!", { prefix: true }),
    logicalOr: binop("||", 1),
    logicalAnd: binop("&&", 2),
    bitwiseOr: binop("|", 3),
    bitwiseXor: binop("^", 4),
    bitwiseAnd: binop("&", 5),
    equality: binop("==/===", 6),
    greaterThan: binop(">", 7),
    lessThan: binop("<", 7),
    greaterThanEquals: binop(">=", 7),
    lessThanEquals: binop("<=", 7),
    star: binop("*", 10),
    slash: binop("/", 10),
    modulo: binop("%", 10),
    comma: token(","),
    dot: token("."),
    backQuote: token("`"),
    colon: token(":"),
    question: token("?"),
    semicolon: token(";"),
    parenthesisL: token("("),
    parenthesisR: token(")"),
    braceL: token("{"),
    braceR: token("}"),
    bracketL: token("["),
    bracketR: token("]"),
    dollarBraceL: token("${"),
    eof: token("eof"),
    name: token("name"),
    num: token("num"),
    string: token("string"),
    template: token("template"),
    plusMinus: token("+/-", { binop: 9, prefix: true }),
    var: keyword("var"),
    let: keyword("let"),
    const: keyword("const"),
    new: keyword("new"),
    function: keyword("function"),
    if: keyword("if"),
    else: keyword("else"),
    switch: keyword("switch"),
    case: keyword("case"),
    default: keyword("default"),
    break: keyword("break"),
    true: keyword("true"),
    false: keyword("false"),
    null: keyword("null"),
    return: keyword("return"),
    while: keyword("while"),
    for: keyword("for"),
    in: keyword("in"),
    of: keyword("of"),
    throw: keyword("throw"),
    import: keyword("import"),
    export: keyword("export"),
    number: keyword("number"),
    string: keyword("string"),
    boolean: keyword("boolean"),
}
