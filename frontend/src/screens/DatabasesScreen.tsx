import { DataApiRequestError, isDataApiReady, listCollectionNames } from '../api/atlasDataApi';
import {
  canBrowseWithDriver,
  DriverApiError,
  driverCreateCollection,
  driverCreateDatabase,
  driverDropCollection,
  driverListCollectionsDetailed,
  driverListDatabases,
  getConnectionMongoUri,
  isDriverBackendConfigured,
  type DriverCollectionInfo,
  type DriverDatabaseInfo,
} from '../api/driverApi';
import { SimpleFormModal } from '../components/SimpleFormModal';
import { useAuth } from '../contexts/AuthContext';
import {
  peekDatabaseNavigatorHighlight,
  setDatabaseNavigatorHighlight,
} from '../navigation/databaseNavigatorHighlight';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronDown, Database, Folder, FolderOpen, Trash2 } from 'lucide-react-native';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { connectionStorage } from '../storage/connectionStorage';
import type { StoredConnection } from '../storage/connectionStorage';
import type { RootStackScreenProps } from '../types/navigation';
import { useTheme } from '../theme/ThemeProvider';

type Props = RootStackScreenProps<'Databases'>;

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  if (i === 0) return `${Math.round(n)} ${units[i]}`;
  const rounded = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${rounded} ${units[i]}`;
}

function formatDocCount(n: number | null): string {
  if (n === null) return '—';
  if (n < 1000) return `${n} docs`;
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}k docs`;
  }
  if (n < 1_000_000_000) {
    const m = n / 1_000_000;
    return `${Math.round(m * 10) / 10}M docs`;
  }
  const b = n / 1_000_000_000;
  return `${Math.round(b * 10) / 10}B docs`;
}

type DbRow = { name: string; sizeOnDiskBytes: number | null };

/** Shown only when “Show system databases” is on. */
const SYSTEM_DATABASE_NAMES = new Set(['admin', 'local']);

function isSystemDatabaseName(name: string): boolean {
  return SYSTEM_DATABASE_NAMES.has(name);
}

