interface Foo {
    name: string
    kind: string
    x: number
}

export function createType(name: string, kind: string) {
    if (name) {
        return { name, kind, x: 10 }
    }
    return { name, kind, x: 20 }
}
