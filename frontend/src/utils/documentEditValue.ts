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

/** Short symbol for the type chip (compact / table); tap still opens type picker. */
export function fieldTypeGlyph(rawText: string): string {
  try {
    const v = parseEditableString(rawText);
    if (v === null) return 'null';
    if (Array.isArray(v)) return '[]';
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.$oid === 'string') return 'Id';
      if ('$date' in o) return 'Dt';
      return '{}';
    }
    if (typeof v === 'boolean') return v ? 'true' : 'false';
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

export function valueToEditableString(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function parseEditableString(raw: string): unknown {
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

export function buildDocumentFromFieldTexts(
  fieldTexts: Record<string, string>,
  keys: string[],
  originalId: unknown,
): { ok: true; doc: Record<string, unknown> } | { ok: false; message: string } {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k === '_id') {
      out._id = originalId;
      continue;
    }
    const raw = fieldTexts[k] ?? '';
    try {
      out[k] = parseEditableString(raw);
    } catch {
      return { ok: false, message: `Invalid value for field "${k}"` };
    }
  }
  if (!('_id' in out)) out._id = originalId;
  return { ok: true, doc: out };
}
