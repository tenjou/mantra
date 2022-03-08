export enum Kind {
    unknown,
    number,
    string,
    boolean,
    function,
    array,
    object,
    type,
    union,
    void,
    args,
    enum,
}

enum Foo {
    a = 10,
}

const x: Kind = Foo.a
