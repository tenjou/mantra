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
    enumMember,
    interface,
}

type DefaultKind = Kind.unknown

export interface Default {
    name: string
    kind: DefaultKind
}
