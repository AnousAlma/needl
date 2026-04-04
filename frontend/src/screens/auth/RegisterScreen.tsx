import { useHeaderHeight } from '@react-navigation/elements';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import type { AuthStackParamList } from '../../types/authNavigation';
import { useTheme } from '../../theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Register'>;

export function RegisterScreen() {
  const { colors, typography: typo } = useTheme();
  const navigation = useNavigation<Nav>();
  const headerHeight = useHeaderHeight();
  const { signUp, configured } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    if (!configured) {
      Alert.alert(
        'Sign-in unavailable',
        'This build is not configured for accounts. Use an official release or contact the app provider.',
      );
      return;
    }
    if (!email.trim() || password.length < 6) {
      Alert.alert('Create account', 'Enter email and a password (at least 6 characters).');
      return;
    }
    setBusy(true);
    try {
      await signUp(email, password);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Sign up failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [configured, email, password, signUp]);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>
          <Text style={[styles.title, { color: colors.text }]}>Create account</Text>
          <Text style={[typo.body, styles.tagline, { color: colors.textMuted }]}>
            Choose an email and password for your Needl account (password at least 6 characters).
          </Text>

          <Text style={[typo.caption, { color: colors.text, fontWeight: '600', marginBottom: 8 }]}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          />

          <Text style={[typo.caption, { color: colors.text, fontWeight: '600', marginTop: 16, marginBottom: 8 }]}>
            Password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          />

          <Pressable
            onPress={() => void submit()}
            disabled={busy}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: colors.primary,
                opacity: busy ? 0.6 : pressed ? 0.9 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#001E2B" />
            ) : (
              <Text style={[typo.subtitle, { color: '#001E2B' }]}>Create account</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              navigation.goBack();
            }}
            style={styles.link}
          >
            <Text style={[typo.body, { color: colors.secondary }]}>Already have an account? Sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  inner: { width: '100%', maxWidth: 400, alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  tagline: { marginBottom: 24, textAlign: 'center', lineHeight: 22 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  primaryBtn: {
    marginTop: 28,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  link: { marginTop: 20, alignItems: 'center' },
});
