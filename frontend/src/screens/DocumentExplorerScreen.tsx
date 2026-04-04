import { DataApiRequestError, findDocuments, insertOneDocument, isDataApiReady } from '../api/atlasDataApi';
import {
  canBrowseWithDriver,
  DriverApiError,
  driverFindDocuments,
  driverInsertOne,
  getConnectionMongoUri,
} from '../api/driverApi';
import { AddFilterModal } from '../components/AddFilterModal';
import { DocumentCompassFieldList } from '../components/DocumentCompassFieldList';
import { DocumentCompassTable } from '../components/DocumentCompassTable';
import { SavedQueriesModal } from '../components/SavedQueriesModal';
import { useAuth } from '../contexts/AuthContext';
import {
  useSettingsStore,
  type CustomSortDirection,
  type DocumentSortPreset,
} from '../store/settingsStore';
import { CollapsibleJsonTree } from '../components/CollapsibleJsonTree';
import type { JsonSyntaxColorOverrides } from '../utils/jsonSyntax';
import { clauseSummary, mergeQueryFilters } from '../utils/queryFilterBuilder';
import * as Haptics from 'expo-haptics';
import { History, ListFilter, Plus, Search, X } from 'lucide-react-native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { connectionStorage } from '../storage/connectionStorage';
import type { StoredConnection } from '../storage/connectionStorage';
import {
  deleteSavedQuery,
  loadSavedQueries,
  saveCurrentQuery,
  type SavedExplorerQuery,
} from '../storage/savedQueryStorage';
import type { ThemeColors } from '../theme/colors';
import type { RootStackScreenProps } from '../types/navigation';
import { useTheme } from '../theme/ThemeProvider';

type Props = RootStackScreenProps<'DocumentExplorer'>;

/** Stitch / HTML reference — Document Explorer dark theme (app background = colors.background in dark mode) */
const EXPLORER_SURFACE = '#323532';
const EXPLORER_TEXT = '#F9FBFA';
const EXPLORER_MUTED = '#889397';
const EXPLORER_BORDER = 'rgba(136, 147, 151, 0.22)';
const EXPLORER_GLASS = 'rgba(34, 36, 33, 0.92)';

const EXPLORER_JSON_SYNTAX: JsonSyntaxColorOverrides = {
  keyString: '#889397',
  valueString: '#00ED64',
  number: '#FF6F44',
  bool: '#016EE9',
  null: '#889397',
  punct: '#889397',
  space: '#889397',
  other: EXPLORER_TEXT,
};

function formatIdSnippet(doc: unknown): string | null {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  const raw = (doc as { _id?: unknown })._id;
  if (raw === undefined || raw === null) return null;

  let hex: string | null = null;
  if (typeof raw === 'string') {
    if (/^[a-fA-F\d]{24}$/.test(raw)) hex = raw;
    else {
      const s = raw.length > 14 ? `${raw.slice(0, 10)}...` : raw;
      return `Id('${s}')`;
    }
  } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const oid = (raw as { $oid?: unknown }).$oid;
    if (typeof oid === 'string') hex = oid;
    else {
      try {
        const s = JSON.stringify(raw);
        return s.length > 28 ? `${s.slice(0, 22)}…` : s;
      } catch {
        return '_id';
      }
    }
  } else return null;

  if (hex && /^[a-fA-F\d]{24}$/.test(hex)) {
    return `ObjectId('${hex.slice(0, 10)}...')`;
  }
  return hex ? `ObjectId('${hex.slice(0, 12)}...')` : null;
}

function DocumentPreviewCard({
  doc,
  colors,
  monoFontFamily,
  onPress,
}: {
  doc: unknown;
  colors: ThemeColors;
  monoFontFamily: string;
  onPress: () => void;
}) {
  const idLabel = formatIdSnippet(doc);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.docCard,
        {
          backgroundColor: EXPLORER_SURFACE,
          borderColor: pressed ? 'rgba(0, 237, 100, 0.45)' : EXPLORER_BORDER,
        },
      ]}
    >
      {idLabel ? (
        <Text style={[styles.docCardId, { color: EXPLORER_MUTED }]} numberOfLines={1}>
          {idLabel}
        </Text>
      ) : null}
      <CollapsibleJsonTree
        value={doc}
        colors={colors}
        monoFontFamily={monoFontFamily}
        colorOverrides={EXPLORER_JSON_SYNTAX}
      />
    </Pressable>
  );
}

