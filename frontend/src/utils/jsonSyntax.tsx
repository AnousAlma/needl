import React, { useMemo } from 'react';
import { Text } from 'react-native';
import type { ThemeColors } from '../theme/colors';

/** Token kinds for Compass-style JSON (keys vs value strings differ). */
type JsonDisplayKind =
  | 'keyString'
  | 'valueString'
  | 'number'
  | 'bool'
  | 'null'
  | 'punct'
  | 'space'
  | 'other';

type Frame = { kind: 'object'; expect: 'key' | 'colon' | 'value' } | { kind: 'array'; expect: 'value' };

function readString(s: string, start: number): { value: string; end: number } {
  let j = start + 1;
  while (j < s.length) {
    const ch = s[j]!;
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === '"') {
      j++;
      break;
    }
    j++;
  }
  return { value: s.slice(start, j), end: j };
}

/**
 * Tokenize JSON with property keys colored separately (MongoDB Compass / Atlas style).
 */
function* iterateCompassJsonTokens(s: string): Generator<{ value: string; kind: JsonDisplayKind }> {
  const stack: Frame[] = [];
  let i = 0;

  const top = () => stack[stack.length - 1];

  while (i < s.length) {
    const c = s[i]!;

    if (c === '\n' || c === ' ' || c === '\r' || c === '\t') {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j]!)) j++;
      yield { value: s.slice(i, j), kind: 'space' };
      i = j;
      continue;
    }

    if (c === '"') {
      const { value, end } = readString(s, i);
      const t = top();
      if (t?.kind === 'object' && t.expect === 'key') {
        yield { value, kind: 'keyString' };
        t.expect = 'colon';
      } else {
        yield { value, kind: 'valueString' };
        if (t?.kind === 'object' && t.expect === 'value') {
          t.expect = 'key';
        }
      }
      i = end;
      continue;
    }

    if (c === '{') {
      yield { value: c, kind: 'punct' };
      stack.push({ kind: 'object', expect: 'key' });
      i++;
      continue;
    }

    if (c === '}') {
      stack.pop();
      yield { value: c, kind: 'punct' };
      i++;
      continue;
    }

    if (c === '[') {
      yield { value: c, kind: 'punct' };
      stack.push({ kind: 'array', expect: 'value' });
      i++;
      continue;
    }

    if (c === ']') {
      stack.pop();
      yield { value: c, kind: 'punct' };
      i++;
      continue;
    }

    if (c === ':') {
      yield { value: c, kind: 'punct' };
      const o = top();
      if (o?.kind === 'object' && o.expect === 'colon') {
        o.expect = 'value';
      }
      i++;
      continue;
    }

    if (c === ',') {
      yield { value: c, kind: 'punct' };
      const t = top();
      if (t?.kind === 'object') {
        t.expect = 'key';
      }
      i++;
      continue;
    }

    if (s.startsWith('true', i)) {
      yield { value: 'true', kind: 'bool' };
      const t = top();
      if (t?.kind === 'object' && t.expect === 'value') t.expect = 'key';
      i += 4;
      continue;
    }
    if (s.startsWith('false', i)) {
      yield { value: 'false', kind: 'bool' };
      const t = top();
      if (t?.kind === 'object' && t.expect === 'value') t.expect = 'key';
      i += 5;
      continue;
    }
    if (s.startsWith('null', i)) {
      yield { value: 'null', kind: 'null' };
      const t = top();
      if (t?.kind === 'object' && t.expect === 'value') t.expect = 'key';
      i += 4;
      continue;
    }

    if (/[-0-9]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9.eE+-]/.test(s[j]!)) j++;
      yield { value: s.slice(i, j), kind: 'number' };
      const t = top();
      if (t?.kind === 'object' && t.expect === 'value') t.expect = 'key';
      i = j;
      continue;
    }

    yield { value: c, kind: 'other' };
    i++;
  }
}

