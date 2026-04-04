import * as Haptics from 'expo-haptics';
import { AlignLeft, BookOpen } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { DocumentCompassFieldList } from '../components/DocumentCompassFieldList';
import { DocumentCompassTable } from '../components/DocumentCompassTable';
import { useAuth } from '../contexts/AuthContext';
import {
  useSettingsStore,
  type CustomSortDirection,
  type DocumentSortPreset,
  type DocumentViewMode,
  type PageSizeOption,
} from '../store/settingsStore';
import { useTheme } from '../theme/ThemeProvider';
import { JsonSyntaxText, SAMPLE_JSON_FOR_PREVIEW } from '../utils/jsonSyntax';

const VIEW_PREVIEW_DOCS: Record<string, unknown>[] = [
  {
    _id: { $oid: '65b8f4a2e4b0c1d2e3f4a5b6' },
    status: 'active',
    count: 42,
  },
  {
    _id: { $oid: '65b8f4a2e4b0c1d2e3f4a5b7' },
    status: 'archived',
    count: 12,
  },
];

const VIEW_MODES: { key: DocumentViewMode; label: string; hint: string }[] = [
  { key: 'compact', label: 'Compact', hint: 'Compass field list per document' },
  { key: 'list', label: 'List', hint: 'Compass table: columns and row index' },
  { key: 'json', label: 'JSON', hint: 'Pretty-printed JSON' },
];

const PAGE_SIZES: PageSizeOption[] = [10, 20, 50];

const SORTS: { key: DocumentSortPreset; label: string; hint?: string }[] = [
  { key: 'id_desc', label: '_id (newest first)' },
  {
    key: 'custom_ts',
    label: 'Custom field',
    hint: 'Pick any field name (e.g. updatedAt, createdAt, score)',
  },
];

