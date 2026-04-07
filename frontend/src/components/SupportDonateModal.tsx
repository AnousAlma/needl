import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Heart, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createDonationCheckoutSession, fetchDonateServerStatus } from '../api/donateApi';
import type { DonateServerStatus } from '../api/donateApi';
import { DriverApiError, driverApiBaseUrl, isDriverBackendConfigured } from '../api/driverApi';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';

const DONATE_PRESETS_CAD = [3, 5, 10] as const;

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function SupportDonateModal({ visible, onClose }: Props) {
  const { colors, typography: typo, monoFontFamily } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [donateStatus, setDonateStatus] = useState<DonateServerStatus | 'loading'>('loading');
  const [customCad, setCustomCad] = useState('');
  const [donateOpening, setDonateOpening] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (!isDriverBackendConfigured()) {
      setDonateStatus({ kind: 'no_driver_url' });
      return;
    }
    let cancelled = false;
    setDonateStatus('loading');
    void (async () => {
      const s = await fetchDonateServerStatus();
      if (!cancelled) setDonateStatus(s);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const startDonate = useCallback(
    async (amountCents: number) => {
      if (!user) {
        Alert.alert('Sign in required', 'Sign in to donate.');
        return;
      }
      if (amountCents < 50) {
        Alert.alert('Amount too small', 'Minimum donation is $0.50 CAD.');
        return;
      }
      WebBrowser.maybeCompleteAuthSession();
      setDonateOpening(true);
      try {
        const token = await user.getIdToken();
        const successUrl = Linking.createURL('donate/success');
        const cancelUrl = Linking.createURL('donate/cancel');
        const checkoutUrl = await createDonationCheckoutSession(token, {
          amountCents,
          successUrl,
          cancelUrl,
        });
        if (Platform.OS === 'web') {
          if (typeof window !== 'undefined') {
            window.location.assign(checkoutUrl);
          } else {
            await Linking.openURL(checkoutUrl);
          }
        } else {
          const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, successUrl);
          if (result.type === 'success') {
            Alert.alert('Thank you', 'Your support helps keep Needl going.');
          }
        }
      } catch (e) {
        const msg =
          e instanceof DriverApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong';
        Alert.alert('Donation', msg);
      } finally {
        setDonateOpening(false);
      }
    },
    [user],
  );

  const donateFromCustomInput = useCallback(() => {
    const n = parseFloat(customCad.replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Amount', 'Enter a valid amount in CAD.');
      return;
    }
    const cents = Math.round(n * 100);
    void startDonate(cents);
  }, [customCad, startDonate]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <View style={[styles.modalRoot, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: Math.max(insets.top, 12) }]}>
          <Text style={[typo.subtitle, { color: colors.text, fontSize: 18, fontWeight: '700' }]}>Support Needl</Text>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              onClose();
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
          >
            <X size={26} color={colors.text} strokeWidth={2.2} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[typo.body, { color: colors.textMuted, marginBottom: 20 }]}>
            Needl is a personal project. If you found it useful, and would like to support the development, you can donate below!
          </Text>

          {isDriverBackendConfigured() ? (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardTitleRow}>
                <Heart size={22} color={colors.primary} style={styles.cardTitleIcon} />
                <View style={styles.cardTitleTextCol}>
                  <Text style={[typo.subtitle, { color: colors.text }]}>Donate</Text>
                  <Text style={[typo.caption, { color: colors.textMuted }]}>
                    Enjoying Needl? Help support the development of Needl!
                  </Text>
                </View>
              </View>
              {donateStatus === 'loading' ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
              ) : donateStatus.kind === 'stripe_enabled' ? (
                <>
                  <Text style={[typo.caption, { color: colors.textMuted, marginBottom: 10 }]}>
                    Amounts are Canadian dollars. Stripe charges in CAD.
                  </Text>
                  <View style={styles.pillRow}>
                    {DONATE_PRESETS_CAD.map((cad) => (
                      <Pressable
                        key={cad}
                        disabled={donateOpening}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          void startDonate(cad * 100);
                        }}
                        style={[
                          styles.pill,
                          {
                            borderColor: colors.primary,
                            opacity: donateOpening ? 0.5 : 1,
                          },
                        ]}
                      >
                        <Text style={[typo.subtitle, { color: colors.primary }]}>${cad}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.donateCustomRow}>
                    <TextInput
                      value={customCad}
                      onChangeText={setCustomCad}
                      placeholder="Other amount (CAD)"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      editable={!donateOpening}
                      style={[
                        styles.donateCustomInput,
                        {
                          color: colors.text,
                          borderColor: colors.border,
                          backgroundColor: colors.inputSurface,
                          fontFamily: monoFontFamily,
                        },
                      ]}
                    />
                    <Pressable
                      disabled={donateOpening}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        donateFromCustomInput();
                      }}
                      style={({ pressed }) => [
                        styles.donateCustomGo,
                        {
                          borderColor: colors.primary,
                          backgroundColor: pressed ? colors.inputSurface : 'transparent',
                          opacity: donateOpening ? 0.5 : 1,
                        },
                      ]}
                    >
                      <Text style={[typo.subtitle, { color: colors.primary }]}>Go</Text>
                    </Pressable>
                  </View>
                  {donateOpening ? (
                    <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
                  ) : null}
                </>
              ) : donateStatus.kind === 'stripe_disabled' ? (
                <Text style={[typo.caption, { color: colors.textMuted }]}>
                  Donations are off until the API has a Stripe key. In{' '}
                  <Text style={{ fontFamily: monoFontFamily }}>backend/.env</Text> add{' '}
                  <Text style={{ fontFamily: monoFontFamily }}>STRIPE_SECRET_KEY=sk_test_...</Text> and optionally{' '}
                  <Text style={{ fontFamily: monoFontFamily }}>STRIPE_DONATE_CURRENCY=cad</Text> (default). Save
                  and restart the backend (`npm run dev`), then open this sheet again.
                </Text>
              ) : (
                <Text style={[typo.caption, { color: colors.textMuted }]}>
                  Could not reach the Needl API at{' '}
                  <Text style={{ fontFamily: monoFontFamily }}>{driverApiBaseUrl()}</Text>. Start the backend, check{' '}
                  <Text style={{ fontFamily: monoFontFamily }}>EXPO_PUBLIC_DRIVER_API_URL</Text> in{' '}
                  <Text style={{ fontFamily: monoFontFamily }}>frontend/.env</Text> (iOS Simulator:{' '}
                  <Text style={{ fontFamily: monoFontFamily }}>http://127.0.0.1:3001</Text>; physical device: your
                  computer&apos;s LAN IP, not localhost), then try again.
                </Text>
              )}
            </View>
          ) : (
            <Text style={[typo.caption, { color: colors.textMuted }]}>
              Set <Text style={{ fontFamily: monoFontFamily }}>EXPO_PUBLIC_DRIVER_API_URL</Text> in{' '}
              <Text style={{ fontFamily: monoFontFamily }}>frontend/.env</Text> so the app can reach your Needl API
              for donations.
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 16,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  cardTitleIcon: {
    marginTop: 2,
  },
  cardTitleTextCol: {
    flex: 1,
    minWidth: 0,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  pill: {
    minWidth: 52,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
  },
  donateCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  donateCustomInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
  },
  donateCustomGo: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 2,
  },
});
