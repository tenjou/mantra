import { raiseAt, unexpected } from "../error"
import { Token, Tokenizer } from "./tokenizer-types"
import { isIdentifierChar, isIdentifierStart, isNewLine } from "./tokenizer-utils"

function skipSpace(ctx: Tokenizer): void {
    while (ctx.pos < ctx.input.length) {
        const charCode = ctx.input.charCodeAt(ctx.pos)
        switch (charCode) {
            case 10:
            case 13:
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

function skipLineComment(ctx: Tokenizer): void {
    ctx.pos += 2

    let charCode = ctx.input.charCodeAt(ctx.pos)
    while (ctx.pos < ctx.input.length && !isNewLine(charCode)) {
        ctx.pos++
        charCode = ctx.input.charCodeAt(ctx.pos)
    }
}

function readWord(ctx: Tokenizer): void {
    while (ctx.pos < ctx.input.length) {
        const charCode = ctx.input.charCodeAt(ctx.pos)
        if (!isIdentifierChar(charCode)) {
            break
        }

        ctx.pos++
    }

    ctx.value = ctx.input.slice(ctx.start, ctx.pos)
    ctx.raw = ctx.value

    const keyword = keywords[ctx.value]
    if (keyword) {
        ctx.kind = keyword
    } else {
        ctx.kind = kinds.name
    }
}

function readText(ctx: Tokenizer, quote: number): void {
    const start = ctx.pos++

    for (;;) {
        if (ctx.pos >= ctx.input.length) {
            raiseAt(ctx, ctx.pos, "Unterminated string constant")
        }

        const charCode = ctx.input.charCodeAt(ctx.pos)
        ctx.pos++

        if (charCode === quote) {
            break
        }
    }

    ctx.kind = kinds.text
    ctx.raw = ctx.input.slice(start, ctx.pos)
    ctx.value = ctx.input.slice(start + 1, ctx.pos - 1)
}

function readNumber(ctx: Tokenizer): void {
    let hadDot = false

    for (; ctx.pos < Infinity; ctx.pos++) {
        const charCode = ctx.input.charCodeAt(ctx.pos)

        if (charCode === 46) {
            if (hadDot) {
                raiseAt(ctx, ctx.pos, `Unexpected number`)
            }
            hadDot = true
            continue
        }

        if (charCode < 48 || charCode > 57 || isNaN(charCode)) {
            break
        }
    }

    ctx.kind = kinds.num
    ctx.value = ctx.input.slice(ctx.start, ctx.pos)
}

function readPlusMinus(ctx: Tokenizer, charCode: number): void {
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

function finishTokenAssign(ctx: Tokenizer, kind: Token): void {
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

function readEquality(ctx: Tokenizer, charCode: number): void {
    let size = 1

    let nextCharCode = ctx.input.charCodeAt(ctx.pos + 1)
    if (nextCharCode === 61) {
        size++
    }
    if (nextCharCode === 62) {
        ctx.kind = kinds.arrow
        ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 2)
        ctx.pos += 2
        return
    }

    nextCharCode = ctx.input.charCodeAt(ctx.pos + 2)
    if (nextCharCode === 61) {
        size++
    }

    if (size === 1 && nextCharCode === 33) {
        unexpected(ctx, ctx.pos)
    }

    ctx.kind = size === 1 ? (charCode === 33 ? kinds.prefix : kinds.assign) : kinds.equality
    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + size)
    ctx.pos += size
}

function readGreaterThan(ctx: Tokenizer): void {
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

function readLessThan(ctx: Tokenizer): void {
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

function readLogicalOr(ctx: Tokenizer): void {
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

function readLogicalAnd(ctx: Tokenizer): void {
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

function finishToken(ctx: Tokenizer, kind: Token): void {
    ctx.kind = kind
    ctx.value = ctx.input.slice(ctx.pos, ctx.pos + 1)
    ctx.pos++
}

function getTokenFromCode(ctx: Tokenizer, charCode: number): void {
    switch (charCode) {
        case 33:
        case 61: // '! ='
            readEquality(ctx, charCode)
            return
        case 34:
        case 39: // " '
            readText(ctx, charCode)
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

    raiseAt(ctx, ctx.pos, "Unsupported feature")
}

function readTemplateToken(ctx: Tokenizer): void {
    let output = ""
    let chunkStart = ctx.pos

    for (;;) {
        if (ctx.pos >= ctx.input.length) {
            raiseAt(ctx, ctx.pos, "Unterminated template")
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

export function nextToken(ctx: Tokenizer): void {
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

export function nextTemplateToken(ctx: Tokenizer): void {
    ctx.startLast = ctx.start
    ctx.start = ctx.pos

    readTemplateToken(ctx)

    ctx.endLast = ctx.end
    ctx.end = ctx.pos
}

export function eat(ctx: Tokenizer, kind: Token): boolean {
    if (ctx.kind === kind) {
        nextToken(ctx)
        return true
    }

    return false
}

export function expect(ctx: Tokenizer, kind: Token): boolean {
    return eat(ctx, kind) || unexpected(ctx, ctx.pos, kind.label)
}

function eatContextual(ctx: Tokenizer, str: string): boolean {
    if (ctx.kind === kinds.name && ctx.value === str) {
        nextToken(ctx)
        return true
    }

    return false
}

export function expectContextual(ctx: Tokenizer, str: string): void {
    eatContextual(ctx, str) || unexpected(ctx, ctx.pos)
}

export function canInsertSemicolon(ctx: Tokenizer): boolean {
    for (let n = ctx.endLast; n < ctx.pos; n++) {
        const charCode = ctx.input.charCodeAt(n)
        if (charCode === 10) {
            return true
        }
    }

    return false
}

export function possibleArrowFunction(ctx: Tokenizer): boolean {
    for (let n = ctx.endLast; n < ctx.pos; n++) {
        const charCode = ctx.input.charCodeAt(n)
        if (isNewLine(charCode)) {
            return false
        }

        // =
        if (charCode === 61) {
            // >
            const charCode2 = ctx.input.charCodeAt(n++)
            if (charCode2 === 62) {
                return true
            }
        }
    }

    return false
}

function createToken(label: string, options: Partial<Token> = {}): Token {
    return {
        label,
        keyword: options.keyword || false,
        binop: options.binop || 0,
        prefix: options.prefix || false,
        postfix: options.postfix || false,
        isAssign: options.isAssign || false,
        isComparison: options.isComparison || false,
    }
}

function createKeyword(name: string, options: Partial<Token> = {}): Token {
    options.keyword = true

    const keywordToken = createToken(name, options)
    keywords[name] = keywordToken

    return keywordToken
}

function createBinop(name: string, binop: number, isComparison = false): Token {
    return createToken(name, { binop, isComparison })
}

const keywords: Record<string, Token> = {}

export const kinds: Record<string, Token> = {
    assign: createToken("=", { isAssign: true }),
    incrementDecrement: createToken("++/--", { prefix: true, postfix: true }),
    prefix: createToken("!", { prefix: true }),
    logicalOr: createBinop("||", 1, true),
    logicalAnd: createBinop("&&", 2),
    bitwiseOr: createBinop("|", 3),
    bitwiseXor: createBinop("^", 4),
    bitwiseAnd: createBinop("&", 5),
    equality: createBinop("==/===", 6, true),
    greaterThan: createBinop(">", 7, true),
    lessThan: createBinop("<", 7, true),
    greaterThanEquals: createBinop(">=", 7, true),
    lessThanEquals: createBinop("<=", 7, true),
    star: createBinop("*", 10),
    slash: createBinop("/", 10),
    modulo: createBinop("%", 10),
    comma: createToken(","),
    dot: createToken("."),
    backQuote: createToken("`"),
    colon: createToken(":"),
    question: createToken("?"),
    semicolon: createToken(";"),
    parenthesisL: createToken("("),
    parenthesisR: createToken(")"),
    braceL: createToken("{"),
    braceR: createToken("}"),
    bracketL: createToken("["),
    bracketR: createToken("]"),
    dollarBraceL: createToken("${"),
    arrow: createToken("=>"),
    eof: createToken("eof"),
    name: createToken("name"),
    num: createToken("num"),
    text: createToken("text"),
    template: createToken("template"),
    plusMinus: createToken("+/-", { binop: 9, prefix: true }),
    instanceof: createKeyword("instanceof", { binop: 7 }),
    var: createKeyword("var"),
    let: createKeyword("let"),
    const: createKeyword("const"),
    new: createKeyword("new"),
    function: createKeyword("function"),
    if: createKeyword("if"),
    else: createKeyword("else"),
    switch: createKeyword("switch"),
    case: createKeyword("case"),
    default: createKeyword("default"),
    break: createKeyword("break"),
    true: createKeyword("true"),
    false: createKeyword("false"),
    undef: createKeyword("undefined"),
    null: createKeyword("null"),
    return: createKeyword("return"),
    while: createKeyword("while"),
    for: createKeyword("for"),
    continue: createKeyword("continue"),
    in: createKeyword("in"),
    of: createKeyword("of"),
    try: createKeyword("try"),
    catch: createKeyword("catch"),
    finally: createKeyword("finally"),
    throw: createKeyword("throw"),
    import: createKeyword("import"),
    export: createKeyword("export"),
    type: createKeyword("type"),
    interface: createKeyword("interface"),
    extends: createKeyword("extends"),
    enum: createKeyword("enum"),
    as: createKeyword("as"),
    never: createKeyword("never"),
    keyof: createKeyword("keyof"),
}