export function SettingsScreen() {
  const { colors, typography: typo, monoFontFamily } = useTheme();
  const { user, logOut } = useAuth();
  const documentViewMode = useSettingsStore((s) => s.documentViewMode);
  const setDocumentViewMode = useSettingsStore((s) => s.setDocumentViewMode);
  const pageSize = useSettingsStore((s) => s.pageSize);
  const setPageSize = useSettingsStore((s) => s.setPageSize);
  const sortPreset = useSettingsStore((s) => s.sortPreset);
  const setSortPreset = useSettingsStore((s) => s.setSortPreset);
  const customSortField = useSettingsStore((s) => s.customSortField);
  const customSortDirection = useSettingsStore((s) => s.customSortDirection);
  const setCustomSortField = useSettingsStore((s) => s.setCustomSortField);
  const setCustomSortDirection = useSettingsStore((s) => s.setCustomSortDirection);

  const [sortFieldDraft, setSortFieldDraft] = useState(customSortField);

  useEffect(() => {
    if (sortPreset === 'custom_ts') {
      setSortFieldDraft(customSortField);
    }
  }, [sortPreset, customSortField]);

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[typo.caption, { color: colors.textMuted, marginBottom: 4 }]}>Signed in as</Text>
      <Text style={[typo.body, { color: colors.text, marginBottom: 16 }]}>{user?.email ?? '—'}</Text>

      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          Alert.alert('Sign out', 'You will need to sign in again to use Needl.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sign out',
              style: 'destructive',
              onPress: () => {
                void logOut();
              },
            },
          ]);
        }}
        style={({ pressed }) => [
          styles.signOut,
          { borderColor: colors.danger, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[typo.subtitle, { color: colors.danger }]}>Sign out</Text>
      </Pressable>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Display Configuration</Text>
      <Text style={[typo.body, { color: colors.textMuted, marginBottom: 20 }]}>
        Tailor how Needl presents your cluster data and query results.
      </Text>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[typo.subtitle, { color: colors.text, marginBottom: 4 }]}>View mode</Text>
        <View style={styles.segmentRow}>
          {VIEW_MODES.map((m) => {
            const selected = documentViewMode === m.key;
            return (
              <Pressable
                key={m.key}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setDocumentViewMode(m.key);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityHint={m.hint}
                style={[
                  styles.segment,
                  {
                    backgroundColor: selected ? colors.primary : 'transparent',
                    borderColor: selected ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    typo.caption,
                    { fontWeight: '700', color: selected ? '#0A0A0A' : colors.text },
                  ]}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.previewLabel, { color: colors.primary }]}>
          {documentViewMode === 'compact'
            ? 'Compact preview'
            : documentViewMode === 'list'
              ? 'List preview'
              : 'JSON preview'}
        </Text>
        <View style={[styles.previewBox, { backgroundColor: colors.inputSurface, borderColor: colors.border }]}>
          {documentViewMode === 'compact' ? (
            <DocumentCompassFieldList
              doc={VIEW_PREVIEW_DOCS[0]}
              colors={colors}
              monoFontFamily={monoFontFamily}
              embedded
            />
          ) : documentViewMode === 'list' ? (
            <View style={styles.tablePreviewClip}>
              <DocumentCompassTable
                documents={VIEW_PREVIEW_DOCS}
                colors={colors}
                monoFontFamily={monoFontFamily}
                embedded
              />
            </View>
          ) : (
            <JsonSyntaxText
              json={SAMPLE_JSON_FOR_PREVIEW}
              colors={colors}
              monoFontFamily={monoFontFamily}
            />
          )}
        </View>
      </View>

      <View
        style={[styles.card, styles.paginationCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.paginationHeaderRow}>
          <BookOpen size={20} color={colors.primary} style={styles.cardTitleIcon} />
          <Text style={[typo.subtitle, { color: colors.text, flex: 1, minWidth: 0 }]}>Pagination limit</Text>
        </View>
        <View style={styles.paginationDescriptionWrap}>
          <Text style={[typo.caption, { color: colors.textMuted }]}>
            Documents per fetch. More load as you scroll, or tap Load more in table view.
          </Text>
        </View>
        <View style={styles.pillRow}>
          {PAGE_SIZES.map((n) => {
            const selected = pageSize === n;
            return (
              <Pressable
                key={n}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setPageSize(n);
                }}
                style={[
                  styles.pill,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? 'transparent' : 'transparent',
                  },
                ]}
              >
                <Text style={[typo.subtitle, { color: selected ? colors.primary : colors.text }]}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardTitleRow}>
          <AlignLeft size={20} color={colors.primary} style={styles.cardTitleIcon} />
          <View style={styles.cardTitleTextCol}>
            <Text style={[typo.subtitle, { color: colors.text }]}>Default sort</Text>
            <Text style={[typo.caption, { color: colors.textMuted }]}>Order of initial fetch</Text>
          </View>
        </View>
        {SORTS.map((s) => {
          const selected = sortPreset === s.key;
          return (
            <Pressable
              key={s.key}
              onPress={() => {
                void Haptics.selectionAsync();
                setSortPreset(s.key);
              }}
              style={({ pressed }) => [
                styles.sortRow,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  opacity: pressed ? 0.9 : 1,
                },
              ]}
            >
              <View style={styles.sortRowTop}>
                <View style={[styles.radioOuter, { borderColor: selected ? colors.primary : colors.textMuted }]}>
                  {selected ? <View style={[styles.radioInner, { backgroundColor: colors.primary }]} /> : null}
                </View>
                <Text
                  style={[typo.body, { color: selected ? colors.primary : colors.text, flex: 1, minWidth: 0 }]}
                >
                  {s.label}
                </Text>
              </View>
              {s.hint ? (
                <View style={styles.sortRowHintWrap}>
                  <Text style={[typo.caption, { color: colors.textMuted }]}>{s.hint}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        {sortPreset === 'custom_ts' ? (
          <View style={[styles.customSortPanel, { borderColor: colors.border, backgroundColor: colors.inputSurface }]}>
            <Text style={[typo.caption, { color: colors.text, fontWeight: '600', marginBottom: 6 }]}>
              Field name
            </Text>
            <TextInput
              value={sortFieldDraft}
              onChangeText={setSortFieldDraft}
              onBlur={() => {
                void Haptics.selectionAsync();
                setCustomSortField(sortFieldDraft);
              }}
              placeholder="updatedAt"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={[
                styles.sortFieldInput,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  fontFamily: monoFontFamily,
                },
              ]}
            />
            <Text style={[typo.caption, { color: colors.text, fontWeight: '600', marginTop: 14, marginBottom: 8 }]}>
              Order
            </Text>
            <View style={styles.pillRow}>
              {(
                [
                  { dir: 'desc' as const, label: 'Descending' },
                  { dir: 'asc' as const, label: 'Ascending' },
                ] satisfies { dir: CustomSortDirection; label: string }[]
              ).map(({ dir, label }) => {
                const selected = customSortDirection === dir;
                return (
                  <Pressable
                    key={dir}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setCustomSortField(sortFieldDraft);
                      setCustomSortDirection(dir);
                    }}
                    style={[
                      styles.pill,
                      styles.orderPill,
                      {
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[typo.caption, { fontWeight: '700', color: selected ? colors.primary : colors.text }]}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.85}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[typo.caption, { color: colors.textMuted, marginTop: 10 }]}>
              Sorts by <Text style={{ fontFamily: monoFontFamily }}>{customSortField}</Text>
              {customSortDirection === 'desc' ? ' descending' : ' ascending'}. Names starting with{' '}
              <Text style={{ fontFamily: monoFontFamily }}>$</Text> fall back to{' '}
              <Text style={{ fontFamily: monoFontFamily }}>updatedAt</Text>.
            </Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 48,
  },
  signOut: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 28,
    marginBottom: 8,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 16,
  },
  /** Extra horizontal inset so wrapped description does not touch the card edge. */
  paginationCard: {
    paddingVertical: 20,
    paddingHorizontal: 22,
  },
  paginationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  paginationDescriptionWrap: {
    alignSelf: 'stretch',
    marginBottom: 16,
    paddingRight: 2,
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
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  segment: {
    flex: 1,
    minWidth: 88,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 2,
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  previewBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
  },
  tablePreviewClip: {
    maxHeight: 200,
    overflow: 'hidden',
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
  sortRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 10,
  },
  sortRowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  /** Indented under label; bounded width so long hints wrap. */
  sortRowHintWrap: {
    marginTop: 8,
    marginLeft: 34,
    alignSelf: 'stretch',
    maxWidth: '100%',
  },
  orderPill: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
  },
  customSortPanel: {
    marginTop: 4,
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sortFieldInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
