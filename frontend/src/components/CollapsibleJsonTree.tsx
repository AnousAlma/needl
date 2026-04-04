import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThemeColors } from '../theme/colors';
import {
  colorForBsonKind,
  formatBsonFieldLine,
  isBsonExtendedScalarObject,
  type BsonColorKind,
} from '../utils/bsonDisplay';
import type { JsonSyntaxColorOverrides } from '../utils/jsonSyntax';

const INDENT = 14;
const FONT = 13;
const LH = 20;

function pathKey(segments: string[]): string {
  return JSON.stringify(segments);
}

function sortFieldKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    if (a === '_id') return -1;
    if (b === '_id') return 1;
    return a.localeCompare(b);
  });
}

function explorerColorForBson(
  kind: BsonColorKind,
  colors: ThemeColors,
  overrides?: JsonSyntaxColorOverrides,
): string {
  if (overrides) {
    switch (kind) {
      case 'objectId':
        return colors.syntaxObjectId;
      case 'string':
        return overrides.valueString ?? colors.syntaxJsonStringValue;
      case 'number':
        return overrides.number ?? colors.syntaxJsonNumber;
      case 'boolean':
        return overrides.bool ?? colors.syntaxJsonKeyword;
      case 'null':
        return overrides.null ?? colors.syntaxJsonNull;
      case 'date':
        return overrides.bool ?? colors.syntaxJsonKeyword;
      default:
        return overrides.other ?? colors.syntaxJsonPunct;
    }
  }
  return colorForBsonKind(kind, colors);
}

function punctColor(colors: ThemeColors, overrides?: JsonSyntaxColorOverrides): string {
  return overrides?.punct ?? colors.syntaxJsonPunct;
}

function keyColor(colors: ThemeColors, overrides?: JsonSyntaxColorOverrides): string {
  return overrides?.keyString ?? colors.syntaxJsonKey;
}

type TreeProps = {
  colors: ThemeColors;
  monoFontFamily: string;
  colorOverrides?: JsonSyntaxColorOverrides;
  expanded: Set<string>;
  toggle: (id: string) => void;
};

function monoBase(monoFontFamily: string) {
  return { fontFamily: monoFontFamily, fontSize: FONT, lineHeight: LH };
}

function PrimitiveLine({
  value,
  fieldKey,
  colors,
  monoFontFamily,
  colorOverrides,
}: {
  value: unknown;
  fieldKey?: string;
  colors: ThemeColors;
  monoFontFamily: string;
  colorOverrides?: JsonSyntaxColorOverrides;
}) {
  const { text, kind } = formatBsonFieldLine(value, fieldKey);
  const c = explorerColorForBson(kind, colors, colorOverrides);
  return (
    <Text style={[monoBase(monoFontFamily), { color: c }]} selectable>
      {text}
    </Text>
  );
}

function CollapsedSummary({
  label,
  pathIdStr,
  toggle,
  colors,
  monoFontFamily,
  colorOverrides,
}: {
  label: string;
  pathIdStr: string;
  toggle: (id: string) => void;
  colors: ThemeColors;
  monoFontFamily: string;
  colorOverrides?: JsonSyntaxColorOverrides;
}) {
  const pc = punctColor(colors, colorOverrides);
  return (
    <Pressable onPress={() => toggle(pathIdStr)} hitSlop={10} accessibilityRole="button">
      <Text style={[monoBase(monoFontFamily), { color: pc }]} selectable={false}>
        {label}
      </Text>
    </Pressable>
  );
}

function JsonObjectBlock({
  o,
  segments,
  depth,
  isRoot,
  tree,
}: {
  o: Record<string, unknown>;
  segments: string[];
  depth: number;
  isRoot: boolean;
  tree: TreeProps;
}) {
  const id = pathKey(segments);
  const expanded = tree.expanded.has(id);
  const pad = depth * INDENT;
  const keys = sortFieldKeys(Object.keys(o));
  const pc = punctColor(tree.colors, tree.colorOverrides);
  const kc = keyColor(tree.colors, tree.colorOverrides);
  const base = monoBase(tree.monoFontFamily);

  if (!isRoot && !expanded) {
    return (
      <View style={{ paddingLeft: pad }}>
        <CollapsedSummary
          label="{...}"
          pathIdStr={id}
          toggle={tree.toggle}
          colors={tree.colors}
          monoFontFamily={tree.monoFontFamily}
          colorOverrides={tree.colorOverrides}
        />
      </View>
    );
  }

  return (
    <View style={{ paddingLeft: pad }}>
      {!isRoot ? (
        <Pressable onPress={() => tree.toggle(id)} hitSlop={6} accessibilityRole="button">
          <Text style={[base, { color: pc }]}>{'{'}</Text>
        </Pressable>
      ) : (
        <Text style={[base, { color: pc }]}>{'{'}</Text>
      )}
      {keys.map((k) => (
        <View key={k} style={styles.kvBlock}>
          <View style={{ paddingLeft: INDENT }}>
            <Text style={base} selectable>
              <Text style={[base, { color: kc }]}>{JSON.stringify(k)}</Text>
              <Text style={[base, { color: pc }]}>:</Text>
            </Text>
            <View style={styles.valueIndent}>
              <JsonValueNode value={o[k]} segments={[...segments, k]} depth={depth + 1} isRoot={false} tree={tree} />
            </View>
          </View>
        </View>
      ))}
      <Text style={[base, { color: pc }]}>{'}'}</Text>
    </View>
  );
}

