import * as Haptics from 'expo-haptics';
import { Plus } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ThemeColors } from '../theme/colors';
import {
  compactObjectIdFieldDisplayFromText,
  inferFieldValueKind,
  parseEditableString,
  shouldExpandCompactValue,
  sortedDocumentKeys,
  uniqueNestedObjectKey,
  valueToEditableString,
} from '../utils/documentEditValue';

type Props = {
  value: unknown;
  onChange: (next: unknown) => void;
  readOnly?: boolean;
  colors: ThemeColors;
  monoFontFamily: string;
  /** Indent nested rows (px per depth level). */
  depth?: number;
};

function scalarDisplayText(v: unknown, readOnly: boolean): string {
  const raw = valueToEditableString(v);
  if (readOnly) {
    return compactObjectIdFieldDisplayFromText(raw) ?? raw;
  }
  return raw;
}

function ObjectPropertyRow({
  objKey,
  objValue,
  siblingKeys,
  onRename,
  onValueChange,
  readOnly,
  colors,
  monoFontFamily,
  depth,
}: {
  objKey: string;
  objValue: unknown;
  siblingKeys: string[];
  onRename: (oldKey: string, newKey: string) => void;
  onValueChange: (key: string, next: unknown) => void;
  readOnly: boolean;
  colors: ThemeColors;
  monoFontFamily: string;
  depth: number;
}) {
  const [draftKey, setDraftKey] = useState(objKey);
  useEffect(() => {
    setDraftKey(objKey);
  }, [objKey]);

  const commitKey = useCallback(() => {
    if (readOnly) return;
    const t = draftKey.trim();
    if (t === objKey) return;
    if (!t) {
      setDraftKey(objKey);
      return;
    }
    if (t !== objKey && siblingKeys.includes(t)) {
      setDraftKey(objKey);
      return;
    }
    onRename(objKey, t);
  }, [readOnly, draftKey, objKey, onRename, siblingKeys]);

  return (
    <View style={[styles.objectRow, { paddingLeft: Math.min(depth, 6) * 10 }]}>
      <TextInput
        value={draftKey}
        onChangeText={readOnly ? undefined : setDraftKey}
        onBlur={commitKey}
        onSubmitEditing={commitKey}
        editable={!readOnly}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Field name"
        placeholderTextColor={colors.textMuted}
        style={[
          styles.objectKeyInput,
          compassFieldShell(colors),
          {
            color: colors.syntaxJsonKey,
            fontFamily: monoFontFamily,
          },
        ]}
      />
      <Text style={[styles.colon, { color: colors.syntaxPunctuation }]}>:</Text>
      <View style={styles.objectValueWrap}>
        <CompactValueEditor
          value={objValue}
          onChange={(nv) => onValueChange(objKey, nv)}
          readOnly={readOnly}
          colors={colors}
          monoFontFamily={monoFontFamily}
          depth={depth + 1}
        />
      </View>
    </View>
  );
}

