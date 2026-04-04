import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ThemeColors } from '../theme/colors';
import {
  colorForBsonKind,
  columnTypeForKey,
  formatBsonCellText,
  unionDocumentKeys,
} from '../utils/bsonDisplay';

const COL_MIN = 132;
const IDX_W = 36;

/** Compass-style table: header row (name + type), data rows with row index. */
export function DocumentCompassTable({
  documents,
  colors,
  monoFontFamily,
  embedded,
  onRowPress,
}: {
  documents: unknown[];
  colors: ThemeColors;
  monoFontFamily: string;
  /** When nested in Settings card, drop outer horizontal margins. */
  embedded?: boolean;
  onRowPress?: (doc: unknown, rowIndex: number) => void;
}) {
  const keys = useMemo(() => unionDocumentKeys(documents), [documents]);

  const mono = { fontFamily: monoFontFamily, fontSize: 12 };

  const tableMargin = embedded ? styles.tableEmbedded : undefined;
  const emptyMargin = embedded ? styles.emptyEmbedded : undefined;

  if (keys.length === 0) {
    return (
      <View style={[styles.empty, emptyMargin, { borderColor: colors.border }]}>
        <Text style={[mono, { color: colors.textMuted }]}>No fields to display</Text>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={styles.hScroll}>
      <View style={[styles.table, tableMargin]}>
        <View style={[styles.headerRow, { backgroundColor: colors.inputSurface, borderColor: colors.border }]}>
          <View style={[styles.idxHead, { width: IDX_W, borderRightColor: colors.border }]}>
            <Text style={[mono, { color: colors.textMuted }]} />
          </View>
          {keys.map((k) => (
            <View key={k} style={[styles.colHead, { minWidth: COL_MIN, borderRightColor: colors.border }]}>
              <Text style={[mono, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
                {k}
              </Text>
              <Text style={[mono, { color: colors.textMuted, marginTop: 2, fontSize: 11 }]}>
                {columnTypeForKey(k, documents)}
              </Text>
            </View>
          ))}
        </View>

        {documents.map((doc, rowIndex) => {
          const rowInner = (
            <>
              <View style={[styles.idxCell, { width: IDX_W, borderRightColor: colors.border }]}>
                <Text style={[mono, { color: colors.textMuted }]}>{rowIndex + 1}</Text>
              </View>
              {keys.map((k) => {
                const raw =
                  doc && typeof doc === 'object' && !Array.isArray(doc)
                    ? (doc as Record<string, unknown>)[k]
                    : undefined;
                const { text, kind } = formatBsonCellText(raw, 48, k);
                return (
                  <View key={k} style={[styles.cell, { minWidth: COL_MIN, borderRightColor: colors.border }]}>
                    <Text style={[mono, { color: colorForBsonKind(kind, colors) }]} numberOfLines={3}>
                      {text}
                    </Text>
                  </View>
                );
              })}
            </>
          );
          return onRowPress ? (
            <Pressable
              key={docKey(doc, rowIndex)}
              onPress={() => onRowPress(doc, rowIndex)}
              style={({ pressed }) => [
                styles.dataRow,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              {rowInner}
            </Pressable>
          ) : (
            <View
              key={docKey(doc, rowIndex)}
              style={[styles.dataRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
            >
              {rowInner}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function docKey(doc: unknown, index: number): string {
  if (doc && typeof doc === 'object' && '_id' in doc) {
    try {
      return JSON.stringify((doc as { _id: unknown })._id);
    } catch {
      /* fallthrough */
    }
  }
  return `r-${index}`;
}

const styles = StyleSheet.create({
  hScroll: {
    marginHorizontal: 0,
  },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 16,
  },
  empty: {
    marginHorizontal: 16,
    padding: 24,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  emptyEmbedded: {
    marginHorizontal: 0,
    marginBottom: 0,
    padding: 16,
  },
  tableEmbedded: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  idxHead: {
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  colHead: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  idxCell: {
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cell: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
});
