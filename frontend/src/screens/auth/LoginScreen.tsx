import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
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
import { SvgXml } from 'react-native-svg';
import { needlLogoMarkXmlForBackground } from '../../branding/needlLogoMarkXml';
import { useAuth } from '../../contexts/AuthContext';
import type { AuthStackParamList } from '../../types/authNavigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>;

const LOGIN_LOGO_SIZE = 112;

export function LoginScreen() {
  const { colors, typography: typo } = useTheme();
  const navigation = useNavigation<Nav>();
  const { signIn, configured } = useAuth();

  const logoXml = useMemo(() => needlLogoMarkXmlForBackground(colors.background), [colors.background]);

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
    if (!email.trim() || !password) {
      Alert.alert('Sign in', 'Enter email and password.');
      return;
    }
    setBusy(true);
    try {
      await signIn(email, password);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Sign in failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [configured, email, password, signIn]);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.inner}>
            <View style={styles.logoWrap} accessibilityRole="image" accessibilityLabel="Needl">
              <SvgXml xml={logoXml} width={LOGIN_LOGO_SIZE} height={LOGIN_LOGO_SIZE} />
            </View>
            <Text style={[styles.title, { color: colors.secondary }]}>Needl</Text>
            <Text style={[typo.body, styles.tagline, { color: colors.textMuted }]}>
              Sign in to sync your connection list across devices (metadata only; secrets stay on this phone).
            </Text>

            {!configured ? (
              <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
                <Text style={[typo.caption, { color: colors.text, textAlign: 'center' }]}>
                  Sign-in is not available in this build.
                </Text>
              </View>
            ) : null}

            <Text style={[typo.caption, { color: colors.text, fontWeight: '600', marginBottom: 8 }]}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
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
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoComplete="password"
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
                <Text style={[typo.subtitle, { color: '#001E2B' }]}>Sign in</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                navigation.navigate('Register');
              }}
              style={styles.link}
            >
              <Text style={[typo.body, { color: colors.secondary }]}>Create an account</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  inner: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  logoWrap: {
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: { fontSize: 30, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  tagline: { marginBottom: 28, textAlign: 'center', lineHeight: 22 },
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
  banner: {
    borderWidth: 2,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
});
