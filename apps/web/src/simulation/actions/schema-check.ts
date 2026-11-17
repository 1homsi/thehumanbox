type Schema = { [keyword: string]: unknown }

export type SchemaProblem =
  | 'type'
  | 'value'
  | 'pattern'
  | 'short'
  | 'long'
  | 'small'
  | 'tooFew'
  | 'tooMany'
  | 'missing'
  | 'unknownField'
  | 'shape'

export interface SchemaError {
  path: (string | number)[]
  problem: SchemaProblem
  detail: string
}

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

function matchesType(value: unknown, type: string): boolean {
  const actual = typeOf(value)
  return actual === type || (type === 'number' && actual === 'integer')
}

function validate(root: Schema, schema: Schema, value: unknown): SchemaError[] {
  const errors: SchemaError[] = []
  const resolve = (s: Schema): Schema => {
    const ref = s.$ref
    if (typeof ref !== 'string') return s
    const target = ref
      .slice(ref.indexOf('#') + 2)
      .split('/')
      .reduce<unknown>((node, part) => (node as Schema | undefined)?.[part], root)
    if (!target) throw new Error(`unresolved ${ref}`)
    return resolve({
      ...(target as Schema),
      ...Object.fromEntries(Object.entries(s).filter(([k]) => k !== '$ref')),
    })
  }
  const check = (raw: Schema, v: unknown, at: (string | number)[]) => {
    const s = resolve(raw)
    const fail = (problem: SchemaProblem, detail = '') => errors.push({ path: at, problem, detail })
    if (typeof s.type === 'string' && !matchesType(v, s.type)) return fail('type', s.type)
    if ('const' in s && v !== s.const) fail('value', JSON.stringify(s.const))
    if (Array.isArray(s.enum) && !s.enum.includes(v)) fail('value', s.enum.map(String).join(', '))
    if (typeof v === 'string') {
      if (typeof s.pattern === 'string' && !new RegExp(s.pattern).test(v)) fail('pattern', v)
      if (typeof s.minLength === 'number' && v.length < s.minLength) fail('short', String(s.minLength))
      if (typeof s.maxLength === 'number' && v.length > s.maxLength) fail('long', String(s.maxLength))
    }
    if (typeof v === 'number') {
      if (typeof s.minimum === 'number' && v < s.minimum) fail('small', String(s.minimum))
      if (typeof s.exclusiveMinimum === 'number' && v <= s.exclusiveMinimum)
        fail('small', String(s.exclusiveMinimum))
    }
    if (Array.isArray(v)) {
      if (typeof s.minItems === 'number' && v.length < s.minItems) fail('tooFew', String(s.minItems))
      if (typeof s.maxItems === 'number' && v.length > s.maxItems) fail('tooMany', String(s.maxItems))
      if (s.items) v.forEach((item, i) => check(s.items as Schema, item, [...at, i]))
    }
    if (typeOf(v) === 'object') {
      const obj = v as Record<string, unknown>
      for (const key of (s.required as string[] | undefined) ?? []) if (!(key in obj)) fail('missing', key)
      const props = (s.properties as Record<string, Schema> | undefined) ?? {}
      for (const [key, item] of Object.entries(obj)) {
        if (key in props) check(props[key], item, [...at, key])
        else if (s.additionalProperties === false) fail('unknownField', key)
        else if (typeof s.additionalProperties === 'object')
          check(s.additionalProperties as Schema, item, [...at, key])
      }
    }
    if (Array.isArray(s.oneOf)) {
      const passing = (s.oneOf as Schema[]).filter((option) => validate(root, option, v).length === 0)
      if (passing.length !== 1) fail('shape')
    }
    for (const part of (s.allOf as Schema[] | undefined) ?? []) {
      if (part.if) {
        if (validate(root, part.if as Schema, v).length === 0 && part.then) check(part.then as Schema, v, at)
      } else check(part, v, at)
    }
  }
  check(schema, value, [])
  return errors
}

export function schemaErrors(root: Schema, value: unknown): SchemaError[] {
  return validate(root, root, value)
}