function JsonArrayBlock({
  arr,
  segments,
  depth,
  isRoot,
  tree,
}: {
  arr: unknown[];
  segments: string[];
  depth: number;
  isRoot: boolean;
  tree: TreeProps;
}) {
  const id = pathKey(segments);
  const expanded = tree.expanded.has(id);
  const pad = depth * INDENT;
  const pc = punctColor(tree.colors, tree.colorOverrides);
  const base = monoBase(tree.monoFontFamily);
  const summary = `Array (${arr.length})`;

  if (!isRoot && !expanded) {
    return (
      <View style={{ paddingLeft: pad }}>
        <CollapsedSummary
          label={summary}
          pathIdStr={id}
          toggle={tree.toggle}
          colors={tree.colors}
          monoFontFamily={tree.monoFontFamily}
          colorOverrides={tree.colorOverrides}
        />
      </View>
    );
  }

  return (
    <View style={{ paddingLeft: pad }}>
      {!isRoot ? (
        <Pressable onPress={() => tree.toggle(id)} hitSlop={6} accessibilityRole="button">
          <Text style={[base, { color: pc }]}>{'['}</Text>
        </Pressable>
      ) : (
        <Text style={[base, { color: pc }]}>{'['}</Text>
      )}
      {arr.map((item, i) => (
        <View key={i} style={{ paddingLeft: INDENT }}>
          <JsonValueNode
            value={item}
            segments={[...segments, String(i)]}
            depth={depth + 1}
            isRoot={false}
            tree={tree}
          />
          {i < arr.length - 1 ? <Text style={[base, { color: pc }]}>,</Text> : null}
        </View>
      ))}
      <Text style={[base, { color: pc }]}>{']'}</Text>
    </View>
  );
}

function JsonValueNode({
  value,
  segments,
  depth,
  isRoot,
  tree,
}: {
  value: unknown;
  segments: string[];
  depth: number;
  isRoot: boolean;
  tree: TreeProps;
}) {
  if (value === null || value === undefined) {
    return (
      <PrimitiveLine
        value={value}
        colors={tree.colors}
        monoFontFamily={tree.monoFontFamily}
        colorOverrides={tree.colorOverrides}
      />
    );
  }
  if (Array.isArray(value)) {
    return <JsonArrayBlock arr={value} segments={segments} depth={depth} isRoot={isRoot} tree={tree} />;
  }
  if (typeof value === 'object') {
    if (isBsonExtendedScalarObject(value)) {
      return (
        <PrimitiveLine
          value={value}
          fieldKey={segments[segments.length - 1]}
          colors={tree.colors}
          monoFontFamily={tree.monoFontFamily}
          colorOverrides={tree.colorOverrides}
        />
      );
    }
    return (
      <JsonObjectBlock
        o={value as Record<string, unknown>}
        segments={segments}
        depth={depth}
        isRoot={isRoot}
        tree={tree}
      />
    );
  }
  return (
    <PrimitiveLine
      value={value}
      fieldKey={segments[segments.length - 1]}
      colors={tree.colors}
      monoFontFamily={tree.monoFontFamily}
      colorOverrides={tree.colorOverrides}
    />
  );
}

/**
 * Pretty JSON with nested objects/arrays collapsed to `{...}` / `Array (n)`; tap to expand/collapse.
 * Root document is always expanded one level (keys visible).
 */
export function CollapsibleJsonTree({
  value,
  colors,
  monoFontFamily,
  colorOverrides,
}: {
  value: unknown;
  colors: ThemeColors;
  monoFontFamily: string;
  colorOverrides?: JsonSyntaxColorOverrides;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const tree: TreeProps = { colors, monoFontFamily, colorOverrides, expanded, toggle };

  return (
    <View style={styles.root}>
      <JsonValueNode value={value} segments={[]} depth={0} isRoot tree={tree} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
  },
  kvBlock: {
    marginTop: 2,
  },
  valueIndent: {
    paddingLeft: INDENT,
    marginTop: 2,
  },
});