/** Visible field chrome so web/native inputs read like Compass cells, not body text. */
function AddNestedRowButton({
  label,
  onPress,
  colors,
  monoFontFamily,
  indent,
}: {
  label: string;
  onPress: () => void;
  colors: ThemeColors;
  monoFontFamily: string;
  indent: number;
}) {
  return (
    <View style={[styles.addRowOuter, { paddingLeft: indent }]}>
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        style={({ pressed }) => [
          styles.addRowBtn,
          {
            borderColor: colors.border,
            backgroundColor: colors.inputSurface,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Plus size={16} color={colors.primary} strokeWidth={2.5} />
        <Text
          style={[styles.addRowLabel, { color: colors.primary, fontFamily: monoFontFamily }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

function compassFieldShell(colors: ThemeColors) {
  return {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.inputSurface,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none' } as const)
      : ({} as Record<string, unknown>)),
  };
}

export function CompactValueEditor({
  value,
  onChange,
  readOnly = false,
  colors,
  monoFontFamily,
  depth = 0,
}: Props) {
  if (readOnly || !shouldExpandCompactValue(value)) {
    const text = scalarDisplayText(value, readOnly);
    const editAsString = inferFieldValueKind(value) === 'string';
    return (
      <TextInput
        value={text}
        editable={!readOnly}
        onChangeText={(t) => {
          try {
            onChange(parseEditableString(t, editAsString ? { asString: true } : undefined));
          } catch {
            /* keep previous — parseEditableString rarely throws */
          }
        }}
        multiline
        scrollEnabled={false}
        textAlignVertical="top"
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.scalarInput,
          compassFieldShell(colors),
          {
            color: readOnly ? colors.textMuted : colors.text,
            fontFamily: monoFontFamily,
          },
        ]}
      />
    );
  }

  if (Array.isArray(value)) {
    const arr = value;
    const rowPad = Math.min(depth, 6) * 8;
    if (arr.length === 0) {
      return (
        <View style={[styles.emptyWithActions, { paddingLeft: rowPad }]}>
          <View style={[styles.emptyArrayBox, compassFieldShell(colors)]}>
            <Text style={[styles.emptyHint, { color: colors.textMuted, fontFamily: monoFontFamily }]}>
              Empty array
            </Text>
          </View>
          {!readOnly ? (
            <AddNestedRowButton
              label="Add item"
              colors={colors}
              monoFontFamily={monoFontFamily}
              indent={0}
              onPress={() => onChange([''])}
            />
          ) : null}
        </View>
      );
    }
    const arrayBody = (
      <View style={styles.nestedBlock}>
        {arr.map((item, i) => (
          <View
            key={i}
            style={[
              styles.arrayRow,
              {
                paddingLeft: rowPad,
                borderLeftColor: colors.border,
              },
            ]}
          >
            <Text
              style={[styles.arrayIndex, { color: colors.textMuted, fontFamily: monoFontFamily }]}
              accessibilityLabel={`Index ${i}`}
            >
              [{i}]
            </Text>
            <View style={styles.arrayValueWrap}>
              <CompactValueEditor
                value={item}
                readOnly={readOnly}
                onChange={(nv) => {
                  const next = [...arr];
                  next[i] = nv;
                  onChange(next);
                }}
                colors={colors}
                monoFontFamily={monoFontFamily}
                depth={depth + 1}
              />
            </View>
          </View>
        ))}
        {!readOnly ? (
          <AddNestedRowButton
            label="Add item"
            colors={colors}
            monoFontFamily={monoFontFamily}
            indent={rowPad}
            onPress={() => onChange([...arr, ''])}
          />
        ) : null}
      </View>
    );
    return arrayBody;
  }

  const obj = value as Record<string, unknown>;
  const keys = sortedDocumentKeys(obj);
  const objectIndent = Math.min(depth, 6) * 10;

  if (keys.length === 0) {
    return (
      <View style={[styles.emptyWithActions, { paddingLeft: objectIndent }]}>
        <View style={[styles.emptyArrayBox, compassFieldShell(colors)]}>
          <Text style={[styles.emptyHint, { color: colors.textMuted, fontFamily: monoFontFamily }]}>
            Empty object
          </Text>
        </View>
        {!readOnly ? (
          <AddNestedRowButton
            label="Add field"
            colors={colors}
            monoFontFamily={monoFontFamily}
            indent={0}
            onPress={() => {
              const nk = uniqueNestedObjectKey([]);
              onChange({ [nk]: '' });
            }}
          />
        ) : null}
      </View>
    );
  }

  const renameKey = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    const next: Record<string, unknown> = { ...obj };
    const v = next[oldKey];
    delete next[oldKey];
    next[newKey] = v;
    onChange(next);
  };

  const changeSubValue = (key: string, nextVal: unknown) => {
    onChange({ ...obj, [key]: nextVal });
  };

  const objectBody = (
    <View style={styles.nestedBlock}>
      {keys.map((k) => (
        <ObjectPropertyRow
          key={k}
          objKey={k}
          objValue={obj[k]}
          siblingKeys={keys.filter((x) => x !== k)}
          onRename={renameKey}
          onValueChange={changeSubValue}
          readOnly={readOnly}
          colors={colors}
          monoFontFamily={monoFontFamily}
          depth={depth}
        />
      ))}
      {!readOnly ? (
        <AddNestedRowButton
          label="Add field"
          colors={colors}
          monoFontFamily={monoFontFamily}
          indent={objectIndent}
          onPress={() => {
            const nk = uniqueNestedObjectKey(keys);
            onChange({ ...obj, [nk]: '' });
          }}
        />
      ) : null}
    </View>
  );
  return objectBody;
}

const styles = StyleSheet.create({
  scalarInput: {
    alignSelf: 'stretch',
    width: '100%',
    fontSize: 13,
    lineHeight: 20,
    minHeight: 44,
  },
  nestedBlock: {
    alignSelf: 'stretch',
    gap: 12,
    alignItems: 'flex-start',
  },
  arrayRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    gap: 10,
    borderLeftWidth: 2,
    paddingLeft: 10,
    marginLeft: 0,
  },
  arrayIndex: {
    fontSize: 12,
    fontWeight: '700',
    width: 44,
    minWidth: 44,
    paddingTop: 12,
    textAlign: 'right',
  },
  arrayValueWrap: {
    minWidth: 160,
    maxWidth: 720,
    flexShrink: 1,
    alignSelf: 'stretch',
  },
  objectRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flexWrap: 'nowrap',
    alignSelf: 'flex-start',
    paddingBottom: 4,
  },
  objectKeyInput: {
    width: 168,
    minWidth: 120,
    maxWidth: 220,
    flexShrink: 0,
    fontSize: 13,
    minHeight: 44,
  },
  colon: {
    fontSize: 14,
    fontWeight: '700',
    paddingTop: 12,
    flexShrink: 0,
  },
  objectValueWrap: {
    minWidth: 160,
    maxWidth: 720,
    flexShrink: 1,
    alignSelf: 'stretch',
  },
  emptyArrayBox: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  emptyWithActions: {
    alignSelf: 'flex-start',
    gap: 10,
  },
  emptyHint: {
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  addRowOuter: {
    alignSelf: 'flex-start',
    minWidth: 200,
  },
  addRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 0,
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addRowLabel: {
    flex: 1,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
  },
});
