export interface Token {
    label: string
    keyword: boolean
    binop: number
    prefix: boolean
    postfix: boolean
    isAssign: boolean
    isComparison: boolean
}