/** Compact (field list) card — same explorer chrome as JSON cards, no JSON fade. */
function CompactExplorerCard({
  doc,
  colors,
  monoFontFamily,
  onPress,
}: {
  doc: unknown;
  colors: ThemeColors;
  monoFontFamily: string;
  onPress: () => void;
}) {
  const idLabel = formatIdSnippet(doc);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.compactCard,
        {
          backgroundColor: EXPLORER_SURFACE,
          borderColor: pressed ? 'rgba(0, 237, 100, 0.45)' : EXPLORER_BORDER,
        },
      ]}
    >
      {idLabel ? (
        <Text style={[styles.compactCardId, { color: EXPLORER_MUTED }]} numberOfLines={1}>
          {idLabel}
        </Text>
      ) : null}
      <DocumentCompassFieldList doc={doc} colors={colors} monoFontFamily={monoFontFamily} />
    </Pressable>
  );
}

function sortForExplorer(
  preset: DocumentSortPreset,
  customField: string,
  customDir: CustomSortDirection,
): Record<string, 1 | -1> | undefined {
  if (preset === 'id_desc') return { _id: -1 };
  const key = customField.trim() || 'updatedAt';
  const order: 1 | -1 = customDir === 'asc' ? 1 : -1;
  return { [key]: order };
}

function safeStringify(doc: unknown): string {
  try {
    return JSON.stringify(doc, null, 2);
  } catch {
    return String(doc);
  }
}

function docKey(doc: unknown, index: number): string {
  if (doc && typeof doc === 'object' && '_id' in doc) {
    try {
      return JSON.stringify((doc as { _id: unknown })._id);
    } catch {
      /* fallthrough */
    }
  }
  return `idx-${index}`;
}

