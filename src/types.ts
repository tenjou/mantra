export enum TypeKind {
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

export const TypeKindNamed = Object.keys(TypeKind)

// interface BaseType {
//     name: string
//     kind: TypeKind
// }

// interface ArrayType extends BaseType {}

// type Type = BaseType | ArrayType

// interface Reference {
//     name: string | null
//     flags: number
//     type: Type
// }

// export const Flags = {
//     None: 0,
//     Checked: 1,
//     Const: 2,
//     Exported: 4,
// }

// export const coreTypeAliases = {
//     unknown: createType("unknown", TypeKind.unknown),
//     number: createType("number", TypeKind.number),
//     string: createType("string", TypeKind.string),
//     boolean: createType("boolean", TypeKind.boolean),
//     void: createType("void", TypeKind.void),
//     object: createType("object", TypeKind.object),
//     args: createType("args", TypeKind.args),
// }

// export const coreTypeRefs = {
//     unknown: { type: coreTypeAliases.unknown, flags: 0 },
//     number: { type: coreTypeAliases.number, flags: 0 },
//     string: { type: coreTypeAliases.string, flags: 0 },
//     boolean: { type: coreTypeAliases.boolean, flags: 0 },
//     void: { type: coreTypeAliases.void, flags: 0 },
//     args: { type: coreTypeAliases.args, flags: 0 },
// }

// export function createType(name: string, kind: TypeKind) {
//     return { name, kind }
// }

// export function loadCoreTypes(ctx) {
//     ctx.typeAliases = {
//         ...coreTypeAliases,
//     }
// }

// interface Type {
//     type: TypeKind
//     flags: number
// }

// interface Reference {
//     type: Type
//     flags: number
//     name: string
// }

// export function createRef(type: Type, name: string = ""): Reference {
//     return { type, flags: 0, name }
// }

// export function createObject(name, members = {}) {
//     const type = { name: name || "{}", kind: TypeKind.object, members }

//     return { type, flags: 0 }
// }

// export function createEnum(name, enumType, members = {}, values = {}) {
//     const type = { name: name || "enum", kind: TypeKind.enum, enumType, members, values }

//     return { type, flags: 0 }
// }

// export function createFunction(name, args, returnType = null) {
//     let argsMin = 0
//     let argsMax = 0

//     for (let n = 0; n < args.length; n++) {
//         const arg = args[n]
//         if (arg.kind !== TypeKind.args) {
//             argsMin++
//             argsMax++
//         } else {
//             argsMax = Number.MAX_SAFE_INTEGER
//         }
//     }

//     const type = { name, kind: TypeKind.function, args, argsMin, argsMax, returnType }
//     return type
// }

// export function createArg(name, type) {
//     return { name, type, flags: 0 }
// }

// export function createUnion(name, types) {
//     return { name, kind: TypeKind.union, types }
// }

// export function createArray(elementType): Reference {
//     const type: Type = { name: "array", kind: TypeKind.array, elementType }

//     return { type, flags: 0 }
// }
