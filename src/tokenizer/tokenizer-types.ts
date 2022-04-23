export interface Token {
    label: string
    keyword: boolean
    binop: number
    prefix: boolean
    postfix: boolean
    isAssign: boolean
    isComparison: boolean
}

export interface FileInput {
    fileDir: string
    fileName: string
    input: string
}

export interface Tokenizer extends FileInput {
    pos: number
    start: number
    end: number
    startLast: number
    endLast: number
    value: string
    raw: string
    kind: Token
}
