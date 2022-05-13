type Partialz<T> = { [P in keyof T]?: T[P] }
// // type Recordz<K extends string | number, T> = { [P in K]: T; }

interface Foo {}

const x: Partialz<Foo> = {}
