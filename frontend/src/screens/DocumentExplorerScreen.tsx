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
import { clauseSummary, parseFilterJson } from '../utils/queryFilterBuilder';
import * as Haptics from 'expo-haptics';
import { History, ListFilter, Plus, Search, X } from 'lucide-react-native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
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
import type { ColorSchemeName, ThemeColors } from '../theme/colors';
import type { RootStackScreenProps } from '../types/navigation';
import { useTheme } from '../theme/ThemeProvider';
import { unionDocumentKeys } from '../utils/bsonDisplay';

type Props = RootStackScreenProps<'DocumentExplorer'>;

/** Dark-only: Compass-style explorer chrome on top of #222421 canvas */
const EXPLORER_SURFACE_DARK = '#323532';
const EXPLORER_TEXT_DARK = '#F9FBFA';
const EXPLORER_MUTED_DARK = '#889397';
const EXPLORER_BORDER_DARK = 'rgba(136, 147, 151, 0.22)';
const EXPLORER_GLASS_DARK = 'rgba(34, 36, 33, 0.92)';

const EXPLORER_JSON_SYNTAX_DARK: JsonSyntaxColorOverrides = {
  keyString: '#889397',
  valueString: '#00ED64',
  number: '#FF6F44',
  bool: '#016EE9',
  null: '#889397',
  punct: '#889397',
  space: '#889397',
  other: EXPLORER_TEXT_DARK,
};

type ExplorerChrome = {
  surface: string;
  text: string;
  muted: string;
  border: string;
  /** Outer search strip behind the query field */
  glass: string;
  jsonSyntax: JsonSyntaxColorOverrides | undefined;
};

