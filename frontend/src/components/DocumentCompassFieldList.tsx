import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThemeColors } from '../theme/colors';
import {
  bsonTypeLabel,
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
        const typeLabel = bsonTypeLabel(row.value, row.pathSegment);

        const fieldLabel = (
          <Text style={[styles.fieldName, { color: colors.text }]} selectable={false} numberOfLines={1}>
            {row.label}
            <Text style={{ color: colors.syntaxPunctuation }}>:</Text>
          </Text>
        );

        const typeChip =
          !expandable && typeLabel !== 'Mixed' ? (
            <View style={[styles.typeChip, { backgroundColor: colors.inputSurface, borderColor: colors.border }]}>
              <Text style={[styles.typeChipText, { color: colors.textMuted, fontFamily: monoFontFamily }]}>
                {typeLabel}
              </Text>
            </View>
          ) : null;

        const valueBlock = expandable ? (
          <Text
            style={[mono, { color: colorForBsonKind(row.kind, colors), flex: 1, minWidth: 0 }]}
            selectable={false}
          >
            {row.text}
          </Text>
        ) : (
          <Text style={[mono, { color: colorForBsonKind(row.kind, colors), flex: 1, minWidth: 0 }]} selectable>
            {row.text}
          </Text>
        );

        const valueSlot = (
          <View style={styles.valueSlot}>
            {valueBlock}
            {typeChip}
          </View>
        );

        const rowInner = expandable ? (
          <Pressable
            onPress={() => onTogglePath(rowPath)}
            style={({ pressed }) => [
              styles.rowMain,
              embedded && styles.rowEmbedded,
              { borderBottomColor: colors.border, opacity: pressed ? 0.75 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ expanded: isOpen }}
          >
            <Text style={[styles.caret, { color: colors.textMuted }]} selectable={false}>
              {isOpen ? '▾' : '▸'}
            </Text>
            {fieldLabel}
            {valueSlot}
          </Pressable>
        ) : (
          <View
            style={[styles.rowMain, embedded && styles.rowEmbedded, { borderBottomColor: colors.border }]}
          >
            <Text style={[styles.caret, { color: 'transparent' }]} selectable={false}>
              ▸
            </Text>
            {fieldLabel}
            {valueSlot}
          </View>
        );

        return (
          <View key={row.reactKey}>
            {rowInner}
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

/** Compass-style vertical field list: caret, key, type chip, value; nested arrays/objects indented. */
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
  rowMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingRight: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowEmbedded: {
    paddingVertical: 6,
  },
  caret: {
    width: 18,
    fontSize: 11,
    lineHeight: 20,
    paddingTop: 1,
    textAlign: 'center',
  },
  fieldName: {
    fontSize: 14,
    fontWeight: '700',
    minWidth: 56,
    maxWidth: '40%',
    flexShrink: 1,
    paddingTop: 1,
  },
  typeChip: {
    alignSelf: 'flex-start',
    marginTop: 1,
    marginLeft: 8,
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeChipText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'none',
  },
  valueSlot: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  nested: {
    marginLeft: 10,
    paddingLeft: 10,
    borderLeftWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
});
