import { StackActions } from '@react-navigation/native';
import type { RootStackScreenProps } from '../types/navigation';
import { verifyDataApiAccess } from '../api/atlasDataApi';
import {
  atlasUi,
  CONNECTION_COLOR_OPTIONS,
  type ConnectionColorTag,
  colorHexForTag,
} from '../theme/atlasConnectionUi';
import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronRight, Info, SlidersHorizontal } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useConnectionStore } from '../store/connectionStore';
import { useTheme } from '../theme/ThemeProvider';
import {
  defaultNameFromMongoUri,
  looksLikeMongoUri,
  normalizePastedUri,
} from '../utils/mongoUri';

type Props = RootStackScreenProps<'AddConnection'>;

const URI_PLACEHOLDER = 'mongodb+srv://username:password@cluster0.mongodb.net/test';
const DOCS_CONNECTION_STRING =
  'https://www.mongodb.com/docs/manual/reference/connection-string/';
const DOCS_DATA_API =
  'https://www.mongodb.com/docs/atlas/app-services/data-api/generated-endpoints/';

export function AddConnectionScreen({ navigation }: Props) {
  const { colors, scheme, typography: typo, monoFontFamily } = useTheme();
  const addSavedConnection = useConnectionStore((s) => s.addSavedConnection);
  const addCompassUriConnection = useConnectionStore((s) => s.addCompassUriConnection);

  const [uri, setUri] = useState('');
  const [editConnectionString, setEditConnectionString] = useState(true);
  const [name, setName] = useState('');
  const [colorTag, setColorTag] = useState<ConnectionColorTag>('none');
  const [colorModal, setColorModal] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [appId, setAppId] = useState('');
  const [dataSource, setDataSource] = useState('mongodb-atlas');
  const [regionHost, setRegionHost] = useState('');
  const [defaultDatabase, setDefaultDatabase] = useState('');
  const [listingAnchorCollection, setListingAnchorCollection] = useState('');
  const [apiKey, setApiKey] = useState('');

  const [verifying, setVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isDark = scheme === 'dark';
  const fieldBorder = isDark ? atlasUi.fieldBorderDark : atlasUi.fieldBorderLight;
  const helpBg = isDark ? atlasUi.helpCardBgDark : atlasUi.helpCardBgLight;
  const helpBorder = isDark ? atlasUi.helpCardBorderDark : atlasUi.helpCardBorderLight;
  const panelBg = colors.surface;
  /** Dark mode: muted Atlas hex (#004D37) reads as “disabled” on #1E1E1E; use app primary for contrast. */
  const actionAccent = isDark ? colors.primary : atlasUi.actionGreen;
  const actionFill = colors.primary;

  const canSaveFull =
    appId.trim().length > 0 && dataSource.trim().length > 0 && apiKey.trim().length > 0;

  const canQuickUri = looksLikeMongoUri(uri);
  /** Enough to save: full Data API fields, or a valid Mongo URI (Compass-style). */
  const canUseFooter = canSaveFull || canQuickUri;

  const canVerify =
    appId.trim().length > 0 &&
    dataSource.trim().length > 0 &&
    apiKey.trim().length > 0 &&
    defaultDatabase.trim().length > 0 &&
    listingAnchorCollection.trim().length > 0;

  const colorLabel = useMemo(() => {
    return CONNECTION_COLOR_OPTIONS.find((c) => c.tag === colorTag)?.label ?? 'No color';
  }, [colorTag]);

  const buildPayload = useCallback(() => {
    const resolvedName =
      name.trim() ||
      (looksLikeMongoUri(uri) ? defaultNameFromMongoUri(uri) : '') ||
      'MongoDB connection';
    return {
      name: resolvedName,
      appId: appId.trim(),
      dataSource: dataSource.trim() || 'mongodb-atlas',
      regionHost: regionHost.trim() || undefined,
      defaultDatabase: defaultDatabase.trim() || undefined,
      listingAnchorCollection: listingAnchorCollection.trim() || undefined,
      atlasUri: normalizePastedUri(uri) || undefined,
      favorite,
      colorTag,
    };
  }, [
    name,
    appId,
    dataSource,
    regionHost,
    defaultDatabase,
    listingAnchorCollection,
    uri,
    favorite,
    colorTag,
  ]);

  const verify = useCallback(async () => {
    if (!canVerify) return;
    setVerifyMessage(null);
    setVerifying(true);
    try {
      const conn = {
        id: 'verify',
        name: 'verify',
        createdAt: 0,
        appId: appId.trim(),
        dataSource: dataSource.trim() || 'mongodb-atlas',
        regionHost: regionHost.trim() || undefined,
      };
      await verifyDataApiAccess(
        conn,
        apiKey.trim(),
        defaultDatabase.trim(),
        listingAnchorCollection.trim(),
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVerifyMessage('Connection verified.');
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setVerifyMessage(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  }, [canVerify, appId, dataSource, regionHost, apiKey, defaultDatabase, listingAnchorCollection]);

  const persistFull = useCallback(async () => {
    if (!canSaveFull) return null;
    setSaving(true);
    try {
      return await addSavedConnection(buildPayload(), apiKey.trim());
    } finally {
      setSaving(false);
    }
  }, [canSaveFull, addSavedConnection, buildPayload, apiKey]);

  const persistCompassUri = useCallback(async () => {
    if (!canQuickUri) return null;
    setSaving(true);
    try {
      const cleaned = normalizePastedUri(uri);
      const displayName = name.trim() || defaultNameFromMongoUri(cleaned);
      return await addCompassUriConnection({
        name: displayName,
        uri: cleaned,
        favorite,
        colorTag,
      });
    } finally {
      setSaving(false);
    }
  }, [canQuickUri, name, uri, favorite, colorTag, addCompassUriConnection]);

  const openDatabasesFor = useCallback(
    (r: { id: string; name: string }) => {
      Keyboard.dismiss();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.dispatch(
        StackActions.replace('Databases', {
          connectionId: r.id,
          connectionName: r.name,
        }),
      );
    },
    [navigation],
  );

  const onSave = useCallback(async () => {
    if (!canUseFooter) {
      Alert.alert(
        'Almost there',
        'Paste a mongodb:// or mongodb+srv:// URI from Atlas, or open Advanced Connection Options and add App ID, data source, and Data API key.',
      );
      return;
    }
    try {
      if (canSaveFull) {
        const r = await persistFull();
        if (r) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          navigation.goBack();
        } else {
          Alert.alert('Save failed', 'Please check Advanced fields and try again.');
        }
        return;
      }
      const r = await persistCompassUri();
      if (r) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        navigation.goBack();
      } else {
        Alert.alert('Save failed', 'URI did not look like mongodb:// or mongodb+srv://.');
      }
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    }
  }, [canUseFooter, canSaveFull, persistFull, persistCompassUri, navigation]);

  const onConnect = useCallback(async () => {
    if (!canUseFooter) {
      Alert.alert(
        'Almost there',
        'Paste a mongodb:// or mongodb+srv:// URI from Atlas (Database → Connect → Drivers), or complete Advanced (App ID + API key).',
      );
      return;
    }
    try {
      if (canSaveFull) {
        const r = await persistFull();
        if (r) {
          openDatabasesFor(r);
        } else {
          Alert.alert('Connect failed', 'Please check Advanced fields and try again.');
        }
        return;
      }
      const r = await persistCompassUri();
      if (r) {
        openDatabasesFor(r);
      } else {
        Alert.alert('Connect failed', 'URI did not look like mongodb:// or mongodb+srv://.');
      }
    } catch (e) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Could not connect', e instanceof Error ? e.message : String(e));
    }
  }, [canUseFooter, canSaveFull, persistFull, persistCompassUri, openDatabasesFor]);

  const onCancel = useCallback(() => {
    void Haptics.selectionAsync();
    navigation.goBack();
  }, [navigation]);

  const uriInfo = useCallback(() => {
    Alert.alert(
      'Connection string',
      'Needl stores this string on device for your reference (same as Atlas / Compass).\n\nActual queries use the MongoDB Atlas Data API — configure App ID and API key under Advanced Connection Options.',
      [{ text: 'OK' }],
    );
  }, []);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.flex}>
      <ScrollView
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[styles.scroll, { paddingBottom: 220 }]}
        style={styles.flex}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.panel, { backgroundColor: panelBg, borderColor: fieldBorder }]}>
          <View style={styles.uriHeader}>
            <View style={styles.uriLabelRow}>
              <Text style={[styles.label, { color: colors.text }]}>Connection URI</Text>
              <Pressable onPress={uriInfo} hitSlop={10} accessibilityLabel="URI info">
                <Info size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={styles.toggleRow}>
              <Text style={[styles.toggleLabel, { color: colors.textMuted }]}>
                Edit connection string
              </Text>
              <Switch
                value={editConnectionString}
                onValueChange={setEditConnectionString}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>

          <TextInput
            value={uri}
            onChangeText={setUri}
            editable={editConnectionString}
            secureTextEntry={!editConnectionString}
            placeholder={URI_PLACEHOLDER}
            placeholderTextColor={colors.textMuted}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.uriInput,
              {
                fontFamily: monoFontFamily,
                color: colors.text,
                borderColor: fieldBorder,
                backgroundColor: colors.inputSurface,
              },
            ]}
          />
          <Text style={[typo.caption, { color: colors.textMuted, marginBottom: 14 }]}>
            Paste your connection string from MongoDB Atlas or your local environment.
          </Text>

          <View style={styles.nameColorRow}>
            <View style={styles.nameCol}>
              <Text style={[styles.label, { color: colors.text, marginBottom: 6 }]}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="My cluster"
                placeholderTextColor={colors.textMuted}
                style={[
                  styles.input,
                  { color: colors.text, borderColor: fieldBorder, backgroundColor: isDark ? colors.background : '#FAFAFA' },
                ]}
              />
            </View>
            <View style={styles.colorCol}>
              <Text style={[styles.label, { color: colors.text, marginBottom: 6 }]}>Color</Text>
              <Pressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  setColorModal(true);
                }}
                style={[
                  styles.colorTrigger,
                  { borderColor: fieldBorder, backgroundColor: isDark ? colors.background : '#FAFAFA' },
                ]}
              >
                <View style={styles.colorTriggerInner}>
                  {colorHexForTag(colorTag) ? (
                    <View style={[styles.colorSwatch, { backgroundColor: colorHexForTag(colorTag)! }]} />
                  ) : null}
                  <Text style={[typo.body, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                    {colorLabel}
                  </Text>
                  <ChevronDown size={18} color={colors.textMuted} />
                </View>
              </Pressable>
            </View>
          </View>

          <View style={styles.favoriteBlock}>
            <View style={styles.favoriteRow}>
              <Switch
                value={favorite}
                onValueChange={setFavorite}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
              <Text style={[typo.subtitle, { color: colors.text, marginLeft: 10 }]}>
                Favorite this connection
              </Text>
            </View>
            <Text style={[typo.caption, { color: colors.textMuted, marginLeft: 48, marginTop: 4 }]}>
              Favoriting pins this connection to the top of your list.
            </Text>
          </View>

          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setAdvancedOpen((o) => !o);
            }}
            style={styles.advancedHeader}
          >
            <SlidersHorizontal size={20} color={actionAccent} />
            <Text style={[styles.advancedTitle, { color: actionAccent, flex: 1 }]}>Advanced Settings</Text>
            {advancedOpen ? (
              <ChevronDown size={18} color={actionAccent} />
            ) : (
              <ChevronRight size={18} color={actionAccent} />
            )}
          </Pressable>

          {advancedOpen ? (
            <View style={styles.advancedBody}>
              <Text style={[typo.caption, { color: colors.textMuted, marginBottom: 12 }]}>
                Required for Needl on mobile: Atlas Data API (HTTPS). Matches your App Services app linked to
                this cluster.
              </Text>

              <FieldLabel text="App ID" colors={colors} />
              <TextInput
                value={appId}
                onChangeText={setAppId}
                placeholder="myapp-abcde"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={[
                  styles.input,
                  { fontFamily: monoFontFamily, color: colors.text, borderColor: fieldBorder, backgroundColor: isDark ? colors.background : '#FAFAFA' },
                ]}
              />

              <FieldLabel text="Data source name" colors={colors} />
              <TextInput
                value={dataSource}
                onChangeText={setDataSource}
                placeholder="mongodb-atlas"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={[
                  styles.input,
                  { fontFamily: monoFontFamily, color: colors.text, borderColor: fieldBorder, backgroundColor: isDark ? colors.background : '#FAFAFA' },
                ]}
              />

              <FieldLabel text="Regional Data API host (optional)" colors={colors} />
              <TextInput
                value={regionHost}
                onChangeText={setRegionHost}
                placeholder="us-east-1.aws.data.mongodb.com"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={[
                  styles.input,
                  { fontFamily: monoFontFamily, color: colors.text, borderColor: fieldBorder, backgroundColor: isDark ? colors.background : '#FAFAFA' },
                ]}
              />

              <FieldLabel text="Default database (optional)" colors={colors} />
              <TextInput
                value={defaultDatabase}
                onChangeText={setDefaultDatabase}
                placeholder="sample_mflix"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={[
                  styles.input,
                  { fontFamily: monoFontFamily, color: colors.text, borderColor: fieldBorder, backgroundColor: isDark ? colors.background : '#FAFAFA' },
                ]}
              />

              <FieldLabel text="Listing anchor collection" colors={colors} />
              <Text style={[typo.caption, { color: colors.textMuted, marginBottom: 6 }]}>
                Any existing collection in each database you open (for $listCollections).
              </Text>
              <TextInput
                value={listingAnchorCollection}
                onChangeText={setListingAnchorCollection}
                placeholder="movies"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={[
                  styles.input,
                  { fontFamily: monoFontFamily, color: colors.text, borderColor: fieldBorder, backgroundColor: isDark ? colors.background : '#FAFAFA' },
                ]}
              />

              <FieldLabel text="Data API key" colors={colors} />
              <TextInput
                value={apiKey}
                onChangeText={setApiKey}
                placeholder="Stored in Secure Store"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
                style={[
                  styles.input,
                  { fontFamily: monoFontFamily, color: colors.text, borderColor: fieldBorder, backgroundColor: isDark ? colors.background : '#FAFAFA' },
                ]}
              />

              <Pressable
                onPress={() => {
                  if (!canVerify || verifying) return;
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  void verify();
                }}
                disabled={!canVerify || verifying}
                style={({ pressed }) => [
                  styles.verifyBtn,
                  { borderColor: actionAccent, opacity: pressed && canVerify ? 0.88 : 1 },
                ]}
              >
                {verifying ? (
                  <ActivityIndicator color={actionAccent} />
                ) : (
                  <Text style={[typo.subtitle, { color: actionAccent }]}>Verify access</Text>
                )}
              </Pressable>
              {verifyMessage ? (
                <Text style={[typo.caption, { color: colors.textMuted, marginTop: 8 }]}>{verifyMessage}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <HelpCard
          title="How do I find my connection string in Atlas?"
          body="Database → Connect → Drivers — copy the URI. Needl saves it on this device. To query collections on your phone, add Data API settings under Advanced."
          linkLabel="See connection string docs"
          url={DOCS_CONNECTION_STRING}
          bg={helpBg}
          border={helpBorder}
          textColor={colors.text}
          mutedColor={colors.textMuted}
          linkColor={actionAccent}
        />
        {/* <HelpCard
          title="How do I format my connection string?"
          body="Use mongodb:// or mongodb+srv:// with host, options, and default database path as in Atlas examples."
          linkLabel="See examples"
          url={DOCS_CONNECTION_STRING}
          bg={helpBg}
          border={helpBorder}
          textColor={colors.text}
          mutedColor={colors.textMuted}
          linkColor={actionAccent}
        />
        <HelpCard
          title="Data API on mobile"
          body="Enable HTTPS Data API on your App Services app and create an API key. The App ID and data source name must match that app."
          linkLabel="Data API overview"
          url={DOCS_DATA_API}
          bg={helpBg}
          border={helpBorder}
          textColor={colors.text}
          mutedColor={colors.textMuted}
          linkColor={actionAccent}
        /> */}

      </ScrollView>

      <View style={styles.footerWrap} pointerEvents="box-none">
        <SafeAreaView edges={['bottom']} style={[styles.footer, { borderTopColor: fieldBorder, backgroundColor: panelBg }]}>
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => [
              styles.cancelBtn,
              { borderColor: fieldBorder, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[typo.subtitle, { color: colors.text }]}>Cancel</Text>
          </Pressable>

          <View style={styles.footerRow}>
            <FooterOutline
              label="Save"
              onPress={() => void onSave()}
              disabled={saving}
              accentColor={actionAccent}
              typo={typo}
              flex
            />
            <FooterOutline
              label="Connect"
              onPress={() => void onConnect()}
              disabled={saving}
              accentColor={actionAccent}
              typo={typo}
              flex
            />
          </View>
          <Pressable
            onPress={() => void onConnect()}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveConnectBtn,
              {
                backgroundColor: actionFill,
                opacity: pressed && !saving ? 0.92 : saving ? 0.6 : 1,
              },
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#0A0A0A" />
            ) : (
              <Text style={[typo.subtitle, { color: '#0A0A0A', fontWeight: '700' }]}>Save &amp; Connect</Text>
            )}
          </Pressable>
        </SafeAreaView>
      </View>
      </View>

      <Modal visible={colorModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setColorModal(false)} />
          <View style={[styles.modalSheet, { backgroundColor: panelBg, borderColor: fieldBorder }]}>
            <Text style={[typo.subtitle, { color: colors.text, marginBottom: 12 }]}>Color</Text>
            {CONNECTION_COLOR_OPTIONS.map((opt) => (
              <Pressable
                key={opt.tag}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setColorTag(opt.tag);
                  setColorModal(false);
                }}
                style={({ pressed }) => [
                  styles.modalRow,
                  { opacity: pressed ? 0.8 : 1, backgroundColor: opt.tag === colorTag ? colors.background : 'transparent' },
                ]}
              >
                {opt.hex ? <View style={[styles.colorSwatch, { backgroundColor: opt.hex }]} /> : <View style={styles.colorSwatchEmpty} />}
                <Text style={[typo.body, { color: colors.text }]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function FieldLabel({ text, colors }: { text: string; colors: { text: string } }) {
  return (
    <Text style={[styles.label, { color: colors.text, marginTop: 14, marginBottom: 6 }]}>{text}</Text>
  );
}

function HelpCard({
  title,
  body,
  linkLabel,
  url,
  bg,
  border,
  textColor,
  mutedColor,
  linkColor,
}: {
  title: string;
  body: string;
  linkLabel: string;
  url: string;
  bg: string;
  border: string;
  textColor: string;
  mutedColor: string;
  linkColor: string;
}) {
  return (
    <View style={[styles.helpCard, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.helpTitle, { color: textColor }]}>{title}</Text>
      <Text style={[styles.helpBody, { color: mutedColor }]}>{body}</Text>
      <Pressable
        onPress={() => {
          void Linking.openURL(url);
        }}
        style={styles.helpLinkRow}
      >
        <Text style={[styles.helpLink, { color: linkColor }]}>{linkLabel}</Text>
        <Text style={{ color: linkColor, fontSize: 12 }}> ↗</Text>
      </Pressable>
    </View>
  );
}

function FooterOutline({
  label,
  onPress,
  disabled,
  accentColor,
  typo,
  flex,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  accentColor: string;
  typo: { subtitle: { fontSize: number; fontWeight: '600' } };
  flex?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.outlineBtn,
        {
          borderColor: accentColor,
          opacity: disabled ? 0.55 : pressed ? 0.88 : 1,
          flex: flex ? 1 : undefined,
        },
      ]}
    >
      <Text style={[typo.subtitle, { color: accentColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 16,
  },
  panel: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 16,
  },
  uriHeader: { marginBottom: 10 },
  uriLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: { fontSize: 13, flex: 1, marginRight: 12 },
  uriInput: {
    minHeight: 88,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  nameColorRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  nameCol: { flex: 1.2 },
  colorCol: { flex: 1 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
  },
  colorTrigger: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 46,
    justifyContent: 'center',
  },
  colorTriggerInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colorSwatch: { width: 16, height: 16, borderRadius: 8 },
  colorSwatchEmpty: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: '#9CA3AF' },
  favoriteBlock: { marginTop: 12, marginBottom: 8 },
  favoriteRow: { flexDirection: 'row', alignItems: 'center' },
  advancedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    marginTop: 4,
  },
  advancedTitle: { fontSize: 15, fontWeight: '600' },
  advancedBody: { paddingBottom: 8 },
  verifyBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
  },
  helpCard: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 12,
  },
  helpTitle: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  helpBody: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  helpLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  helpLink: { fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  footerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    elevation: 100,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  cancelBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footerRow: { flexDirection: 'row', gap: 10 },
  outlineBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
  },
  saveConnectBtn: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalSheet: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    maxHeight: '70%',
    zIndex: 1,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
});
