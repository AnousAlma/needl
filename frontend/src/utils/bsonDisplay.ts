import type { ThemeColors } from '../theme/colors';

export type BsonColorKind = 'objectId' | 'string' | 'number' | 'boolean' | 'null' | 'date' | 'other';

function isLikelyObjectIdHex(s: string): boolean {
  return /^[a-f\d]{24}$/i.test(s);
}

export function bsonTypeLabel(value: unknown, fieldKey?: string): string {
  if (value === null) return 'Null';
  if (value === undefined) return 'Undefined';
  if (typeof value === 'string' && fieldKey === '_id' && isLikelyObjectIdHex(value)) return 'ObjectId';
  if (Array.isArray(value)) return 'Array';
  if (typeof value === 'object' && value !== null) {
    const o = value as Record<string, unknown>;
    if (typeof o.$oid === 'string') return 'ObjectId';
    if (o.$date !== undefined) return 'Date';
    if (typeof o.$numberDecimal === 'string') return 'Decimal128';
    if (typeof o.$numberLong === 'string') return 'Long';
    if (typeof o.$binary !== 'undefined') return 'BinData';
    return 'Object';
  }
  if (typeof value === 'boolean') return 'Boolean';
  if (typeof value === 'number') {
    return Number.isInteger(value) && Math.abs(value) <= 2147483647 ? 'Int32' : 'Double';
  }
  if (typeof value === 'string') return 'String';
  return 'Mixed';
}

export function colorForBsonKind(kind: BsonColorKind, colors: ThemeColors): string {
  switch (kind) {
    case 'objectId':
      return colors.syntaxObjectId;
    case 'string':
      return colors.syntaxString;
    case 'number':
      return colors.syntaxNumber;
    case 'boolean':
      return colors.syntaxBoolean;
    case 'null':
      return colors.syntaxNull;
    case 'date':
      return colors.syntaxBoolean;
    default:
      return colors.text;
  }
}

export function formatBsonCellText(
  value: unknown,
  maxLen = 44,
  fieldKey?: string,
): { text: string; kind: BsonColorKind } {
  if (value === null) return { text: 'null', kind: 'null' };
  if (value === undefined) return { text: '', kind: 'other' };
  if (typeof value === 'string' && fieldKey === '_id' && isLikelyObjectIdHex(value)) {
    const full = `ObjectId('${value}')`;
    return {
      text: full.length > maxLen ? `${full.slice(0, maxLen - 1)}…` : full,
      kind: 'objectId',
    };
  }
  if (Array.isArray(value)) {
    const t = `[${value.length} items]`;
    return { text: t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t, kind: 'other' };
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.$oid === 'string') {
      const full = `ObjectId('${o.$oid}')`;
      return {
        text: full.length > maxLen ? `${full.slice(0, maxLen - 1)}…` : full,
        kind: 'objectId',
      };
    }
    if (o.$date !== undefined) {
      const full =
        typeof o.$date === 'string' ? `ISODate("${o.$date}")` : `Date(${JSON.stringify(o.$date)})`;
      return {
        text: full.length > maxLen ? `${full.slice(0, maxLen - 1)}…` : full,
        kind: 'date',
      };
    }
    try {
      const s = JSON.stringify(value);
      const t = s.length > maxLen ? `${s.slice(0, maxLen - 1)}…` : s;
      return { text: t, kind: 'other' };
    } catch {
      return { text: '{…}', kind: 'other' };
    }
  }
  if (typeof value === 'string') {
    const raw = JSON.stringify(value);
    const t = raw.length > maxLen ? `${raw.slice(0, maxLen - 1)}…` : raw;
    return { text: t, kind: 'string' };
  }
  if (typeof value === 'number') return { text: String(value), kind: 'number' };
  if (typeof value === 'boolean') return { text: String(value), kind: 'boolean' };
  return { text: String(value), kind: 'other' };
}

/**
 * One-line value for Compass-style compact field list: plain objects collapse to `{...}`
 * so huge nested maps do not flood the card (BSON extended types stay expanded).
 */
/** True for Mongo extended JSON shapes that should render as a single scalar line (not `{...}`). */
export function isBsonExtendedScalarObject(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  if (typeof o.$oid === 'string') return true;
  if (o.$date !== undefined) return true;
  if (typeof o.$numberDecimal === 'string' || typeof o.$numberLong === 'string') return true;
  if (typeof o.$binary !== 'undefined') return true;
  return false;
}

/** Plain object or array that can be collapsed in compact / JSON tree views. */
export function isCollapsibleNestedValue(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (!value || typeof value !== 'object') return false;
  return !isBsonExtendedScalarObject(value);
}

/** Matches compact field-line placeholders `{...}` or `[n items]`. */
export function fieldSummaryIsExpandable(text: string, value: unknown): boolean {
  if (!isCollapsibleNestedValue(value)) return false;
  if (text === '{...}') return true;
  return /^\[\d+ items\]$/.test(text);
}

export function formatBsonFieldLine(value: unknown, fieldKey?: string): { text: string; kind: BsonColorKind } {
  if (value === null) return { text: 'null', kind: 'null' };
  if (value === undefined) return { text: '', kind: 'other' };
  if (typeof value === 'string' && fieldKey === '_id' && isLikelyObjectIdHex(value)) {
    return { text: `ObjectId('${value}')`, kind: 'objectId' };
  }
  if (Array.isArray(value)) {
    return { text: `[${value.length} items]`, kind: 'other' };
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.$oid === 'string') {
      return { text: `ObjectId('${o.$oid}')`, kind: 'objectId' };
    }
    if (o.$date !== undefined) {
      const full =
        typeof o.$date === 'string' ? `ISODate("${o.$date}")` : `Date(${JSON.stringify(o.$date)})`;
      return { text: full, kind: 'date' };
    }
    if (
      typeof o.$numberDecimal === 'string' ||
      typeof o.$numberLong === 'string' ||
      typeof o.$binary !== 'undefined'
    ) {
      return formatBsonCellText(value, 8000, fieldKey);
    }
    return { text: '{...}', kind: 'other' };
  }
  if (typeof value === 'string') {
    return { text: JSON.stringify(value), kind: 'string' };
  }
  if (typeof value === 'number') return { text: String(value), kind: 'number' };
  if (typeof value === 'boolean') return { text: String(value), kind: 'boolean' };
  return { text: String(value), kind: 'other' };
}

export function unionDocumentKeys(documents: unknown[]): string[] {
  const set = new Set<string>();
  for (const d of documents) {
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      for (const k of Object.keys(d as object)) set.add(k);
    }
  }
  const keys = [...set];
  keys.sort((a, b) => {
    if (a === '_id') return -1;
    if (b === '_id') return 1;
    return a.localeCompare(b);
  });
  return keys;
}

export function columnTypeForKey(key: string, documents: unknown[]): string {
  for (const d of documents) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) continue;
    const v = (d as Record<string, unknown>)[key];
    if (v !== undefined) return bsonTypeLabel(v, key);
  }
  return 'Mixed';
}