/** Fallback when document doesn’t start with `{` / `[` (no key/value distinction). */
function* iteratePlainJsonTokens(s: string): Generator<{ value: string; kind: JsonDisplayKind }> {
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === '\n' || c === ' ' || c === '\r' || c === '\t') {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j]!)) j++;
      yield { value: s.slice(i, j), kind: 'space' };
      i = j;
      continue;
    }
    if (c === '"') {
      const { value, end } = readString(s, i);
      yield { value, kind: 'valueString' };
      i = end;
      continue;
    }
    if (/[{}[\],:]/.test(c)) {
      yield { value: c, kind: 'punct' };
      i++;
      continue;
    }
    if (s.startsWith('true', i)) {
      yield { value: 'true', kind: 'bool' };
      i += 4;
      continue;
    }
    if (s.startsWith('false', i)) {
      yield { value: 'false', kind: 'bool' };
      i += 5;
      continue;
    }
    if (s.startsWith('null', i)) {
      yield { value: 'null', kind: 'null' };
      i += 4;
      continue;
    }
    if (/[-0-9]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9.eE+-]/.test(s[j]!)) j++;
      yield { value: s.slice(i, j), kind: 'number' };
      i = j;
      continue;
    }
    yield { value: c, kind: 'other' };
    i++;
  }
}

function pickTokenizer(s: string) {
  const t = s.trimStart();
  if (t.startsWith('{') || t.startsWith('[')) return iterateCompassJsonTokens(s);
  return iteratePlainJsonTokens(s);
}

export type JsonSyntaxColorOverrides = Partial<{
  keyString: string;
  valueString: string;
  number: string;
  bool: string;
  null: string;
  punct: string;
  space: string;
  other: string;
}>;

function colorForJsonKind(kind: JsonDisplayKind, colors: ThemeColors, overrides?: JsonSyntaxColorOverrides): string {
  if (overrides) {
    switch (kind) {
      case 'keyString':
        return overrides.keyString ?? colors.syntaxJsonKey;
      case 'valueString':
        return overrides.valueString ?? colors.syntaxJsonStringValue;
      case 'number':
        return overrides.number ?? colors.syntaxJsonNumber;
      case 'bool':
        return overrides.bool ?? colors.syntaxJsonKeyword;
      case 'null':
        return overrides.null ?? colors.syntaxJsonNull;
      case 'punct':
        return overrides.punct ?? colors.syntaxJsonPunct;
      case 'space':
        return overrides.space ?? colors.syntaxJsonPunct;
      default:
        return overrides.other ?? colors.text;
    }
  }
  switch (kind) {
    case 'keyString':
      return colors.syntaxJsonKey;
    case 'valueString':
      return colors.syntaxJsonStringValue;
    case 'number':
      return colors.syntaxJsonNumber;
    case 'bool':
      return colors.syntaxJsonKeyword;
    case 'null':
      return colors.syntaxJsonNull;
    case 'punct':
      return colors.syntaxJsonPunct;
    case 'space':
      return colors.syntaxJsonPunct;
    default:
      return colors.text;
  }
}

/** Sample JSON for previews (EJSON-style _id). */
export const SAMPLE_JSON_FOR_PREVIEW = `{
  "_id": { "$oid": "65b8f4a2e4b0c1d2e3f4a5b6" },
  "status": "active",
  "count": 42
}`;

/** Pretty-printed JSON with Compass/Atlas-style colors (white keys & punctuation, green strings, warm numbers). */
export function JsonSyntaxText({
  json,
  colors,
  monoFontFamily,
  colorOverrides,
  fontSize = 12,
  lineHeight,
  selectable = true,
}: {
  json: string;
  colors: ThemeColors;
  monoFontFamily: string;
  /** When set, overrides theme syntax colors (e.g. Document Explorer stitch palette). */
  colorOverrides?: JsonSyntaxColorOverrides;
  fontSize?: number;
  lineHeight?: number;
  selectable?: boolean;
}) {
  const lh = lineHeight ?? Math.round(fontSize * 1.45);
  const nodes = useMemo(() => {
    const base = { fontFamily: monoFontFamily, fontSize, lineHeight: lh };
    const out: React.ReactNode[] = [];
    let k = 0;
    for (const { value, kind } of pickTokenizer(json)) {
      out.push(
        <Text key={k++} style={[base, { color: colorForJsonKind(kind, colors, colorOverrides) }]}>
          {value}
        </Text>,
      );
    }
    return out;
  }, [json, colors, monoFontFamily, colorOverrides, fontSize, lh]);

  const base = { fontFamily: monoFontFamily, fontSize, lineHeight: lh };
  return (
    <Text style={base} selectable={selectable}>
      {nodes}
    </Text>
  );
}