export function DocumentExplorerScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const { colors, typography: typo, monoFontFamily } = theme;
  const documentViewMode = useSettingsStore((s) => s.documentViewMode);
  const pageSize = useSettingsStore((s) => s.pageSize);
  const sortPreset = useSettingsStore((s) => s.sortPreset);
  const customSortField = useSettingsStore((s) => s.customSortField);
  const customSortDirection = useSettingsStore((s) => s.customSortDirection);
  const { user } = useAuth();
  const { connectionId, connectionName, databaseName, collectionName, refreshAfterEdit } = route.params;

  const [connection, setConnection] = useState<StoredConnection | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [documents, setDocuments] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [builderClauses, setBuilderClauses] = useState<Record<string, unknown>[]>([]);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [savedQueriesModalOpen, setSavedQueriesModalOpen] = useState(false);
  const [savedQueries, setSavedQueries] = useState<SavedExplorerQuery[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreInFlight = useRef(false);

  const mongoUri = getConnectionMongoUri(connection);
  const useDriver = canBrowseWithDriver(connection, Boolean(user));

  /** Theme overrides so field/table text reads on explorer dark surfaces. */
  const explorerFieldColors = useMemo(
    (): ThemeColors => ({
      ...colors,
      text: EXPLORER_TEXT,
      textMuted: EXPLORER_MUTED,
      border: EXPLORER_BORDER,
      surface: EXPLORER_SURFACE,
      inputSurface: EXPLORER_SURFACE,
    }),
    [colors],
  );

  const effectiveFilter = useMemo(
    () => mergeQueryFilters(filterText, builderClauses),
    [filterText, builderClauses],
  );

  useLayoutEffect(() => {
    void (async () => {
      const c = await connectionStorage.getById(connectionId);
      const key = await connectionStorage.getApiKey(connectionId);
      setConnection(c ?? null);
      setApiKey(key);
      setLoading(false);
    })();
  }, [connectionId]);

  useEffect(() => {
    void (async () => {
      const list = await loadSavedQueries(connectionId, databaseName, collectionName);
      setSavedQueries(list);
    })();
  }, [connectionId, databaseName, collectionName]);

  const fetchDocumentsPage = useCallback(
    async (
      skip: number,
      filter: Record<string, unknown>,
    ): Promise<{ ok: true; docs: unknown[] } | { ok: false; message: string }> => {
      if (!connection) {
        return { ok: false, message: 'Missing connection.' };
      }

      const sort = sortForExplorer(sortPreset, customSortField, customSortDirection);
      const opts = {
        filter,
        limit: pageSize,
        skip,
        ...(sort ? { sort } : {}),
      };

      try {
        if (useDriver && mongoUri && user) {
          const token = await user.getIdToken();
          const docs = await driverFindDocuments(mongoUri, databaseName, collectionName, token, opts);
          return { ok: true, docs };
        }
        if (!apiKey?.trim()) {
          return { ok: false, message: 'Missing connection or API key.' };
        }
        const docs = await findDocuments(connection, apiKey, databaseName, collectionName, opts);
        return { ok: true, docs };
      } catch (e) {
        const msg =
          e instanceof DataApiRequestError || e instanceof DriverApiError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e);
        return { ok: false, message: msg };
      }
    },
    [
      connection,
      apiKey,
      databaseName,
      collectionName,
      useDriver,
      mongoUri,
      user,
      pageSize,
      sortPreset,
      customSortField,
      customSortDirection,
    ],
  );

  const load = useCallback(
    async (override?: { text: string; clauses: Record<string, unknown>[] }) => {
      const merged = mergeQueryFilters(override?.text ?? filterText, override?.clauses ?? builderClauses);
      if (!merged.ok) {
        setError(null);
        setDocuments([]);
        setHasMore(false);
        return;
      }

      const result = await fetchDocumentsPage(0, merged.filter);
      if (!result.ok) {
        setError(result.message);
        setDocuments([]);
        setHasMore(false);
        return;
      }

      setError(null);
      setDocuments(result.docs);
      setHasMore(result.docs.length === pageSize);
    },
    [filterText, builderClauses, fetchDocumentsPage, pageSize],
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loadMoreInFlight.current) return;
    if (!effectiveFilter.ok) return;

    loadMoreInFlight.current = true;
    setLoadingMore(true);
    const skip = documents.length;

    try {
      const result = await fetchDocumentsPage(skip, effectiveFilter.filter);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDocuments((prev) => [...prev, ...result.docs]);
      setHasMore(result.docs.length === pageSize);
    } finally {
      setLoadingMore(false);
      loadMoreInFlight.current = false;
    }
  }, [hasMore, loadingMore, documents.length, effectiveFilter.ok, fetchDocumentsPage, pageSize]);

  useLayoutEffect(() => {
    if (!loading) void load();
  }, [loading, load]);

  useEffect(() => {
    if (refreshAfterEdit != null) void load();
  }, [refreshAfterEdit, load]);

  const openDocumentEdit = useCallback(
    (doc: unknown) => {
      void Haptics.selectionAsync();
      navigation.navigate('DocumentEdit', {
        connectionId,
        connectionName,
        databaseName,
        collectionName,
        documentJson: safeStringify(doc),
        initialViewMode: documentViewMode,
      });
    },
    [navigation, connectionId, connectionName, databaseName, collectionName, documentViewMode],
  );

  const canAddDocument = useMemo(
    () =>
      Boolean(
        connection &&
          ((useDriver && mongoUri && user) ||
            (!useDriver && isDataApiReady(connection) && Boolean(apiKey?.trim()))),
      ),
    [connection, useDriver, mongoUri, user, apiKey],
  );

  const addNewDocument = useCallback(async () => {
    if (!connection) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (useDriver && mongoUri && user) {
        const token = await user.getIdToken();
        const { document } = await driverInsertOne(mongoUri, databaseName, collectionName, token, {});
        openDocumentEdit(document);
        return;
      }
      if (apiKey?.trim() && isDataApiReady(connection)) {
        const { document } = await insertOneDocument(connection, apiKey, databaseName, collectionName, {});
        openDocumentEdit(document);
        return;
      }
      Alert.alert(
        'Cannot add document',
        'Sign in if your connection uses a cluster URL, or finish your Atlas Data API setup. Your rules must allow inserts.',
      );
    } catch (e) {
      const msg =
        e instanceof DataApiRequestError || e instanceof DriverApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      Alert.alert('Could not add document', msg);
    }
  }, [
    connection,
    useDriver,
    mongoUri,
    user,
    apiKey,
    databaseName,
    collectionName,
    openDocumentEdit,
  ]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: collectionName,
      headerStyle: { backgroundColor: colors.background },
      headerShadowVisible: false,
      headerTintColor: EXPLORER_TEXT,
      headerTitleStyle: {
        color: EXPLORER_TEXT,
        fontWeight: '700',
        fontSize: 18,
      },
      headerRight:
        canAddDocument && !loading
          ? () => (
              <TouchableOpacity
                onPress={() => void addNewDocument()}
                hitSlop={12}
                style={{ marginRight: 5, paddingLeft: 3, transform: [{ translateX: 2 }] }}
                accessibilityRole="button"
                accessibilityLabel="Add document"
              >
                <Plus color={colors.primary} size={26} strokeWidth={2.5} />
              </TouchableOpacity>
            )
          : undefined,
    });
  }, [navigation, collectionName, canAddDocument, loading, addNewDocument, colors.primary, colors.background]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const applyFilter = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void load();
  }, [load]);

  const onApplyBuilderClause = useCallback((clause: Record<string, unknown>) => {
    setBuilderClauses((prev) => [...prev, clause]);
  }, []);

  const removeBuilderClause = useCallback((index: number) => {
    void Haptics.selectionAsync();
    setBuilderClauses((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSaveCurrentQueryToStorage = useCallback(async () => {
    if (!effectiveFilter.ok) return;
    try {
      const list = await saveCurrentQuery(
        connectionId,
        databaseName,
        collectionName,
        filterText,
        builderClauses,
      );
      setSavedQueries(list);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [effectiveFilter.ok, connectionId, databaseName, collectionName, filterText, builderClauses]);

  const handleDeleteSavedQuery = useCallback(
    async (id: string) => {
      const list = await deleteSavedQuery(connectionId, databaseName, collectionName, id);
      setSavedQueries(list);
    },
    [connectionId, databaseName, collectionName],
  );

  const handleApplySavedQuery = useCallback(
    (q: SavedExplorerQuery) => {
      const clauses = JSON.parse(JSON.stringify(q.builderClauses)) as Record<string, unknown>[];
      setFilterText(q.filterText);
      setBuilderClauses(clauses);
      void load({ text: q.filterText, clauses });
    },
    [load],
  );

  const canSaveCurrentQuery = effectiveFilter.ok;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const isTable = documentViewMode === 'list';

  const searchBorderColor = searchFocused ? 'rgba(0, 237, 100, 0.45)' : EXPLORER_BORDER;

  const filterBlock = (
    <>
      <View style={[styles.searchChrome, { backgroundColor: EXPLORER_GLASS, borderBottomColor: EXPLORER_BORDER }]}>
        <View style={[styles.searchInner, { backgroundColor: EXPLORER_SURFACE, borderColor: searchBorderColor }]}>
          <Pressable
            onPress={() => applyFilter()}
            style={styles.searchIconSlot}
            hitSlop={8}
            accessibilityLabel="Run query"
          >
            <Search size={22} color={EXPLORER_MUTED} strokeWidth={2} />
          </Pressable>
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setFilterModalOpen(true);
            }}
            hitSlop={8}
            accessibilityLabel="Add filter"
            style={styles.filterBtn}
          >
            <ListFilter size={20} color={colors.primary} strokeWidth={2} />
            {builderClauses.length > 0 ? (
              <View style={[styles.filterBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.filterBadgeText}>{builderClauses.length}</Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setSavedQueriesModalOpen(true);
            }}
            hitSlop={8}
            accessibilityLabel="Saved queries"
            style={styles.searchIconSlot}
          >
            <History size={20} color={EXPLORER_MUTED} strokeWidth={2} />
          </Pressable>
          <TextInput
            value={filterText}
            onChangeText={setFilterText}
            onSubmitEditing={() => applyFilter()}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={'{"role": "admin"}'}
            placeholderTextColor={EXPLORER_MUTED}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: EXPLORER_TEXT, fontFamily: monoFontFamily }]}
          />
          {filterText.length > 0 || builderClauses.length > 0 ? (
            <Pressable
              onPress={() => {
                setFilterText('');
                setBuilderClauses([]);
                void Haptics.selectionAsync();
              }}
              style={styles.searchIconSlot}
              hitSlop={8}
              accessibilityLabel="Clear query"
            >
              <X size={22} color={EXPLORER_MUTED} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {builderClauses.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={styles.chipsScroll}
        >
          {builderClauses.map((c, i) => (
            <View
              key={`builder-clause-${i}`}
              style={[styles.chip, { backgroundColor: EXPLORER_SURFACE, borderColor: EXPLORER_BORDER }]}
            >
              <Text
                style={[typo.caption, { color: EXPLORER_TEXT, fontFamily: monoFontFamily, maxWidth: 200 }]}
                numberOfLines={1}
              >
                {clauseSummary(c)}
              </Text>
              <Pressable
                onPress={() => removeBuilderClause(i)}
                hitSlop={8}
                accessibilityLabel="Remove filter"
                style={styles.chipClose}
              >
                <X size={16} color={EXPLORER_MUTED} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {!effectiveFilter.ok ? (
        <Text style={[typo.caption, { color: '#FF6F44', paddingHorizontal: 16, marginTop: 8 }]}>
          {effectiveFilter.message}
        </Text>
      ) : null}

      {error ? (
        <Text style={[typo.caption, { color: '#FF6F44', paddingHorizontal: 16, marginBottom: 8 }]}>{error}</Text>
      ) : null}

      <AddFilterModal
        visible={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        onApply={onApplyBuilderClause}
        theme={theme}
      />
      <SavedQueriesModal
        visible={savedQueriesModalOpen}
        onClose={() => setSavedQueriesModalOpen(false)}
        queries={savedQueries}
        onApply={handleApplySavedQuery}
        onDelete={(id) => void handleDeleteSavedQuery(id)}
        onSaveCurrent={handleSaveCurrentQueryToStorage}
        canSaveCurrent={canSaveCurrentQuery}
        theme={theme}
      />
    </>
  );

  const emptyMessage =
    !error && effectiveFilter.ok ? (
      <Text style={[typo.body, { color: EXPLORER_MUTED, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 }]}>
        No documents (or rules blocked reads).
      </Text>
    ) : null;

  if (isTable) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        {filterBlock}
        {documents.length === 0 ? (
          emptyMessage
        ) : (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.tableScrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
            }
          >
            <DocumentCompassTable
              documents={documents}
              colors={explorerFieldColors}
              monoFontFamily={monoFontFamily}
              onRowPress={(doc) => openDocumentEdit(doc)}
            />
            {hasMore ? (
              <Pressable
                onPress={() => void loadMore()}
                disabled={loadingMore}
                style={({ pressed }) => [
                  styles.loadMoreBtn,
                  {
                    borderColor: EXPLORER_BORDER,
                    backgroundColor: EXPLORER_SURFACE,
                    opacity: pressed ? 0.9 : loadingMore ? 0.6 : 1,
                  },
                ]}
              >
                {loadingMore ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={[typo.caption, { color: colors.primary, fontWeight: '600' }]}>Load more</Text>
                )}
              </Pressable>
            ) : null}
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {filterBlock}
      <FlatList
        data={documents}
        keyExtractor={(item, index) => docKey(item, index)}
        extraData={documentViewMode}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={emptyMessage}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={styles.listFooterSpinner} color={colors.primary} />
          ) : null
        }
        renderItem={({ item }) =>
          documentViewMode === 'json' ? (
            <DocumentPreviewCard
              doc={item}
              colors={colors}
              monoFontFamily={monoFontFamily}
              onPress={() => openDocumentEdit(item)}
            />
          ) : (
            <CompactExplorerCard
              doc={item}
              colors={explorerFieldColors}
              monoFontFamily={monoFontFamily}
              onPress={() => openDocumentEdit(item)}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchChrome: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingRight: 4,
  },
  searchIconSlot: {
    paddingLeft: 14,
    paddingRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 48,
  },
  docCard: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 12,
    marginBottom: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  docCardId: {
    position: 'absolute',
    top: 12,
    right: 16,
    fontSize: 10,
    maxWidth: '55%',
  },
  compactCard: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  compactCardId: {
    fontSize: 10,
    alignSelf: 'flex-end',
    marginBottom: 8,
    maxWidth: '90%',
  },
  filterBtn: {
    marginRight: 4,
    padding: 4,
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    color: '#0A0A0A',
    fontSize: 10,
    fontWeight: '800',
  },
  chipsScroll: {
    maxHeight: 44,
    marginTop: 8,
  },
  chipsRow: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 6,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 8,
  },
  chipClose: {
    padding: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: 12,
    paddingHorizontal: 4,
    minWidth: 0,
  },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 },
  listFooterSpinner: { marginVertical: 20 },
  tableScrollContent: { paddingBottom: 32 },
  loadMoreBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 24,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
