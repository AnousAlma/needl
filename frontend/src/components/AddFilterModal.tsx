import * as Haptics from 'expo-haptics';
import { ChevronDown } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  FILTER_OPERATORS,
  type FilterOperatorId,
  buildFilterClause,
} from '../utils/queryFilterBuilder';
import type { Theme } from '../theme/ThemeProvider';

type Props = {
  visible: boolean;
  onClose: () => void;
  onApply: (clause: Record<string, unknown>) => void;
  theme: Theme;
};

export function AddFilterModal({ visible, onClose, onApply, theme }: Props) {
  const { colors, typography: typo, monoFontFamily } = theme;
  const [field, setField] = useState('');
  const [operator, setOperator] = useState<FilterOperatorId>('eq');
  const [valueRaw, setValueRaw] = useState('');
  const [operatorMenuOpen, setOperatorMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opLabel = FILTER_OPERATORS.find((o) => o.id === operator)?.label ?? operator;
  const valueHint = FILTER_OPERATORS.find((o) => o.id === operator)?.valueHint ?? '';

  const reset = useCallback(() => {
    setField('');
    setOperator('eq');
    setValueRaw('');
    setOperatorMenuOpen(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    void Haptics.selectionAsync();
    reset();
    onClose();
  }, [onClose, reset]);

  const handleApply = useCallback(() => {
    setError(null);
    const r = buildFilterClause(field, operator, valueRaw);
    if (!r.ok) {
      setError(r.message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onApply(r.clause);
    reset();
    onClose();
  }, [field, operator, valueRaw, onApply, onClose, reset]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <SafeAreaView
          edges={['bottom']}
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[typo.subtitle, { color: colors.text, marginBottom: 16 }]}>Add filter</Text>

          <Text style={[styles.label, { color: colors.textMuted }]}>Field</Text>
          <TextInput
            value={field}
            onChangeText={setField}
            placeholder="e.g. role, age, _id"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.inputSurface,
                fontFamily: monoFontFamily,
              },
            ]}
          />

          <Text style={[styles.label, { color: colors.textMuted, marginTop: 14 }]}>Operator</Text>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setOperatorMenuOpen((o) => !o);
            }}
            style={[
              styles.operatorTrigger,
              { borderColor: colors.border, backgroundColor: colors.inputSurface },
            ]}
          >
            <Text style={[typo.body, { color: colors.text, flex: 1 }]}>{opLabel}</Text>
            <ChevronDown size={20} color={colors.textMuted} />
          </Pressable>
          {operatorMenuOpen ? (
            <ScrollView
              style={[styles.operatorList, { borderColor: colors.border, backgroundColor: colors.background }]}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {FILTER_OPERATORS.map((o) => (
                <Pressable
                  key={o.id}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setOperator(o.id);
                    setOperatorMenuOpen(false);
                  }}
                  style={[
                    styles.operatorRow,
                    {
                      backgroundColor: operator === o.id ? colors.inputSurface : 'transparent',
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[typo.body, { color: colors.text }]}>{o.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <Text style={[styles.label, { color: colors.textMuted, marginTop: 14 }]}>Value</Text>
          <TextInput
            value={valueRaw}
            onChangeText={setValueRaw}
            placeholder={valueHint}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            multiline={operator === 'in' || operator === 'nin'}
            style={[
              styles.input,
              styles.valueInput,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.inputSurface,
                fontFamily: monoFontFamily,
              },
            ]}
          />
          <Text style={[typo.caption, { color: colors.textMuted, marginTop: 4 }]}>{valueHint}</Text>

          {error ? (
            <Text style={[typo.caption, { color: colors.danger, marginTop: 10 }]}>{error}</Text>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => [
                styles.btnOutline,
                { borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[typo.subtitle, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleApply}
              style={({ pressed }) => [
                styles.btnPrimary,
                { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
              ]}
            >
              <Text style={[typo.subtitle, { color: '#0A0A0A', fontWeight: '700' }]}>Apply filter</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
  },
  valueInput: {
    minHeight: 44,
    maxHeight: 120,
    textAlignVertical: 'top',
  },
  operatorTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  operatorList: {
    maxHeight: 200,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  operatorRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  btnOutline: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
});
