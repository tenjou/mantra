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

export type Statement =
    | VariableDeclaration
    | ExportNamedDeclaration
    | ImportDeclaration
    | EnumDeclaration
    | FunctionDeclaration
    | TypeAliasDeclaration
    | InterfaceDeclaration
    | BreakStatement
    | ContinueStatement
    | IfStatement
    | SwitchStatement
    | WhileStatement
    | ForStatement
    | ForInStatement
    | ForOfStatement
    | ReturnStatement
    | TryStatement
    | ThrowStatement
    | BlockStatement
    | EmptyStatement
    | LabeledStatement
    | ExpressionStatement

export type ParameterExpresion = NumericLiteral | BooleanLiteral | Literal | Identifier

export type Expression =
    | (
          | TemplateLiteral
          | ArrayExpression
          | ObjectExpression
          | NewExpression
          | ArrowFunction
          | MemberExpression
          | CallExpression
          | SequenceExpression
          | UpdateExpression
          | UnaryExpression
          | LogicalExpression
          | BinaryExpression
          | ConditionalExpression
          | AssignmentExpression
      )
    | ParameterExpresion

export type Kind = Any["kind"]
export type StatementType = Statement["kind"]

export type BindingAtom = ObjectExpression | Identifier

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

export interface BooleanLiteral extends Node {
    kind: "BooleanLiteral"
    value: string
}

export interface TemplateLiteral extends Node {
    kind: "TemplateLiteral"
    expressions: Expression[]
    quasis: TemplateElement[]
}

export interface TemplateElement extends Node {
    kind: "TemplateElement"
    value: string
}

export interface ExportNamedDeclaration extends Node {
    kind: "ExportNamedDeclaration"
    declaration: Statement
    specifiers: Statement[]
    source: null
}

export interface Parameter extends Node {
    kind: "Parameter"
    id: Identifier
    initializer: ParameterExpresion | null
    type: TypeNode.Any | null
}

export interface FunctionDeclaration extends Node {
    kind: "FunctionDeclaration"
    id: Identifier | null
    params: Parameter[]
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
    init: Expression | null
    type: TypeNode.Any | null
}

export interface Property extends Node {
    kind: "Property"
    key: Identifier
    value: Expression | null
    computed: boolean
    op: "init"
}

export interface ObjectExpression extends Node {
    kind: "ObjectExpression"
    properties: Property[]
    type: TypeNode.Any | null
}

export interface NewExpression extends Node {
    kind: "NewExpression"
    callee: Expression
    arguments: Expression[]
}

export interface ArrayExpression extends Node {
    kind: "ArrayExpression"
    elements: Expression[]
}

export interface ArrowFunction extends Node {
    kind: "ArrowFunction"
    params: Parameter[]
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

export interface PropertySignature extends Node {
    kind: "PropertySignature"
    name: Identifier
    type: Type.Any
}

export interface InterfaceDeclaration extends Node {
    kind: "InterfaceDeclaration"
    name: Identifier
    members: PropertySignature[]
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
    source: Literal
}

export interface ThrowStatement extends Node {
    kind: "ThrowStatement"
    argument: Expression
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
    test: Expression | null
    consequent: Statement[]
}

export interface SwitchStatement extends Node {
    kind: "SwitchStatement"
    discriminant: Expression
    cases: SwitchCase[]
}

export interface IfStatement extends Node {
    kind: "IfStatement"
    test: Expression
    consequent: Statement
    alternate: Statement | null
}

export interface WhileStatement extends Node {
    kind: "WhileStatement"
    test: Expression
    body: Statement
}

export interface ForOfStatement extends Node {
    kind: "ForOfStatement"
    left: VariableDeclaration
    right: Expression
    body: Statement
}

export interface ForInStatement extends Node {
    kind: "ForInStatement"
    left: VariableDeclaration
    right: Expression
    body: Statement
}

export interface ForStatement extends Node {
    kind: "ForStatement"
    init: Statement | null
    test: Expression | null
    update: Expression | null
    body: Statement
}

export interface ReturnStatement extends Node {
    kind: "ReturnStatement"
    argument: Expression | null
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
    expression: Expression
}

export interface LabeledStatement extends Node {
    kind: "LabeledStatement"
    body: Statement
    label: Any
}

export interface SequenceExpression extends Node {
    kind: "SequenceExpression"
    expressions: Expression[]
}

export interface ConditionalExpression extends Node {
    kind: "ConditionalExpression"
    test: Expression
    consequent: Expression
    alternate: Expression
}

export interface UnaryExpression extends Node {
    kind: "UnaryExpression"
    operator: string
    prefix: boolean
    argument: Expression
}

export interface UpdateExpression extends Node {
    kind: "UpdateExpression"
    operator: string
    prefix: boolean
    argument: Expression
}

export interface LogicalExpression extends Node {
    kind: "LogicalExpression"
    left: Expression
    operator: string
    right: Expression
    isComparison: boolean
}

export interface BinaryExpression extends Node {
    kind: "BinaryExpression"
    left: Expression
    operator: string
    right: Expression
    isComparison: boolean
}

export interface AssignPattern extends Node {
    kind: "AssignPattern"
    left: Any
    right: Expression
    type: TypeNode.Any | null
}

export interface CallExpression extends Node {
    kind: "CallExpression"
    callee: Expression
    args: Expression[]
    optional: boolean
}

export interface AssignmentExpression extends Node {
    kind: "AssignmentExpression"
    left: Expression
    operator: string
    right: Expression
    type: TypeNode.Any | null
}

export interface MemberExpression extends Node {
    kind: "MemberExpression"
    object: Expression
    property: Expression
    computed: boolean
}

export interface BlockStatement extends Node {
    kind: "BlockStatement"
    body: Statement[]
}

export interface Program extends Node {
    kind: "Program"
    body: Statement[]
}

export interface Node {
    kind: any
    start: number
    end: number
}
