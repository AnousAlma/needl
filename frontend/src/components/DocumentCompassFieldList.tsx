import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThemeColors } from '../theme/colors';
import {
  colorForBsonKind,
  fieldSummaryIsExpandable,
  formatBsonFieldLine,
} from '../utils/bsonDisplay';

function pathKey(segments: string[]): string {
  return JSON.stringify(segments);
}

function DocumentCompassFieldListInner({
  doc,
  colors,
  monoFontFamily,
  embedded,
  pathSegments,
  expandedPaths,
  onTogglePath,
}: {
  doc: unknown;
  colors: ThemeColors;
  monoFontFamily: string;
  embedded?: boolean;
  pathSegments: string[];
  expandedPaths: Set<string>;
  onTogglePath: (id: string) => void;
}) {
  const rows = useMemo(() => {
    if (Array.isArray(doc)) {
      return doc.map((item, i) => {
        const { text, kind } = formatBsonFieldLine(item);
        const seg = String(i);
        return { reactKey: `i${i}`, pathSegment: seg, label: seg, text, kind, value: item };
      });
    }
    if (!doc || typeof doc !== 'object') {
      const { text, kind } = formatBsonFieldLine(doc);
      return [
        { reactKey: 'value', pathSegment: 'value', label: 'Document', text, kind, value: doc as unknown },
      ];
    }
    const o = doc as Record<string, unknown>;
    const keys = Object.keys(o).sort((a, b) => {
      if (a === '_id') return -1;
      if (b === '_id') return 1;
      return a.localeCompare(b);
    });
    return keys.map((key) => {
      const value = o[key];
      const { text, kind } = formatBsonFieldLine(value, key);
      return { reactKey: key, pathSegment: key, label: key, text, kind, value };
    });
  }, [doc]);

  const mono = { fontFamily: monoFontFamily, fontSize: 13, lineHeight: 20 };

  return (
    <View style={styles.wrap}>
      {rows.map((row) => {
        const rowPath = pathKey([...pathSegments, row.pathSegment]);
        const expandable = fieldSummaryIsExpandable(row.text, row.value);
        const isOpen = expandedPaths.has(rowPath);

        return (
          <View key={row.reactKey}>
            <View
              style={[styles.row, embedded && styles.rowEmbedded, { borderBottomColor: colors.border }]}
            >
              <Text style={[styles.fieldName, { color: colors.text }]} selectable>
                {row.label}
                <Text style={{ color: colors.syntaxPunctuation }}>:</Text>
              </Text>
              {expandable ? (
                <Pressable
                  onPress={() => onTogglePath(rowPath)}
                  hitSlop={6}
                  style={styles.valuePressable}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                >
                  <Text
                    style={[mono, { color: colorForBsonKind(row.kind, colors), flex: 1 }]}
                    selectable={false}
                  >
                    {isOpen ? '▾ ' : ''}
                    {row.text}
                  </Text>
                </Pressable>
              ) : (
                <Text
                  style={[mono, { color: colorForBsonKind(row.kind, colors), flex: 1 }]}
                  selectable
                >
                  {row.text}
                </Text>
              )}
            </View>
            {expandable && isOpen && row.value !== null && typeof row.value === 'object' ? (
              <View style={[styles.nested, { borderLeftColor: colors.border }]}>
                <DocumentCompassFieldListInner
                  doc={row.value}
                  colors={colors}
                  monoFontFamily={monoFontFamily}
                  embedded
                  pathSegments={[...pathSegments, row.pathSegment]}
                  expandedPaths={expandedPaths}
                  onTogglePath={onTogglePath}
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/** Compass-style vertical field list (one row per key, like MongoDB “List” document view). */
export function DocumentCompassFieldList({
  doc,
  colors,
  monoFontFamily,
  embedded,
}: {
  doc: unknown;
  colors: ThemeColors;
  monoFontFamily: string;
  embedded?: boolean;
}) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const onTogglePath = useCallback((id: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <DocumentCompassFieldListInner
      doc={doc}
      colors={colors}
      monoFontFamily={monoFontFamily}
      embedded={embedded}
      pathSegments={[]}
      expandedPaths={expandedPaths}
      onTogglePath={onTogglePath}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowEmbedded: {
    paddingVertical: 6,
  },
  fieldName: {
    fontSize: 14,
    fontWeight: '700',
    minWidth: 88,
    paddingTop: 1,
  },
  valuePressable: {
    flex: 1,
    minWidth: 0,
  },
  nested: {
    marginLeft: 8,
    paddingLeft: 8,
    borderLeftWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
});
