type Schema = { [keyword: string]: unknown }

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

function validate(root: Schema, schema: Schema, value: unknown): string[] {
  const errors: string[] = []
  const resolve = (schema: Schema): Schema => {
    const ref = schema.$ref
    if (typeof ref !== 'string') return schema
    const target = ref
      .slice(ref.indexOf('#') + 2)
      .split('/')
      .reduce<unknown>((node, part) => (node as Schema | undefined)?.[part], root)
    if (!target) throw new Error(`unresolved ${ref}`)
    return resolve(target as Schema)
  }
  const check = (raw: Schema, v: unknown, at: string): boolean => {
    const s = resolve(raw)
    const before = errors.length
    const fail = (why: string) => errors.push(`${at || '/'}: ${why}`)
    if (typeof s.type === 'string' && !matchesType(v, s.type)) fail(`expected ${s.type}`)
    if ('const' in s && v !== s.const) fail(`expected ${JSON.stringify(s.const)}`)
    if (Array.isArray(s.enum) && !s.enum.includes(v)) fail(`not one of ${JSON.stringify(s.enum)}`)
    if (typeof v === 'string') {
      if (typeof s.pattern === 'string' && !new RegExp(s.pattern).test(v)) fail(`does not match ${s.pattern}`)
      if (typeof s.minLength === 'number' && v.length < s.minLength) fail('too short')
    }
    if (typeof v === 'number') {
      if (typeof s.minimum === 'number' && v < s.minimum) fail(`below ${s.minimum}`)
      if (typeof s.exclusiveMinimum === 'number' && v <= s.exclusiveMinimum)
        fail(`not above ${s.exclusiveMinimum}`)
    }
    if (Array.isArray(v)) {
      if (typeof s.minItems === 'number' && v.length < s.minItems) fail('too few items')
      if (s.items) v.forEach((item, i) => check(s.items as Schema, item, `${at}/${i}`))
    }
    if (typeOf(v) === 'object') {
      const obj = v as Record<string, unknown>
      for (const key of (s.required as string[] | undefined) ?? []) if (!(key in obj)) fail(`missing ${key}`)
      const props = (s.properties as Record<string, Schema> | undefined) ?? {}
      for (const [key, item] of Object.entries(obj)) {
        if (key in props) check(props[key], item, `${at}/${key}`)
        else if (s.additionalProperties === false) fail(`unexpected ${key}`)
        else if (typeof s.additionalProperties === 'object')
          check(s.additionalProperties as Schema, item, `${at}/${key}`)
      }
    }
    if (Array.isArray(s.oneOf)) {
      const passing = (s.oneOf as Schema[]).filter((option) => validate(root, option, v).length === 0)
      if (passing.length !== 1) fail(`matches ${passing.length} of oneOf`)
    }
    for (const part of (s.allOf as Schema[] | undefined) ?? []) {
      if (part.if) {
        if (validate(root, part.if as Schema, v).length === 0 && part.then) check(part.then as Schema, v, at)
      } else check(part, v, at)
    }
    return errors.length === before
  }
  check(schema, value, '')
  return errors
}

export function schemaErrors(root: Schema, value: unknown): string[] {
  return validate(root, root, value)
}
