import {
  FIELD_KIND_OPTIONS,
  type FieldValueKind,
} from '../utils/documentEditValue';
import { useTheme } from '../theme/ThemeProvider';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Props = {
  visible: boolean;
  mode: 'add' | 'type';
  fieldKey?: string;
  /** When changing type, pre-select tab from parsed value */
  suggestedKind?: FieldValueKind;
  onClose: () => void;
  /** add: name + kind; type: kind only */
  onConfirm: (kind: FieldValueKind, name?: string) => void;
};

export function DocumentFieldKindModal({
  visible,
  mode,
  fieldKey,
  suggestedKind,
  onClose,
  onConfirm,
}: Props) {
  const { colors, typography: typo, monoFontFamily } = useTheme();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FieldValueKind>('string');

  useEffect(() => {
    if (visible && mode === 'add') {
      setName('');
      setKind('string');
    }
    if (visible && mode === 'type') {
      setKind(suggestedKind ?? 'string');
    }
  }, [visible, mode, suggestedKind]);

  const submit = () => {
    if (mode === 'add') {
      onConfirm(kind, name.trim());
    } else {
      onConfirm(kind);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetCenter}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
          pointerEvents="box-none"
        >
          <View
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            pointerEvents="auto"
          >
            <Text style={[typo.subtitle, { color: colors.text, marginBottom: 12 }]}>
              {mode === 'add' ? 'Add field' : `Type · ${fieldKey ?? ''}`}
            </Text>
            {mode === 'add' ? (
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="fieldName"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.nameInput,
                  {
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: colors.inputSurface,
                    fontFamily: monoFontFamily,
                  },
                ]}
              />
            ) : null}
            <Text style={[typo.caption, { color: colors.textMuted, marginBottom: 8 }]}>Value type</Text>
            <View style={styles.kindGrid}>
              {FIELD_KIND_OPTIONS.map((opt) => {
                const on = kind === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => setKind(opt.id)}
                    style={[
                      styles.kindPill,
                      {
                        borderColor: on ? colors.primary : colors.border,
                        backgroundColor: on ? colors.inputSurface : 'transparent',
                      },
                    ]}
                  >
                    <Text style={[typo.caption, { color: on ? colors.primary : colors.text, fontWeight: on ? '700' : '500' }]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.actions}>
              <Pressable onPress={onClose} style={[styles.btn, styles.btnSecondary, { borderColor: colors.border }]}>
                <Text style={[typo.subtitle, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                style={[styles.btn, styles.btnPrimary, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              >
                <Text style={[typo.subtitle, { color: '#0A0A0A', fontWeight: '700' }]} numberOfLines={1}>
                  {mode === 'add' ? 'Add' : 'Apply type'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  /** Centers sheet; box-none so taps outside pass through to dismiss Pressable */
  sheetCenter: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    maxWidth: 440,
    alignSelf: 'center',
  },
  sheet: {
    width: '100%',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  nameInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  kindGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
    marginHorizontal: -4,
  },
  kindPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    margin: 4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
    marginTop: 4,
    flexWrap: 'nowrap',
  },
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnSecondary: {
    flexShrink: 0,
  },
  btnPrimary: {
    marginLeft: 12,
    flexShrink: 0,
  },
});