export function DatabasesScreen({ navigation, route }: Props) {
  const { colors, typography: typo, monoFontFamily } = useTheme();
  const { user } = useAuth();
  const { connectionId, connectionName } = route.params;
  const [connection, setConnection] = useState<StoredConnection | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [dataApiAnchor, setDataApiAnchor] = useState('');

  const [driverDbInfos, setDriverDbInfos] = useState<DriverDatabaseInfo[]>([]);
  const [extraDriverDbNames, setExtraDriverDbNames] = useState<string[]>([]);
  const [manualDataApiDbs, setManualDataApiDbs] = useState<string[]>([]);
  const [typedDbName, setTypedDbName] = useState('');

  const [expandedByDb, setExpandedByDb] = useState<Record<string, boolean>>({});
  const [collectionsByDb, setCollectionsByDb] = useState<Record<string, DriverCollectionInfo[]>>({});
  const [loadingByDb, setLoadingByDb] = useState<Record<string, boolean>>({});
  const [errorByDb, setErrorByDb] = useState<Record<string, string | null>>({});

  const [driverLoading, setDriverLoading] = useState(false);
  const [driverError, setDriverError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [objectModalOpen, setObjectModalOpen] = useState(false);
  const [objectForm, setObjectForm] = useState({ databaseName: '', seedCollection: 'data' });
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [collectionModalDb, setCollectionModalDb] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [droppingCollection, setDroppingCollection] = useState<{ db: string; name: string } | null>(null);

  const [uiHighlight, setUiHighlight] = useState<{ databaseName: string; collectionName: string } | null>(null);
  const [showSystemDatabases, setShowSystemDatabases] = useState(false);

  const mongoUri = getConnectionMongoUri(connection);
  const useDriver = canBrowseWithDriver(connection, Boolean(user));
  const browseReady = Boolean(
    connection && (isDataApiReady(connection) || canBrowseWithDriver(connection, Boolean(user))),
  );

  const surfaceCard = colors.surface;
  const surfaceLine = colors.border;
  const surfaceMuted = colors.inputSurface;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: connectionName,
      headerRight: browseReady
        ? () => (
            <View style={styles.headerActive}>
              <View style={[styles.headerDot, { backgroundColor: colors.primary }]} />
              <Text style={[typo.caption, { color: colors.primary, fontWeight: '700' }]}>Active</Text>
            </View>
          )
        : undefined,
    });
  }, [navigation, connectionName, browseReady, colors.primary, typo.caption]);

  useLayoutEffect(() => {
    void (async () => {
      const c = await connectionStorage.getById(connectionId);
      const key = await connectionStorage.getApiKey(connectionId);
      setConnection(c ?? null);
      setApiKey(key);
      if (c?.listingAnchorCollection) setDataApiAnchor(c.listingAnchorCollection);
      if (c?.defaultDatabase?.trim()) {
        const d = c.defaultDatabase.trim();
        setManualDataApiDbs((prev) => (prev.includes(d) ? prev : [...prev, d].sort((a, b) => a.localeCompare(b))));
      }
    })();
  }, [connectionId]);

  useFocusEffect(
    useCallback(() => {
      const h = peekDatabaseNavigatorHighlight();
      setUiHighlight(h);
    }, []),
  );

  const loadDriverDatabases = useCallback(async () => {
    if (!useDriver || !mongoUri || !user) {
      setDriverDbInfos([]);
      setDriverError(null);
      return;
    }
    setDriverError(null);
    setDriverLoading(true);
    try {
      const token = await user.getIdToken();
      const rows = await driverListDatabases(mongoUri, token);
      setDriverDbInfos(rows);
    } catch (e) {
      const msg = e instanceof DriverApiError ? e.message : e instanceof Error ? e.message : String(e);
      setDriverError(msg);
      setDriverDbInfos([]);
    } finally {
      setDriverLoading(false);
    }
  }, [useDriver, mongoUri, user]);

  useLayoutEffect(() => {
    if (useDriver) void loadDriverDatabases();
  }, [useDriver, loadDriverDatabases]);

  const fetchCollections = useCallback(
    async (dbName: string) => {
      setLoadingByDb((p) => ({ ...p, [dbName]: true }));
      setErrorByDb((p) => ({ ...p, [dbName]: null }));
      try {
        if (useDriver && mongoUri && user) {
          const token = await user.getIdToken();
          const rows = await driverListCollectionsDetailed(mongoUri, dbName, token);
          setCollectionsByDb((p) => ({ ...p, [dbName]: rows }));
        } else if (connection && apiKey?.trim()) {
          const a = dataApiAnchor.trim();
          if (!a) {
            setErrorByDb((p) => ({
              ...p,
              [dbName]: 'Set a listing anchor collection (exists in this database) below.',
            }));
            return;
          }
          const names = await listCollectionNames(connection, apiKey, dbName, a);
          setCollectionsByDb((p) => ({
            ...p,
            [dbName]: names.map((name) => ({ name, estimatedCount: null as number | null })),
          }));
        } else {
          setErrorByDb((p) => ({ ...p, [dbName]: 'Missing API key or connection.' }));
        }
      } catch (e) {
        const msg =
          e instanceof DriverApiError || e instanceof DataApiRequestError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e);
        setErrorByDb((p) => ({ ...p, [dbName]: msg }));
        setCollectionsByDb((p) => {
          const n = { ...p };
          delete n[dbName];
          return n;
        });
      } finally {
        setLoadingByDb((p) => ({ ...p, [dbName]: false }));
      }
    },
    [useDriver, mongoUri, user, connection, apiKey, dataApiAnchor],
  );

  const dbRows: DbRow[] = useMemo(() => {
    if (useDriver) {
      const fromServer = new Map<string, number | null>(driverDbInfos.map((d) => [d.name, d.sizeOnDiskBytes]));
      for (const n of extraDriverDbNames) {
        if (!fromServer.has(n)) fromServer.set(n, null);
      }
      return [...fromServer.entries()]
        .map(([name, sizeOnDiskBytes]) => ({ name, sizeOnDiskBytes }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return [...manualDataApiDbs].sort((a, b) => a.localeCompare(b)).map((name) => ({ name, sizeOnDiskBytes: null }));
  }, [useDriver, driverDbInfos, extraDriverDbNames, manualDataApiDbs]);

  const hasHiddenSystemDatabases = useMemo(
    () => dbRows.some((r) => isSystemDatabaseName(r.name)),
    [dbRows],
  );

  const visibleDbRows = useMemo(() => {
    if (showSystemDatabases) return dbRows;
    return dbRows.filter((r) => !isSystemDatabaseName(r.name));
  }, [dbRows, showSystemDatabases]);

  const toggleDatabase = useCallback((dbName: string) => {
    void Haptics.selectionAsync();
    setExpandedByDb((prev) => {
      const open = !prev[dbName];
      if (open) void fetchCollections(dbName);
      return { ...prev, [dbName]: open };
    });
  }, [fetchCollections]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (useDriver) await loadDriverDatabases();
    const open = Object.keys(expandedByDb).filter((k) => expandedByDb[k]);
    setCollectionsByDb({});
    for (const db of open) {
      await fetchCollections(db);
    }
    setRefreshing(false);
  }, [useDriver, loadDriverDatabases, expandedByDb, fetchCollections]);

  const submitAddObject = useCallback(async () => {
    const db = objectForm.databaseName.trim();
    const seed = objectForm.seedCollection.trim() || 'data';
    if (!db) {
      Alert.alert('Database name', 'Enter a name for the new database.');
      return;
    }
    if (!mongoUri || !user) return;
    try {
      const token = await user.getIdToken();
      await driverCreateDatabase(mongoUri, db, token, seed);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setObjectModalOpen(false);
      setObjectForm({ databaseName: '', seedCollection: 'data' });
      await loadDriverDatabases();
      setExpandedByDb((p) => ({ ...p, [db]: true }));
      setCollectionsByDb((p) => {
        const n = { ...p };
        delete n[db];
        return n;
      });
      void fetchCollections(db);
      Alert.alert('Created', `Database “${db}” with collection “${seed}”.`);
    } catch (e) {
      const msg = e instanceof DriverApiError ? e.message : e instanceof Error ? e.message : String(e);
      Alert.alert('Could not create database', msg);
    }
  }, [mongoUri, user, objectForm, loadDriverDatabases, fetchCollections]);

  const submitAddCollection = useCallback(async () => {
    const name = newCollectionName.trim();
    const db = collectionModalDb;
    if (!name || !db) {
      Alert.alert('Collection name', 'Enter a name for the new collection.');
      return;
    }
    if (!mongoUri || !user) return;
    try {
      const token = await user.getIdToken();
      await driverCreateCollection(mongoUri, db, name, token);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCollectionModalOpen(false);
      setNewCollectionName('');
      setCollectionModalDb(null);
      setCollectionsByDb((p) => {
        const n = { ...p };
        delete n[db];
        return n;
      });
      await fetchCollections(db);
      Alert.alert('Created', `Collection “${name}” was created.`);
    } catch (e) {
      const msg = e instanceof DriverApiError ? e.message : e instanceof Error ? e.message : String(e);
      Alert.alert('Could not create collection', msg);
    }
  }, [mongoUri, user, newCollectionName, collectionModalDb, fetchCollections]);

  const confirmDropCollection = useCallback(
    (databaseName: string, collName: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert(
        'Drop collection',
        `Permanently drop “${collName}” and all documents in it? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Drop',
            style: 'destructive',
            onPress: () =>
              void (async () => {
                if (!mongoUri || !user) return;
                setDroppingCollection({ db: databaseName, name: collName });
                try {
                  const token = await user.getIdToken();
                  await driverDropCollection(mongoUri, databaseName, collName, token);
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setCollectionsByDb((p) => {
                    const n = { ...p };
                    delete n[databaseName];
                    return n;
                  });
                  await fetchCollections(databaseName);
                  Alert.alert('Dropped', `Collection “${collName}” was removed.`);
                } catch (e) {
                  const msg =
                    e instanceof DriverApiError ? e.message : e instanceof Error ? e.message : String(e);
                  Alert.alert('Could not drop collection', msg);
                } finally {
                  setDroppingCollection(null);
                }
              })(),
          },
        ],
      );
    },
    [mongoUri, user, fetchCollections],
  );

  const openCollection = (databaseName: string, collectionName: string) => {
    setDatabaseNavigatorHighlight({ databaseName, collectionName });
    setUiHighlight({ databaseName, collectionName });
    void Haptics.selectionAsync();
    navigation.navigate('DocumentExplorer', {
      connectionId,
      connectionName,
      databaseName,
      collectionName,
    });
  };

  const addTypedDatabase = () => {
    const d = typedDbName.trim();
    if (!d) {
      Alert.alert('Database name', 'Enter a database name.');
      return;
    }
    void Haptics.selectionAsync();
    if (useDriver) {
      const known = new Set(driverDbInfos.map((x) => x.name));
      if (!known.has(d)) {
        setExtraDriverDbNames((prev) => (prev.includes(d) ? prev : [...prev, d]));
      }
      setTypedDbName('');
      setExpandedByDb((p) => ({ ...p, [d]: true }));
      setCollectionsByDb((p) => {
        const n = { ...p };
        delete n[d];
        return n;
      });
      void fetchCollections(d);
    } else {
      setManualDataApiDbs((prev) => (prev.includes(d) ? prev : [...prev, d].sort((a, b) => a.localeCompare(b))));
      setTypedDbName('');
      setExpandedByDb((p) => ({ ...p, [d]: true }));
      setCollectionsByDb((p) => {
        const n = { ...p };
        delete n[d];
        return n;
      });
      void fetchCollections(d);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          browseReady ? (
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />
          ) : undefined
        }
        keyboardShouldPersistTaps="handled"
      >
        <OpenConnectionGate
          connectionId={connectionId}
          colors={colors}
          typo={typo}
          monoFontFamily={monoFontFamily}
        />

        {useDriver ? (
          <Text style={[typo.body, { color: colors.textMuted, marginBottom: 12 }]}>
            Expand a database to list collections.
          </Text>
        ) : isDataApiReady(connection ?? undefined) ? (
          <Text style={[typo.body, { color: colors.textMuted, marginBottom: 12 }]}>
            Add databases by name, set a listing anchor, then expand a database to load collections.
          </Text>
        ) : (
          <Text style={[typo.body, { color: colors.textMuted, marginBottom: 12 }]}>
            Finish your connection setup to browse. You can add a database name below when browsing is available.
          </Text>
        )}

        {!useDriver && browseReady ? (
          <View style={[styles.anchorBlock, { borderColor: colors.border, backgroundColor: surfaceCard }]}>
            <Text style={[typo.caption, { color: colors.text, fontWeight: '600', marginBottom: 6 }]}>
              Listing anchor (any collection in that database)
            </Text>
            <TextInput
              value={dataApiAnchor}
              onChangeText={setDataApiAnchor}
              placeholder="e.g. users"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              style={[
                styles.input,
                {
                  fontFamily: monoFontFamily,
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: surfaceMuted,
                },
              ]}
            />
            <Text style={[typo.caption, { color: colors.textMuted, marginTop: 8 }]}>
              Used for $listCollections when you expand a database.
            </Text>
          </View>
        ) : null}

        {useDriver && driverLoading && driverDbInfos.length === 0 && extraDriverDbNames.length === 0 ? (
          <ActivityIndicator style={{ marginVertical: 24 }} color={colors.primary} />
        ) : null}
        {driverError ? (
          <Text style={[typo.caption, { color: colors.danger, marginBottom: 12 }]}>{driverError}</Text>
        ) : null}

        {browseReady && hasHiddenSystemDatabases ? (
          <View
            style={[
              styles.systemDbToggle,
              { borderColor: colors.border, backgroundColor: surfaceCard },
            ]}
          >
            <View style={styles.systemDbToggleText}>
              <Text style={[typo.caption, { color: colors.text, fontWeight: '600' }]}>
                Show system databases
              </Text>
              <Text style={[typo.caption, { color: colors.textMuted, marginTop: 2 }]}>
                admin and local are hidden by default
              </Text>
            </View>
            <Switch
              value={showSystemDatabases}
              onValueChange={(v) => {
                void Haptics.selectionAsync();
                setShowSystemDatabases(v);
              }}
              trackColor={{ false: colors.border, true: `${colors.primary}99` }}
              thumbColor={showSystemDatabases ? colors.primary : colors.textMuted}
            />
          </View>
        ) : null}

        {browseReady && visibleDbRows.length === 0 && dbRows.length > 0 ? (
          <Text style={[typo.caption, { color: colors.textMuted, marginBottom: 12 }]}>
            Only system databases are listed. Turn on “Show system databases” above.
          </Text>
        ) : null}

        <View style={styles.dbList}>
          {visibleDbRows.map((row) => {
            const expanded = Boolean(expandedByDb[row.name]);
            const cols = collectionsByDb[row.name];
            const loading = loadingByDb[row.name];
            const err = errorByDb[row.name];
            const borderColor = expanded ? `${colors.primary}4D` : `${surfaceLine}80`;
            return (
              <View
                key={row.name}
                style={[
                  styles.accordion,
                  {
                    backgroundColor: surfaceCard,
                    borderColor,
                    ...(expanded
                      ? {
                          shadowColor: colors.primary,
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.08,
                          shadowRadius: 12,
                          elevation: 3,
                        }
                      : {}),
                  },
                ]}
              >
                <Pressable
                  onPress={() => toggleDatabase(row.name)}
                  style={({ pressed }) => [styles.accordionSummary, { opacity: pressed ? 0.92 : 1 }]}
                >
                  <View style={styles.summaryLeft}>
                    <Database size={22} color={expanded ? colors.primary : colors.textMuted} />
                    <Text style={[styles.dbTitle, { color: colors.text }]}>{row.name}</Text>
                  </View>
                  <View style={styles.summaryRight}>
                    <Text style={[styles.monoSm, { color: colors.textMuted, fontFamily: monoFontFamily }]}>
                      {formatBytes(row.sizeOnDiskBytes)}
                    </Text>
                    <ChevronDown
                      size={20}
                      color={expanded ? colors.primary : colors.textMuted}
                      style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
                    />
                  </View>
                </Pressable>

                {expanded ? (
                  <View style={styles.nestedWrap}>
                    <View style={[styles.treeLine, { backgroundColor: `${surfaceLine}99` }]} />
                    <View style={styles.nestedInner}>
                      {loading ? (
                        <ActivityIndicator style={{ marginVertical: 12 }} color={colors.primary} />
                      ) : err ? (
                        <Text style={[typo.caption, { color: colors.danger, paddingVertical: 8, paddingLeft: 8 }]}>
                          {err}
                        </Text>
                      ) : cols && cols.length === 0 ? (
                        <Text style={[typo.caption, { color: colors.textMuted, paddingVertical: 8, paddingLeft: 8 }]}>
                          No collections.
                        </Text>
                      ) : (
                        cols?.map((c, idx) => {
                          const active =
                            uiHighlight?.databaseName === row.name && uiHighlight?.collectionName === c.name;
                          const countLabel = formatDocCount(c.estimatedCount);
                          return (
                            <View
                              key={c.name}
                              style={[
                                styles.collectionRow,
                                idx > 0 ? { marginTop: 4 } : null,
                                active
                                  ? {
                                      backgroundColor: `${surfaceMuted}99`,
                                      borderWidth: StyleSheet.hairlineWidth,
                                      borderColor: surfaceLine,
                                    }
                                  : null,
                              ]}
                            >
                              <Pressable
                                onPress={() => openCollection(row.name, c.name)}
                                style={({ pressed }) => [
                                  styles.collectionMain,
                                  !active ? { backgroundColor: 'transparent' } : null,
                                  { opacity: pressed ? 0.9 : 1 },
                                ]}
                              >
                                <View style={styles.collectionLeft}>
                                  {active ? (
                                    <FolderOpen size={18} color={colors.primary} />
                                  ) : (
                                    <Folder size={18} color={`${colors.textMuted}B3`} />
                                  )}
                                  <Text
                                    style={[
                                      typo.body,
                                      { color: colors.text, fontSize: 14 },
                                      active ? { fontWeight: '600' } : null,
                                    ]}
                                  >
                                    {c.name}
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    styles.countPill,
                                    active
                                      ? {
                                          backgroundColor: colors.background,
                                          borderWidth: StyleSheet.hairlineWidth,
                                          borderColor: `${colors.primary}33`,
                                        }
                                      : { backgroundColor: `${surfaceMuted}66` },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.monoSm,
                                      { color: colors.primary, fontFamily: monoFontFamily },
                                    ]}
                                  >
                                    {countLabel}
                                  </Text>
                                </View>
                              </Pressable>
                              {useDriver ? (
                                <Pressable
                                  onPress={() => confirmDropCollection(row.name, c.name)}
                                  disabled={droppingCollection?.db === row.name && droppingCollection?.name === c.name}
                                  hitSlop={10}
                                  style={({ pressed }) => [
                                    styles.dropBtn,
                                    { opacity: pressed ? 0.85 : droppingCollection?.name === c.name ? 0.4 : 1 },
                                  ]}
                                  accessibilityLabel={`Drop collection ${c.name}`}
                                >
                                  {droppingCollection?.db === row.name && droppingCollection?.name === c.name ? (
                                    <ActivityIndicator color={colors.danger} size="small" />
                                  ) : (
                                    <Trash2 size={20} color={colors.danger} />
                                  )}
                                </Pressable>
                              ) : null}
                            </View>
                          );
                        })
                      )}

                      {useDriver && !loading && !err ? (
                        <Pressable
                          onPress={() => {
                            void Haptics.selectionAsync();
                            setCollectionModalDb(row.name);
                            setNewCollectionName('');
                            setCollectionModalOpen(true);
                          }}
                          style={({ pressed }) => [styles.addCollectionLink, { opacity: pressed ? 0.88 : 1 }]}
                        >
                          <Text style={[typo.caption, { color: colors.primary, fontWeight: '700' }]}>
                            + Add collection
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {browseReady && visibleDbRows.length === 0 && dbRows.length === 0 && !driverLoading ? (
          <Text style={[typo.caption, { color: colors.textMuted, textAlign: 'center', marginTop: 8 }]}>
            {useDriver ? 'No databases returned.' : 'Add a database name below to get started.'}
          </Text>
        ) : null}

        <View
          style={[
            styles.footerDash,
            { borderColor: `${surfaceLine}80` },
          ]}
        >
        </View>

        {browseReady ? (
          <View style={styles.addByName}>
            <Text style={[typo.caption, { color: colors.text, fontWeight: '600', marginBottom: 8 }]}>
              {useDriver ? 'Browse database by name' : 'Add database'}
            </Text>
            <View style={styles.addByNameRow}>
              <TextInput
                value={typedDbName}
                onChangeText={setTypedDbName}
                placeholder={useDriver ? 'another_db' : 'sample_mflix'}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.inputFlex,
                  {
                    fontFamily: monoFontFamily,
                    color: colors.text,
                    borderColor: colors.border,
                    backgroundColor: surfaceMuted,
                  },
                ]}
              />
              <Pressable
                onPress={addTypedDatabase}
                style={({ pressed }) => [
                  styles.addByNameBtn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.9 : 1 },
                ]}
              >
                <Text style={[typo.caption, { color: '#001E2B', fontWeight: '700' }]}>Add</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {useDriver ? (
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              setObjectForm({ databaseName: '', seedCollection: 'data' });
              setObjectModalOpen(true);
            }}
            style={({ pressed }) => [
              styles.btnOutline,
              { borderColor: colors.primary, opacity: pressed ? 0.88 : 1, marginTop: 16 },
            ]}
          >
            <Text style={[typo.subtitle, { color: colors.primary, fontWeight: '600' }]}>Add database (create)</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <SimpleFormModal
        visible={objectModalOpen}
        title="Add database"
        fields={[
          { key: 'databaseName', label: 'Database name', placeholder: 'my_new_db' },
          { key: 'seedCollection', label: 'First collection name', placeholder: 'data' },
        ]}
        values={objectForm}
        onChange={(key, text) => setObjectForm((prev) => ({ ...prev, [key]: text }))}
        submitLabel="Create"
        onSubmit={() => void submitAddObject()}
        onClose={() => setObjectModalOpen(false)}
      />

      <SimpleFormModal
        visible={collectionModalOpen}
        title={collectionModalDb ? `Add collection in “${collectionModalDb}”` : 'Add collection'}
        fields={[{ key: 'name', label: 'Collection name', placeholder: 'my_collection' }]}
        values={{ name: newCollectionName }}
        onChange={(key, text) => key === 'name' && setNewCollectionName(text)}
        submitLabel="Create"
        onSubmit={() => void submitAddCollection()}
        onClose={() => {
          setCollectionModalOpen(false);
          setCollectionModalDb(null);
        }}
      />
    </View>
  );
}

function OpenConnectionGate({
  connectionId,
  colors,
  typo,
  monoFontFamily,
}: {
  connectionId: string;
  colors: {
    background: string;
    text: string;
    textMuted: string;
    border: string;
    surface: string;
    danger: string;
  };
  typo: { caption: { fontSize: number; fontWeight: '400' }; body: { fontSize: number } };
  monoFontFamily: string;
}) {
  const { user } = useAuth();
  const [conn, setConn] = useState<StoredConnection | null | undefined>(undefined);

  useLayoutEffect(() => {
    void (async () => {
      const c = await connectionStorage.getById(connectionId);
      setConn(c ?? null);
    })();
  }, [connectionId]);

  if (conn === undefined) return null;

  const uri = getConnectionMongoUri(conn ?? undefined);
  const driverOk = canBrowseWithDriver(conn, Boolean(user));
  const dataApiOk = Boolean(conn && isDataApiReady(conn));
  const driverBackendConfigured = isDriverBackendConfigured();

  if (dataApiOk || driverOk) return null;

  if (uri && !driverBackendConfigured) {
    return (
      <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
        <Text style={[typo.body, { color: colors.text }]}>
          We are unable to connect right now. Please try again in a moment. If the issue continues, contact
          anask.almasri@gmail.com and include a screenshot of this message.
        </Text>
      </View>
    );
  }

  if (isDriverBackendConfigured() && uri && !user) {
    return (
      <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[typo.body, { color: colors.text }]}>
          Driver API is configured and this connection has a MongoDB URI. Sign in to browse with the wire-protocol
          driver, or add Atlas Data API fields for device-only access.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.banner, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
      <Text style={[typo.body, { color: colors.text }]}>
        This connection is missing Atlas Data API details (or the App ID). Edit the connection and add App ID, data
        source, and API key, or save a MongoDB cluster URL and sign in to browse.
      </Text>
      <Text style={[typo.caption, { color: colors.textMuted, marginTop: 8, fontFamily: monoFontFamily }]}>
        Atlas → App Services → your app → HTTPS Endpoints → Data API
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  headerActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 5,
    paddingLeft: 3,
    transform: [{ translateX: 2 }],
  },
  headerDot: { width: 8, height: 8, borderRadius: 4 },
  anchorBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  systemDbToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  systemDbToggleText: { flex: 1, paddingRight: 8 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputFlex: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  dbList: { gap: 12 },
  accordion: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  accordionSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    gap: 12,
  },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  summaryRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  dbTitle: { fontSize: 15, fontWeight: '500', letterSpacing: 0.2 },
  monoSm: { fontSize: 12 },
  nestedWrap: {
    flexDirection: 'row',
    paddingBottom: 10,
    paddingLeft: 4,
    position: 'relative',
  },
  treeLine: {
    width: StyleSheet.hairlineWidth,
    marginRight: 10,
    alignSelf: 'stretch',
    minHeight: 40,
  },
  nestedInner: { flex: 1 },
  collectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    minHeight: 48,
    paddingRight: 4,
  },
  collectionMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 8,
    borderRadius: 8,
  },
  collectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dropBtn: { padding: 8, borderRadius: 10 },
  addCollectionLink: { paddingVertical: 10, paddingLeft: 8, marginTop: 4 },
  footerDash: {
    marginTop: 16,
    paddingVertical: 22,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    alignItems: 'center',
  },
  addByName: { marginTop: 20 },
  addByNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addByNameBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  btnOutline: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
  },
  banner: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
});
