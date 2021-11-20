export function isIdentifierStart(charCode) {
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

export function isIdentifierChar(charCode) {
    if (charCode < 48) {
        return charCode === 36 // $
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

export function isNewLine(charCode) {
    return charCode === 10 || charCode === 13
}
