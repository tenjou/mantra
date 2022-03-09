enum Kind {
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
    enumMember,
}

type DefaultKind = Kind.unknown | Kind.string

const x: DefaultKind = Kind.string