function explorerChromeFor(scheme: ColorSchemeName, colors: ThemeColors): ExplorerChrome {
  if (scheme === 'dark') {
    return {
      surface: EXPLORER_SURFACE_DARK,
      text: EXPLORER_TEXT_DARK,
      muted: EXPLORER_MUTED_DARK,
      border: EXPLORER_BORDER_DARK,
      glass: EXPLORER_GLASS_DARK,
      jsonSyntax: EXPLORER_JSON_SYNTAX_DARK,
    };
  }
  return {
    surface: colors.surface,
    text: colors.text,
    muted: colors.textMuted,
    border: colors.border,
    glass: colors.background,
    jsonSyntax: undefined,
  };
}

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
  chrome,
  jsonSyntax,
}: {
  doc: unknown;
  colors: ThemeColors;
  monoFontFamily: string;
  onPress: () => void;
  chrome: Pick<ExplorerChrome, 'surface' | 'border' | 'muted'>;
  jsonSyntax: JsonSyntaxColorOverrides | undefined;
}) {
  const idLabel = formatIdSnippet(doc);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.docCard,
        {
          backgroundColor: chrome.surface,
          borderColor: pressed ? 'rgba(0, 237, 100, 0.45)' : chrome.border,
        },
      ]}
    >
      {idLabel ? (
        <Text style={[styles.docCardId, { color: chrome.muted }]} numberOfLines={1}>
          {idLabel}
        </Text>
      ) : null}
      <CollapsibleJsonTree
        value={doc}
        colors={colors}
        monoFontFamily={monoFontFamily}
        colorOverrides={jsonSyntax}
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
  chrome,
}: {
  doc: unknown;
  colors: ThemeColors;
  monoFontFamily: string;
  onPress: () => void;
  chrome: Pick<ExplorerChrome, 'surface' | 'border' | 'muted'>;
}) {
  const idLabel = formatIdSnippet(doc);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.compactCard,
        {
          backgroundColor: chrome.surface,
          borderColor: pressed ? 'rgba(0, 237, 100, 0.45)' : chrome.border,
        },
      ]}
    >
      {idLabel ? (
        <Text style={[styles.compactCardId, { color: chrome.muted }]} numberOfLines={1}>
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

function escapeRegexLiteral(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mergeBaseAndClauses(
  base: Record<string, unknown>,
  builderClauses: Record<string, unknown>[],
): { ok: true; filter: Record<string, unknown> } {
  const parts: Record<string, unknown>[] = [];
  if (Object.keys(base).length > 0) parts.push(base);
  const cleanClauses = builderClauses.filter((c) => c && typeof c === 'object' && Object.keys(c).length > 0);
  parts.push(...cleanClauses);
  if (parts.length === 0) return { ok: true, filter: {} };
  if (parts.length === 1) return { ok: true, filter: parts[0]! };
  return { ok: true, filter: { $and: parts } };
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
  const { colors, scheme, typography: typo, monoFontFamily } = theme;
  const ex = useMemo(() => explorerChromeFor(scheme, colors), [scheme, colors]);
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
  const knownSearchKeysRef = useRef<string[]>([]);

  const mongoUri = getConnectionMongoUri(connection);
  const useDriver = canBrowseWithDriver(connection, Boolean(user));

  /** Dark: lift contrast on charcoal cards. Light: use global theme as-is. */
  const explorerFieldColors = useMemo((): ThemeColors => {
    if (scheme === 'dark') {
      return {
        ...colors,
        text: EXPLORER_TEXT_DARK,
        textMuted: EXPLORER_MUTED_DARK,
        border: EXPLORER_BORDER_DARK,
        surface: EXPLORER_SURFACE_DARK,
        inputSurface: EXPLORER_SURFACE_DARK,
      };
    }
    return colors;
  }, [scheme, colors]);

  const parsedTextFilter = useMemo(() => parseFilterJson(filterText), [filterText]);
  const textSearchMode = useMemo(
    () => !parsedTextFilter.ok && filterText.trim().length > 0,
    [parsedTextFilter.ok, filterText],
  );
  const effectiveFilter = useMemo(() => {
    if (parsedTextFilter.ok) {
      return mergeBaseAndClauses(parsedTextFilter.filter, builderClauses);
    }
    const term = filterText.trim();
    if (!term) return mergeBaseAndClauses({}, builderClauses);
    const keys = knownSearchKeysRef.current.filter((k) => k !== '_id');
    if (keys.length === 0) return mergeBaseAndClauses({}, builderClauses);
    const escaped = escapeRegexLiteral(term);
    const regexAnyKnownField: Record<string, unknown> = {
      $or: keys.map((k) => ({ [k]: { $regex: escaped, $options: 'i' } })),
    };
    return mergeBaseAndClauses(regexAnyKnownField, builderClauses);
  }, [parsedTextFilter, filterText, builderClauses]);

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
      const nextText = override?.text ?? filterText;
      const nextClauses = override?.clauses ?? builderClauses;
      const parsed = parseFilterJson(nextText);
      const merged = parsed.ok
        ? mergeBaseAndClauses(parsed.filter, nextClauses)
        : (() => {
            const term = nextText.trim();
            const keys = unionDocumentKeys(documents).filter((k) => k !== '_id');
            if (!term || keys.length === 0) return mergeBaseAndClauses({}, nextClauses);
            const escaped = escapeRegexLiteral(term);
            const regexAnyKnownField: Record<string, unknown> = {
              $or: keys.map((k) => ({ [k]: { $regex: escaped, $options: 'i' } })),
            };
            return mergeBaseAndClauses(regexAnyKnownField, nextClauses);
          })();

      const result = await fetchDocumentsPage(0, merged.filter);
      if (!result.ok) {
        setError(result.message);
        setDocuments([]);
        setHasMore(false);
        return;
      }

      setError(null);
      setDocuments(result.docs);
      const nextKnownKeys = unionDocumentKeys(result.docs).filter((k) => k !== '_id');
      if (nextKnownKeys.length > 0) {
        knownSearchKeysRef.current = nextKnownKeys;
      }
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

  /** Auto-run query after a short pause so search behaves like live filtering. */
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      void load();
    }, 1500);
    return () => clearTimeout(t);
  }, [loading, parsedTextFilter.ok, filterText, builderClauses, load]);

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
      headerTintColor: colors.text,
      headerTitleStyle: {
        color: colors.text,
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
  }, [
    navigation,
    collectionName,
    canAddDocument,
    loading,
    addNewDocument,
    colors.primary,
    colors.background,
    colors.text,
  ]);

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

  const searchBorderColor = searchFocused ? 'rgba(0, 237, 100, 0.45)' : ex.border;

  const filterBlock = (
    <>
      <View style={[styles.searchChrome, { backgroundColor: ex.glass, borderBottomColor: ex.border }]}>
        <View style={[styles.searchInner, { backgroundColor: ex.surface, borderColor: searchBorderColor }]}>
          <Pressable
            onPress={() => applyFilter()}
            style={styles.searchIconSlot}
            hitSlop={8}
            accessibilityLabel="Run query"
          >
            <Search size={22} color={ex.muted} strokeWidth={2} />
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
            <History size={20} color={ex.muted} strokeWidth={2} />
          </Pressable>
          <TextInput
            value={filterText}
            onChangeText={setFilterText}
            onSubmitEditing={() => applyFilter()}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={'{"role": "admin"}'}
            placeholderTextColor={ex.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.searchInput,
              {
                color: ex.text,
                fontFamily: monoFontFamily,
                // iOS Safari zooms focused inputs below 16px.
                fontSize: Platform.OS === 'web' ? 16 : 13,
              },
            ]}
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
              <X size={22} color={ex.muted} strokeWidth={2} />
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
              style={[styles.chip, { backgroundColor: ex.surface, borderColor: ex.border }]}
            >
              <Text
                style={[typo.caption, { color: ex.text, fontFamily: monoFontFamily, maxWidth: 200 }]}
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
                <X size={16} color={ex.muted} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {textSearchMode ? (
        <Text style={[typo.caption, { color: ex.muted, paddingHorizontal: 16, marginTop: 8 }]}>
          Text search mode: running regex across known fields for "{filterText.trim()}".
        </Text>
      ) : null}

      {error ? (
        <Text style={[typo.caption, { color: colors.danger, paddingHorizontal: 16, marginBottom: 8 }]}>{error}</Text>
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
    !error && (effectiveFilter.ok || textSearchMode) ? (
      <Text style={[typo.body, { color: ex.muted, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 }]}>
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
                    borderColor: ex.border,
                    backgroundColor: ex.surface,
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
        extraData={`${documentViewMode}-${scheme}`}
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
              chrome={ex}
              jsonSyntax={ex.jsonSyntax}
            />
          ) : (
            <CompactExplorerCard
              doc={item}
              colors={explorerFieldColors}
              monoFontFamily={monoFontFamily}
              onPress={() => openDocumentEdit(item)}
              chrome={ex}
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
