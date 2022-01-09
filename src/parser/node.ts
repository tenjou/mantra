import * as TypeNode from "./type-node"
import * as Type from "../types"

export type Any =
    | BlockStatement
    | NumericLiteral
    | Literal
    | TemplateLiteral
    | ArrowFunction
    | SwitchStatement
    | LabeledStatement
    | WhileStatement
    | ForOfStatement
    | ForInStatement
    | ForStatement
    | IfStatement
    | TryStatement
    | ReturnStatement
    | ExpressionStatement
    | ContinueStatement
    | BreakStatement
    | EmptyStatement
    | ThrowStatement
    | ObjectExpression
    | MemberExpression
    | ArrayExpression
    | SequenceExpression
    | NewExpression
    | CallExpression
    | AssignmentExpression
    | ConditionalExpression
    | ExpressionOp
    | UnaryExpression
    | UpdateExpression
    | AssignPattern
    | VariableDeclarator
    | VariableDeclaration
    | FunctionDeclaration
    | ExportNamedDeclaration
    | ImportDeclaration
    | TypeAliasDeclaration
    | EnumDeclaration
    | Identifier

export type FunctionParams = (AssignPattern | BindingAtom)[]
export type BindingAtom = ObjectExpression | Identifier
export type Kind = Any["kind"]

export interface Identifier extends Node {
    kind: "Identifier"
    value: string
}

export interface Literal extends Node {
    kind: "Literal"
    value: string
    raw: string
}

export interface NumericLiteral extends Node {
    kind: "NumericLiteral"
    value: string
}

export interface TemplateLiteral extends Node {
    kind: "TemplateLiteral"
    expressions: Any[]
    quasis: TemplateElement[]
}

export interface TemplateElement extends Node {
    kind: "TemplateElement"
    value: string
}

export interface ExportNamedDeclaration extends Node {
    kind: "ExportNamedDeclaration"
    declaration: Any
    specifiers: Any[]
    source: null
}

export interface FunctionDeclaration extends Node {
    kind: "FunctionDeclaration"
    id: Identifier | null
    params: FunctionParams
    body: BlockStatement
    expression: boolean
    generator: boolean
    async: boolean
    returnType: TypeNode.Any | null
}

export interface VariableDeclaration extends Node {
    kind: "VariableDeclaration"
    keyword: string
    declarations: VariableDeclarator[]
}

export interface VariableDeclarator extends Node {
    kind: "VariableDeclarator"
    id: Identifier
    init: Any | null
    type: TypeNode.Any | null
}

export interface Property extends Node {
    kind: "Property"
    key: Any
    value: Any | null
    computed: boolean
    op: "init"
}

export interface ObjectExpression extends Node {
    kind: "ObjectExpression"
    type: TypeNode.Any | null
    properties: Property[]
}

export interface NewExpression extends Node {
    kind: "NewExpression"
    callee: Any
    arguments: Any[]
}

export interface ArrayExpression extends Node {
    kind: "ArrayExpression"
    elements: Any[]
}

export interface ArrowFunction extends Node {
    kind: "ArrowFunction"
    params: FunctionParams
    body: BlockStatement
    returnType: TypeNode.Any | null
}

export interface EnumMember extends Node {
    kind: "EnumMember"
    name: Identifier
    initializer: NumericLiteral | Literal | null
}

export interface EnumDeclaration extends Node {
    kind: "EnumDeclaration"
    name: Identifier
    members: EnumMember[]
    type: Type.Kind
}

export interface TypeAliasDeclaration extends Node {
    kind: "TypeAliasDeclaration"
    id: string
    type: TypeNode.Any
}

export interface ImportSpecifier extends Node {
    kind: "ImportSpecifier"
    imported: Identifier
    local: Identifier | null
}

export interface NamespaceImport extends Node {
    kind: "NamespaceImport"
    name: Identifier
}

export interface NamedImports extends Node {
    kind: "NamedImports"
    specifiers: ImportSpecifier[]
}

export interface ImportDeclaration extends Node {
    kind: "ImportDeclaration"
    importClause: NamespaceImport | NamedImports
    name: Identifier | null
    source: Identifier
}

export interface ThrowStatement extends Node {
    kind: "ThrowStatement"
    argument: Any
}

export interface EmptyStatement extends Node {
    kind: "EmptyStatement"
}

export interface CatchClause extends Node {
    kind: "CatchClause"
    param: BindingAtom
    body: BlockStatement
}

export interface TryStatement extends Node {
    kind: "TryStatement"
    block: BlockStatement
    handler: CatchClause | null
    finalizer: BlockStatement | null
}

export interface SwitchCase extends Node {
    kind: "SwitchCase"
    test: Any | null
    consequent: Any[]
}

export interface SwitchStatement extends Node {
    kind: "SwitchStatement"
    discriminant: Any
    cases: SwitchCase[]
}

export interface IfStatement extends Node {
    kind: "IfStatement"
    test: Any
    consequent: Any
    alternate: Any | null
}

export interface WhileStatement extends Node {
    kind: "WhileStatement"
    test: Any
    body: Any
}

export interface ForOfStatement extends Node {
    kind: "ForOfStatement"
    left: Any
    right: Any
    body: Any
}

export interface ForInStatement extends Node {
    kind: "ForInStatement"
    left: Any
    right: Any
    body: Any
}

export interface ForStatement extends Node {
    kind: "ForStatement"
    init: Any | null
    test: Any | null
    update: Any | null
    body: Any
}

export interface ReturnStatement extends Node {
    kind: "ReturnStatement"
    argument: Any | null
}

export interface ContinueStatement extends Node {
    kind: "ContinueStatement"
    label: Identifier | null
}

export interface BreakStatement extends Node {
    kind: "BreakStatement"
    label: Identifier | null
}

export interface ExpressionStatement extends Node {
    kind: "ExpressionStatement"
    expression: Any
}

export interface LabeledStatement extends Node {
    kind: "LabeledStatement"
    body: Any
    label: Any
}

export interface SequenceExpression extends Node {
    kind: "SequenceExpression"
    expressions: Any[]
}

export interface ConditionalExpression extends Node {
    kind: "ConditionalExpression"
    test: Any
    consequent: Any
    alternate: Any
}

export interface UnaryExpression extends Node {
    kind: "UnaryExpression"
    operator: string
    prefix: boolean
    argument: Any
}

export interface UpdateExpression extends Node {
    kind: "UpdateExpression"
    operator: string
    prefix: boolean
    argument: Any
}

export interface ExpressionOp extends Node {
    kind: "LogicalExpression" | "BinaryExpression"
    left: Any
    operator: string
    right: Any
    isComparison: boolean
}

export interface AssignPattern extends Node {
    kind: "AssignPattern"
    left: Any
    right: Any
    type: TypeNode.Any | null
}

export interface CallExpression extends Node {
    kind: "CallExpression"
    callee: Any
    arguments: Any[]
    optional: boolean
}

export interface AssignmentExpression extends Node {
    kind: "AssignmentExpression"
    left: Any
    operator: string
    right: Any
    type: TypeNode.Any | null
}

export interface MemberExpression extends Node {
    kind: "MemberExpression"
    object: Any
    property: Any
    computed: boolean
}

export interface BlockStatement extends Node {
    kind: "BlockStatement"
    body: Any[]
}

export interface Program extends Node {
    kind: "Program"
    body: Any[]
}

export interface Node {
    kind: any
    start: number
    end: number
}
