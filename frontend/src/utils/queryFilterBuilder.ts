/** iOS “Smart Punctuation” and similar produce curly quotes; JSON only allows ASCII `"`. */
function normalizeFilterJsonQuotes(raw: string): string {
  return raw
    .replace(/\u201C/g, '"')
    .replace(/\u201D/g, '"')
    .replace(/\u201E/g, '"')
    .replace(/\u2033/g, '"')
    .replace(/\uFF02/g, '"');
}

export function parseFilterJson(s: string): { ok: true; filter: Record<string, unknown> } | { ok: false; message: string } {
  const t = normalizeFilterJsonQuotes(s).trim();
  if (!t) return { ok: true, filter: {} };
  try {
    const o = JSON.parse(t);
    if (o !== null && typeof o === 'object' && !Array.isArray(o)) return { ok: true, filter: o as Record<string, unknown> };
    return { ok: false, message: 'Filter must be a JSON object, e.g. {"role":"admin"}' };
  } catch {
    return { ok: false, message: 'Invalid JSON filter' };
  }
}

/** Merge JSON query bar + visual builder clauses with $and. */
/** Short label for a builder clause chip or saved-query preview. */
export function clauseSummary(clause: Record<string, unknown>): string {
  try {
    const s = JSON.stringify(clause);
    return s.length > 48 ? `${s.slice(0, 45)}…` : s;
  } catch {
    return 'filter';
  }
}

export function mergeQueryFilters(
  filterText: string,
  builderClauses: Record<string, unknown>[],
): { ok: true; filter: Record<string, unknown> } | { ok: false; message: string } {
  const jsonParsed = parseFilterJson(filterText);
  if (!jsonParsed.ok) return jsonParsed;
  const parts: Record<string, unknown>[] = [];
  if (Object.keys(jsonParsed.filter).length > 0) parts.push(jsonParsed.filter);
  const cleanClauses = builderClauses.filter((c) => c && typeof c === 'object' && Object.keys(c).length > 0);
  parts.push(...cleanClauses);
  if (parts.length === 0) return { ok: true, filter: {} };
  if (parts.length === 1) return { ok: true, filter: parts[0]! };
  return { ok: true, filter: { $and: parts } };
}

export type FilterOperatorId =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'nin'
  | 'exists'
  | 'regex'
  | 'type';

export const FILTER_OPERATORS: { id: FilterOperatorId; label: string; valueHint: string }[] = [
  { id: 'eq', label: 'Equals', valueHint: 'String, number, true/false, or JSON' },
  { id: 'ne', label: 'Not equals', valueHint: 'Same as equals' },
  { id: 'gt', label: 'Greater than', valueHint: 'Number or comparable value' },
  { id: 'gte', label: 'Greater or equal', valueHint: 'Number or comparable value' },
  { id: 'lt', label: 'Less than', valueHint: 'Number or comparable value' },
  { id: 'lte', label: 'Less or equal', valueHint: 'Number or comparable value' },
  { id: 'in', label: 'In (array)', valueHint: 'JSON array e.g. ["a","b"] or 1,2,3' },
  { id: 'nin', label: 'Not in (array)', valueHint: 'JSON array or comma-separated' },
  { id: 'exists', label: 'Field exists', valueHint: 'true or false' },
  { id: 'regex', label: 'Matches regex', valueHint: 'Pattern (case-insensitive)' },
  { id: 'type', label: 'BSON type', valueHint: 'string, int, double, bool, date, objectId, …' },
];

function parseScalar(raw: string): unknown {
  const t = raw.trim();
  if (t === '') return '';
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d+\.\d+$/.test(t)) return Number(t);
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return t;
  }
}

function parseArray(raw: string): unknown[] | { error: string } {
  const t = raw.trim();
  if (!t) return { error: 'Enter a JSON array or comma-separated values' };
  try {
    const v = JSON.parse(t);
    if (Array.isArray(v)) return v;
  } catch {
    /* fall through */
  }
  const parts = t.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { error: 'No values' };
  return parts.map((p) => parseScalar(p) as unknown);
}

/** One clause to be combined with $and (each is a full filter fragment). */
export function buildFilterClause(
  field: string,
  operator: FilterOperatorId,
  valueRaw: string,
): { ok: true; clause: Record<string, unknown> } | { ok: false; message: string } {
  const f = field.trim();
  if (!f) return { ok: false, message: 'Enter a field name' };

  switch (operator) {
    case 'eq': {
      const v = parseScalar(valueRaw);
      return { ok: true, clause: { [f]: v } };
    }
    case 'ne':
      return { ok: true, clause: { [f]: { $ne: parseScalar(valueRaw) } } };
    case 'gt':
      return { ok: true, clause: { [f]: { $gt: parseScalar(valueRaw) } } };
    case 'gte':
      return { ok: true, clause: { [f]: { $gte: parseScalar(valueRaw) } } };
    case 'lt':
      return { ok: true, clause: { [f]: { $lt: parseScalar(valueRaw) } } };
    case 'lte':
      return { ok: true, clause: { [f]: { $lte: parseScalar(valueRaw) } } };
    case 'in': {
      const arr = parseArray(valueRaw);
      if (!Array.isArray(arr)) return { ok: false, message: arr.error };
      return { ok: true, clause: { [f]: { $in: arr } } };
    }
    case 'nin': {
      const arr = parseArray(valueRaw);
      if (!Array.isArray(arr)) return { ok: false, message: arr.error };
      return { ok: true, clause: { [f]: { $nin: arr } } };
    }
    case 'exists': {
      const t = valueRaw.trim().toLowerCase();
      if (t !== 'true' && t !== 'false') {
        return { ok: false, message: 'Use true or false' };
      }
      return { ok: true, clause: { [f]: { $exists: t === 'true' } } };
    }
    case 'regex': {
      const pat = valueRaw.trim();
      if (!pat) return { ok: false, message: 'Enter a regex pattern' };
      return { ok: true, clause: { [f]: { $regex: pat, $options: 'i' } } };
    }
    case 'type': {
      const typ = valueRaw.trim().toLowerCase();
      if (!typ) return { ok: false, message: 'Enter a BSON type name' };
      return { ok: true, clause: { [f]: { $type: typ } } };
    }
    default:
      return { ok: false, message: 'Unknown operator' };
  }
}
