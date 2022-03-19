interface Foo {
    name: string
    kind: string
    x: number
}

export function createType(name: string, kind: string): Foo {
    return { name, kind, x: 20.5 }
}
