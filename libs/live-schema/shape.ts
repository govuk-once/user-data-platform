/**
 * Structural shape of a payload, expressed as a JSON Schema (draft-07) subset.
 * Only types are recorded - never values - so a shape is safe to store
 * outside the encrypted data table.
 */
export type JsonType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'null'
  | 'object'
  | 'array';

export interface JsonSchema {
  type?: JsonType | JsonType[];
  format?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
}

export const JSON_SCHEMA_DIALECT = 'http://json-schema.org/draft-07/schema#';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const stringFormat = (value: string): string | undefined => {
  if (DATE.test(value)) return 'date';
  if (DATE_TIME.test(value)) return 'date-time';
  return undefined;
};

const typesOf = (schema: JsonSchema): JsonType[] => {
  if (schema.type === undefined) return [];
  return Array.isArray(schema.type) ? schema.type : [schema.type];
};

/** Collapses a type list to its canonical form: sorted, de-duplicated. */
const normaliseTypes = (
  types: JsonType[],
): JsonType | JsonType[] | undefined => {
  const unique = [...new Set(types)];
  // `integer` is a subset of `number`; once both are seen keep the wider one.
  const widened = unique.includes('number')
    ? unique.filter((t) => t !== 'integer')
    : unique;
  widened.sort();
  if (widened.length === 0) return undefined;
  return widened.length === 1 ? widened[0] : widened;
};

/** Infers the shape of a single JSON value. */
export const inferSchema = (value: unknown): JsonSchema => {
  if (value === null || value === undefined) return { type: 'null' };

  if (Array.isArray(value)) {
    const items = value
      .map(inferSchema)
      .reduce<
        JsonSchema | undefined
      >((acc, s) => (acc ? mergeSchemas(acc, s) : s), undefined);
    return items ? { type: 'array', items } : { type: 'array' };
  }

  switch (typeof value) {
    case 'string': {
      const format = stringFormat(value);
      return format ? { type: 'string', format } : { type: 'string' };
    }
    case 'number':
      return { type: Number.isInteger(value) ? 'integer' : 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'object': {
      const entries = Object.entries(value as Record<string, unknown>).filter(
        ([, v]) => v !== undefined,
      );
      return {
        type: 'object',
        properties: Object.fromEntries(
          entries.map(([k, v]) => [k, inferSchema(v)]),
        ),
        required: entries.map(([k]) => k),
      };
    }
    default:
      throw new Error(`Cannot infer schema for ${typeof value}`);
  }
};

/**
 * Widens `a` to also describe everything `b` describes. Properties are
 * unioned, `required` becomes the keys present in both, conflicting types
 * become a type list, and a string `format` survives only if both agree.
 * The result is canonical (see {@link canonicalise}).
 */
export const mergeSchemas = (a: JsonSchema, b: JsonSchema): JsonSchema => {
  const merged: JsonSchema = {};

  const type = normaliseTypes([...typesOf(a), ...typesOf(b)]);
  if (type !== undefined) merged.type = type;

  if (a.format && a.format === b.format) merged.format = a.format;
  else if (a.format && !typesOf(b).includes('string')) merged.format = a.format;
  else if (b.format && !typesOf(a).includes('string')) merged.format = b.format;

  if (a.properties || b.properties) {
    const keys = new Set([
      ...Object.keys(a.properties ?? {}),
      ...Object.keys(b.properties ?? {}),
    ]);
    merged.properties = {};
    for (const key of keys) {
      const left = a.properties?.[key];
      const right = b.properties?.[key];
      merged.properties[key] =
        left && right
          ? mergeSchemas(left, right)
          : canonicalise(left ?? right!);
    }

    // A key is only required if every object seen so far carried it. An
    // object-less side (e.g. `null`) contributes no keys, so leaves it intact.
    const isObject = (s: JsonSchema) => s.properties !== undefined;
    const required =
      isObject(a) && isObject(b)
        ? (a.required ?? []).filter((k) => (b.required ?? []).includes(k))
        : [...((isObject(a) ? a.required : b.required) ?? [])];
    merged.required = [...new Set(required)].sort();
  }

  if (a.items || b.items) {
    merged.items =
      a.items && b.items
        ? mergeSchemas(a.items, b.items)
        : canonicalise((a.items ?? b.items)!);
  }

  return merged;
};

/** Returns a copy with sorted keys, types and `required`, for stable comparison. */
export const canonicalise = (schema: JsonSchema): JsonSchema =>
  mergeSchemas(schema, {});

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
      );
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
};

/** Structural equality, independent of key order (jsonb reorders keys). */
export const schemasEqual = (a: JsonSchema, b: JsonSchema): boolean =>
  stableStringify(canonicalise(a)) === stableStringify(canonicalise(b));
