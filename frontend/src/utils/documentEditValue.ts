/** Round-trip helpers for editing BSON-ish values as text in field editors. */

function isObjectIdHexString(s: string): boolean {
  return /^[a-f\d]{24}$/i.test(s);
}

/**
 * Shell-style ObjectId("...") for compact document edit (read-only _id).
 * Returns null if the value is not a plain EJSON ObjectId or 24-char hex string.
 */
export function compactObjectIdFieldDisplayFromText(rawFieldText: string): string | null {
  const t = rawFieldText.trim();
  if (!t) return null;
  try {
    const v = JSON.parse(t) as unknown;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const keys = Object.keys(o);
      if (keys.length === 1 && typeof o.$oid === 'string' && isObjectIdHexString(o.$oid)) {
        return `ObjectId("${o.$oid}")`;
      }
    }
  } catch {
    if (isObjectIdHexString(t)) return `ObjectId("${t}")`;
  }
  return null;
}

export type FieldValueKind = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array';

export const FIELD_KIND_OPTIONS: { id: FieldValueKind; label: string }[] = [
  { id: 'string', label: 'String' },
  { id: 'number', label: 'Number' },
  { id: 'boolean', label: 'Boolean' },
  { id: 'null', label: 'Null' },
  { id: 'object', label: 'Object' },
  { id: 'array', label: 'Array' },
];

export function defaultValueForKind(kind: FieldValueKind): unknown {
  switch (kind) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'null':
      return null;
    case 'object':
      return {};
    case 'array':
      return [];
    default:
      return null;
  }
}

function valueAsKind(v: unknown, kind: FieldValueKind): unknown {
  switch (kind) {
    case 'string':
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    case 'number': {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      const n = Number(String(v).trim());
      return Number.isFinite(n) ? n : 0;
    }
    case 'boolean': {
      if (typeof v === 'boolean') return v;
      const s = String(v).trim().toLowerCase();
      if (s === 'true' || s === '1') return true;
      if (s === 'false' || s === '0' || s === '') return false;
      return Boolean(v);
    }
    case 'null':
      return null;
    case 'object':
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) return { ...(v as Record<string, unknown>) };
      if (typeof v === 'string') {
        try {
          const p = JSON.parse(v) as unknown;
          if (p && typeof p === 'object' && !Array.isArray(p)) return p;
        } catch {
          /* fallthrough */
        }
      }
      return {};
    case 'array':
      if (Array.isArray(v)) return [...v];
      if (typeof v === 'string') {
        try {
          const p = JSON.parse(v) as unknown;
          if (Array.isArray(p)) return p;
        } catch {
          /* fallthrough */
        }
      }
      return [];
    default:
      return v;
  }
}

export function convertFieldTextToKind(
  rawText: string,
  kind: FieldValueKind,
): { ok: true; text: string } | { ok: false; message: string } {
  try {
    const v = parseEditableString(rawText);
    const coerced = valueAsKind(v, kind);
    return { ok: true, text: valueToEditableString(coerced) };
  } catch {
    return { ok: false, message: 'Could not parse current value' };
  }
}

/** Top-level keys whose compact/table cell text is a literal string (not JSON / number coercion). */
export function stringFieldKeysFromDoc(doc: Record<string, unknown>): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (typeof v === 'string') o[k] = true;
  }
  return o;
}

/** Short symbol for the type chip (compact / table); tap still opens type picker. */
export function fieldTypeGlyph(rawText: string, treatAsStringField?: boolean): string {
  try {
    const v = parseEditableString(rawText, treatAsStringField ? { asString: true } : undefined);
    if (v === null) return 'null';
    if (Array.isArray(v)) return '[]';
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.$oid === 'string') return 'Id';
      if ('$date' in o) return 'Dt';
      return '{}';
    }
    if (typeof v === 'boolean') return 'bool';
    if (typeof v === 'number') return '#';
    if (typeof v === 'string') return '""';
    return '?';
  } catch {
    return '?';
  }
}

export function inferFieldValueKind(v: unknown): FieldValueKind {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'object') return 'object';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  return 'string';
}

export function validateNewFieldName(name: string, existingKeys: string[]): string | null {
  const t = name.trim();
  if (!t) return 'Enter a field name';
  if (t === '_id') return 'Cannot add a second _id';
  if (existingKeys.includes(t)) return 'A field with this name already exists';
  return null;
}

/** Key name for a new nested object property in compact edit (`newField`, `newField_1`, …). */
export function uniqueNestedObjectKey(existingKeys: string[], base = 'newField'): string {
  if (!existingKeys.includes(base)) return base;
  let n = 1;
  while (existingKeys.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export function valueToEditableString(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') {
    if (value === '') return '';
    /** Raw text in editors — JSON.stringify would add quotes and cause escape snowball on each keystroke. */
    return value;
  }
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export type ParseEditableStringOptions = {
  /** Field is string type: keep raw text (no JSON.parse / number coercion). */
  asString?: boolean;
};

export function parseEditableString(raw: string, opts?: ParseEditableStringOptions): unknown {
  if (opts?.asString) {
    if (raw === '') return '';
    return raw;
  }
  const t = raw.trim();
  if (t === '') return '';
  try {
    return JSON.parse(t) as unknown;
  } catch {
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t === 'null') return null;
    if (/^-?\d+$/.test(t)) return Number(t);
    if (/^-?\d+\.\d+$/.test(t)) return Number(t);
    return t;
  }
}

export function sortedDocumentKeys(doc: Record<string, unknown>): string[] {
  const keys = Object.keys(doc);
  keys.sort((a, b) => {
    if (a === '_id') return -1;
    if (b === '_id') return 1;
    return a.localeCompare(b);
  });
  return keys;
}

/** EJSON one-key scalars — keep as a single compact field, not expanded rows. */
export function isBsonScalarWrapper(v: unknown): boolean {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 1) return false;
  const k = keys[0]!;
  if (k === '$oid' && typeof o.$oid === 'string') return true;
  if (k === '$date' && (typeof o.$date === 'string' || typeof o.$date === 'number')) return true;
  if ((k === '$numberInt' || k === '$numberLong') && typeof o[k] === 'string') return true;
  if (k === '$numberDouble' && (typeof o.$numberDouble === 'string' || typeof o.$numberDouble === 'number'))
    return true;
  return false;
}

/** True when compact edit should show nested rows (array items or object properties). */
export function shouldExpandCompactValue(v: unknown): boolean {
  if (Array.isArray(v)) return true;
  if (v !== null && typeof v === 'object' && !isBsonScalarWrapper(v)) return true;
  return false;
}

/** Horizontal wide-row scroll only when array/object has entries (empty [] / {} stay screen-width). */
export function compactExpandedNeedsWideScrollRow(v: unknown): boolean {
  if (!shouldExpandCompactValue(v)) return false;
  if (Array.isArray(v)) return v.length > 0;
  return Object.keys(v as Record<string, unknown>).length > 0;
}

export function buildDocumentFromFieldTexts(
  fieldTexts: Record<string, string>,
  keys: string[],
  originalId: unknown,
  stringFieldKeys?: Record<string, boolean>,
): { ok: true; doc: Record<string, unknown> } | { ok: false; message: string } {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k === '_id') {
      out._id = originalId;
      continue;
    }
    const raw = fieldTexts[k] ?? '';
    try {
      const asString = stringFieldKeys?.[k] === true;
      out[k] = parseEditableString(raw, asString ? { asString: true } : undefined);
    } catch {
      return { ok: false, message: `Invalid value for field "${k}"` };
    }
  }
  if (!('_id' in out)) out._id = originalId;
  return { ok: true, doc: out };
}
