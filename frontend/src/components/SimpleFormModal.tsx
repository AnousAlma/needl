import { useTheme } from '../theme/ThemeProvider';
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

export type SimpleFormField = { key: string; label: string; placeholder: string };

type Props = {
  visible: boolean;
  title: string;
  fields: SimpleFormField[];
  values: Record<string, string>;
  onChange: (key: string, text: string) => void;
  submitLabel: string;
  onSubmit: () => void;
  onClose: () => void;
};

export function SimpleFormModal({
  visible,
  title,
  fields,
  values,
  onChange,
  submitLabel,
  onSubmit,
  onClose,
}: Props) {
  const { colors, typography: typo, monoFontFamily } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetCenter}
          pointerEvents="box-none"
          keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
        >
          <View
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            pointerEvents="auto"
          >
            <Text style={[typo.subtitle, { color: colors.text, marginBottom: 16 }]}>{title}</Text>
            {fields.map((f) => (
              <View key={f.key} style={{ marginBottom: 14 }}>
                <Text style={[typo.caption, { color: colors.textMuted, marginBottom: 6 }]}>{f.label}</Text>
                <TextInput
                  value={values[f.key] ?? ''}
                  onChangeText={(t) => onChange(f.key, t)}
                  placeholder={f.placeholder}
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
              </View>
            ))}
            <View style={styles.actions}>
              <Pressable onPress={onClose} style={[styles.btn, { borderColor: colors.border }]}>
                <Text style={[typo.subtitle, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onSubmit}
                style={[styles.btn, { backgroundColor: colors.primary, borderColor: colors.primary, marginLeft: 12 }]}
              >
                <Text style={[typo.subtitle, { color: '#0A0A0A', fontWeight: '700' }]}>{submitLabel}</Text>
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
    overflow: 'hidden',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
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
});
