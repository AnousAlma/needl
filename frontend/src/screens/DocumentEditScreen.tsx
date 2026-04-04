import { DataApiRequestError, deleteOneById, isDataApiReady, replaceDocument } from '../api/atlasDataApi';
import {
  canBrowseWithDriver,
  DriverApiError,
  driverDeleteOne,
  driverReplaceOne,
  getConnectionMongoUri,
} from '../api/driverApi';
import { DocumentFieldKindModal } from '../components/DocumentFieldKindModal';
import { useAuth } from '../contexts/AuthContext';
import type { DocumentViewMode } from '../store/settingsStore';
import { columnTypeForKey } from '../utils/bsonDisplay';
import {
  buildDocumentFromFieldTexts,
  compactObjectIdFieldDisplayFromText,
  convertFieldTextToKind,
  defaultValueForKind,
  type FieldValueKind,
  fieldTypeGlyph,
  inferFieldValueKind,
  parseEditableString,
  sortedDocumentKeys,
  validateNewFieldName,
  valueToEditableString,
} from '../utils/documentEditValue';
import * as Haptics from 'expo-haptics';
import { Plus, Trash2 } from 'lucide-react-native';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  TouchableOpacity,
  View,
} from 'react-native';
import { resetStackToDocumentExplorer } from '../navigation/resetToDocumentExplorer';
import { connectionStorage } from '../storage/connectionStorage';
import type { StoredConnection } from '../storage/connectionStorage';
import type { RootStackScreenProps } from '../types/navigation';
import { useTheme } from '../theme/ThemeProvider';

type Props = RootStackScreenProps<'DocumentEdit'>;

const COL_MIN = 132;
const IDX_W = 36;

function idEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function parseInitialDocument(
  json: string,
): { ok: true; doc: Record<string, unknown> } | { ok: false; message: string } {
  try {
    const v = JSON.parse(json) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      return { ok: false, message: 'Document must be a JSON object' };
    }
    const doc = v as Record<string, unknown>;
    if (!('_id' in doc)) {
      return { ok: false, message: 'Document must include _id' };
    }
    return { ok: true, doc };
  } catch {
    return { ok: false, message: 'Invalid document JSON' };
  }
}

export function DocumentEditScreen({ navigation, route }: Props) {
  const { colors, typography: typo, monoFontFamily } = useTheme();
  const { user } = useAuth();
  const {
    connectionId,
    connectionName,
    databaseName,
    collectionName,
    documentJson,
    initialViewMode,
  } = route.params;

  const initial = useMemo(() => parseInitialDocument(documentJson), [documentJson]);
  const originalIdRef = useRef<unknown>(initial.ok ? initial.doc._id : null);

  const [connection, setConnection] = useState<StoredConnection | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [editMode, setEditMode] = useState<DocumentViewMode>(initialViewMode);
  const [fieldTexts, setFieldTexts] = useState<Record<string, string>>(() => {
    if (!initial.ok) return {};
    const o: Record<string, string> = {};
    for (const k of sortedDocumentKeys(initial.doc)) {
      o[k] = valueToEditableString(initial.doc[k]);
    }
    return o;
  });
  const [jsonText, setJsonText] = useState(() =>
    initial.ok ? JSON.stringify(initial.doc, null, 2) : '',
  );

  const [error, setError] = useState<string | null>(initial.ok ? null : initial.message);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [kindModal, setKindModal] = useState<null | { mode: 'add' } | { mode: 'type'; key: string }>(null);

  const keysOrder = useMemo(() => sortedDocumentKeys(fieldTexts as Record<string, unknown>), [fieldTexts]);

  const docFromFieldTexts = useCallback((): { ok: true; doc: Record<string, unknown> } | { ok: false } => {
    return buildDocumentFromFieldTexts(
      fieldTexts,
      sortedDocumentKeys(fieldTexts as Record<string, unknown>),
      originalIdRef.current,
    );
  }, [fieldTexts]);

  const applyParsedDocToState = useCallback((doc: Record<string, unknown>) => {
    const next: Record<string, string> = {};
    for (const k of sortedDocumentKeys(doc)) {
      next[k] = valueToEditableString(doc[k]);
    }
    setFieldTexts(next);
    setJsonText(JSON.stringify(doc, null, 2));
  }, []);

  const liveDocForTypes = useMemo((): unknown[] => {
    const built = docFromFieldTexts();
    if (built.ok) return [built.doc];
    return initial.ok ? [initial.doc] : [];
  }, [docFromFieldTexts, initial]);

  const mongoUri = getConnectionMongoUri(connection);
  const useDriver = canBrowseWithDriver(connection, Boolean(user));

  const canDeleteDocument = useMemo(
    () =>
      Boolean(
        connection &&
          hydrated &&
          initial.ok &&
          ((useDriver && mongoUri && user) ||
            (!useDriver && isDataApiReady(connection) && Boolean(apiKey?.trim()))),
      ),
    [connection, hydrated, initial.ok, useDriver, mongoUri, user, apiKey],
  );

  useLayoutEffect(() => {
    void (async () => {
      const c = await connectionStorage.getById(connectionId);
      const key = await connectionStorage.getApiKey(connectionId);
      setConnection(c ?? null);
      setApiKey(key);
      setHydrated(true);
    })();
  }, [connectionId]);

  const flushStructuredToJson = useCallback((): boolean => {
    const built = buildDocumentFromFieldTexts(fieldTexts, keysOrder, originalIdRef.current);
    if (!built.ok) {
      setError(built.message);
      return false;
    }
    setError(null);
    setJsonText(JSON.stringify(built.doc, null, 2));
    return true;
  }, [fieldTexts, keysOrder]);

  const flushJsonToStructured = useCallback((): boolean => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setError('Invalid JSON');
      return false;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      setError('Document must be a JSON object');
      return false;
    }
    const doc = parsed as Record<string, unknown>;
    if (!idEqual(doc._id, originalIdRef.current)) {
      setError('_id cannot be changed');
      return false;
    }
    const next: Record<string, string> = {};
    for (const k of sortedDocumentKeys(doc)) {
      next[k] = valueToEditableString(doc[k]);
    }
    setFieldTexts(next);
    setError(null);
    return true;
  }, [jsonText]);

  const setMode = useCallback(
    (next: DocumentViewMode) => {
      if (next === editMode) return;
      if (next === 'json') {
        if (!flushStructuredToJson()) return;
        setEditMode('json');
        return;
      }
      if (editMode === 'json') {
        if (!flushJsonToStructured()) return;
      }
      setEditMode(next);
    },
    [editMode, flushJsonToStructured, flushStructuredToJson],
  );

  const buildReplacement = useCallback((): { ok: true; doc: Record<string, unknown> } | { ok: false; message: string } => {
    if (editMode === 'json') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        return { ok: false, message: 'Invalid JSON' };
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, message: 'Document must be a JSON object' };
      }
      const doc = parsed as Record<string, unknown>;
      if (!idEqual(doc._id, originalIdRef.current)) {
        return { ok: false, message: '_id cannot be changed' };
      }
      return { ok: true, doc };
    }
    return buildDocumentFromFieldTexts(fieldTexts, keysOrder, originalIdRef.current);
  }, [editMode, fieldTexts, jsonText, keysOrder]);

  const performDeleteDocument = useCallback(async () => {
    const id = originalIdRef.current;
    if (id === undefined || !connection) return;

    setDeleting(true);
    setError(null);
    try {
      if (useDriver && mongoUri && user) {
        const token = await user.getIdToken();
        const { deletedCount } = await driverDeleteOne(
          mongoUri,
          databaseName,
          collectionName,
          token,
          id,
        );
        if (deletedCount === 0) {
          Alert.alert('Not found', 'No document matched this _id (it may have been deleted already).');
          return;
        }
      } else {
        if (!apiKey?.trim()) {
          setError('Missing API key.');
          return;
        }
        const { deletedCount } = await deleteOneById(
          connection,
          apiKey,
          databaseName,
          collectionName,
          id,
        );
        if (deletedCount === 0) {
          Alert.alert('Not found', 'No document matched this _id (it may have been deleted already).');
          return;
        }
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetStackToDocumentExplorer(navigation, {
        connectionId,
        connectionName,
        databaseName,
        collectionName,
        refreshAfterEdit: Date.now(),
      });
    } catch (e) {
      const msg =
        e instanceof DataApiRequestError || e instanceof DriverApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      Alert.alert('Could not delete document', msg);
    } finally {
      setDeleting(false);
    }
  }, [
    apiKey,
    collectionName,
    connection,
    connectionId,
    connectionName,
    databaseName,
    mongoUri,
    navigation,
    useDriver,
    user,
  ]);

  const confirmDeleteDocument = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete document',
      'Remove this document from the collection? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void performDeleteDocument() },
      ],
    );
  }, [performDeleteDocument]);

  const onSave = useCallback(async () => {
    const built = buildReplacement();
    if (!built.ok) {
      setError(built.message);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!connection) {
      setError('Missing connection.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (useDriver && mongoUri && user) {
        const token = await user.getIdToken();
        const { matchedCount } = await driverReplaceOne(
          mongoUri,
          databaseName,
          collectionName,
          token,
          built.doc,
        );
        if (matchedCount === 0) {
          setError('No document matched (already deleted or _id mismatch).');
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          return;
        }
      } else {
        if (!apiKey?.trim()) {
          setError('Missing API key.');
          return;
        }
        await replaceDocument(connection, apiKey, databaseName, collectionName, built.doc);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetStackToDocumentExplorer(navigation, {
        connectionId,
        connectionName,
        databaseName,
        collectionName,
        refreshAfterEdit: Date.now(),
      });
    } catch (e) {
      const msg =
        e instanceof DataApiRequestError || e instanceof DriverApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setError(msg);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  }, [
    apiKey,
    buildReplacement,
    collectionName,
    connection,
    connectionId,
    connectionName,
    databaseName,
    mongoUri,
    navigation,
    useDriver,
    user,
  ]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => void onSave()}
          disabled={saving || deleting || !initial.ok || !hydrated}
          hitSlop={12}
          style={{
            marginRight: 5,
            paddingLeft: 3,
            transform: [{ translateX: 2 }],
            opacity: saving || deleting || !initial.ok ? 0.45 : 1,
          }}
          accessibilityRole="button"
          accessibilityLabel="Save document"
        >
          {saving ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={{ color: colors.primary, fontSize: 17, fontWeight: '600' }}>Save</Text>
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, onSave, saving, deleting, initial.ok, hydrated, colors.primary]);

  const updateField = useCallback((key: string, text: string) => {
    setFieldTexts((prev) => ({ ...prev, [key]: text }));
  }, []);

  const deleteField = useCallback(
    (key: string) => {
      if (key === '_id') return;
      if (editMode === 'json') {
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonText);
        } catch {
          setError('Invalid JSON');
          return;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
        const doc = { ...(parsed as Record<string, unknown>) };
        delete doc[key];
        applyParsedDocToState(doc);
      } else {
        setFieldTexts((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
      setError(null);
    },
    [applyParsedDocToState, editMode, jsonText],
  );

  const confirmDeleteField = useCallback(
    (key: string) => {
      if (key === '_id') return;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Remove field', `Remove “${key}” from this document?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => deleteField(key),
        },
      ]);
    },
    [deleteField],
  );

  const handleKindModalConfirm = useCallback(
    (kind: FieldValueKind, name?: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (kindModal?.mode === 'add') {
        const nm = (name ?? '').trim();
        const err = validateNewFieldName(nm, Object.keys(fieldTexts));
        if (err) {
          setError(err);
          return;
        }
        if (editMode === 'json') {
          let parsed: unknown;
          try {
            parsed = JSON.parse(jsonText);
          } catch {
            setError('Fix JSON before adding fields');
            return;
          }
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            setError('Document must be a JSON object');
            return;
          }
          const doc = {
            ...(parsed as Record<string, unknown>),
            [nm]: defaultValueForKind(kind),
          };
          applyParsedDocToState(doc);
        } else {
          const text = valueToEditableString(defaultValueForKind(kind));
          setFieldTexts((prev) => ({ ...prev, [nm]: text }));
        }
        setKindModal(null);
        setError(null);
        return;
      }
      if (kindModal?.mode === 'type') {
        const k = kindModal.key;
        const raw = fieldTexts[k] ?? '';
        const r = convertFieldTextToKind(raw, kind);
        if (!r.ok) {
          setError(r.message);
          return;
        }
        setFieldTexts((prev) => {
          const next = { ...prev, [k]: r.text };
          if (editMode === 'json') {
            const built = buildDocumentFromFieldTexts(
              next,
              sortedDocumentKeys(next as Record<string, unknown>),
              originalIdRef.current,
            );
            if (built.ok) {
              setJsonText(JSON.stringify(built.doc, null, 2));
            }
          }
          return next;
        });
        setKindModal(null);
        setError(null);
      }
    },
    [applyParsedDocToState, editMode, fieldTexts, jsonText, kindModal],
  );

  if (!initial.ok) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 24 }]}>
        <Text style={[typo.body, { color: colors.danger, textAlign: 'center' }]}>{initial.message}</Text>
        <Pressable onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
          <Text style={[typo.subtitle, { color: colors.primary }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const modeBtn = (mode: DocumentViewMode, label: string) => {
    const on = editMode === mode;
    return (
      <Pressable
        key={mode}
        onPress={() => {
          void Haptics.selectionAsync();
          setMode(mode);
        }}
        style={[
          styles.modePill,
          {
            borderColor: on ? colors.primary : colors.border,
            backgroundColor: on ? colors.inputSurface : 'transparent',
          },
        ]}
      >
        <Text style={[typo.caption, { color: on ? colors.primary : colors.text, fontWeight: on ? '700' : '500' }]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      <View style={[styles.modeRow, { borderBottomColor: colors.border }]}>
        {modeBtn('compact', 'Compact')}
        {modeBtn('list', 'Table')}
        {modeBtn('json', 'JSON')}
      </View>

      {initial.ok && (editMode !== 'json' || canDeleteDocument) ? (
        <View style={[styles.toolsRow, { borderBottomColor: colors.border }]}>
          {editMode !== 'json' ? (
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                setKindModal({ mode: 'add' });
              }}
              style={({ pressed }) => [
                styles.toolBtn,
                { borderColor: colors.border, backgroundColor: colors.inputSurface, opacity: pressed ? 0.88 : 1 },
              ]}
              accessibilityLabel="Add field"
            >
              <Plus size={18} color={colors.primary} />
              <Text style={[typo.caption, { color: colors.primary, fontWeight: '700' }]}>Add field</Text>
            </Pressable>
          ) : null}
          {canDeleteDocument ? (
            <Pressable
              onPress={confirmDeleteDocument}
              disabled={deleting || saving}
              style={({ pressed }) => [
                styles.toolBtn,
                {
                  marginLeft: 'auto',
                  borderColor: colors.danger,
                  backgroundColor: colors.inputSurface,
                  opacity: pressed ? 0.88 : deleting || saving ? 0.45 : 1,
                },
              ]}
              accessibilityLabel="Delete document"
            >
              {deleting ? (
                <ActivityIndicator color={colors.danger} size="small" />
              ) : (
                <>
                  <Trash2 size={18} color={colors.danger} />
                  <Text style={[typo.caption, { color: colors.danger, fontWeight: '700' }]}>Delete</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {error ? (
        <Text style={[typo.caption, { color: colors.danger, paddingHorizontal: 16, paddingTop: 8 }]}>{error}</Text>
      ) : null}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {editMode === 'json' ? (
          <TextInput
            value={jsonText}
            onChangeText={(t) => {
              setJsonText(t);
              setError(null);
            }}
            multiline
            scrollEnabled
            textAlignVertical="top"
            placeholder="{ ... }"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.jsonInput,
              {
                color: colors.text,
                fontFamily: monoFontFamily,
                borderColor: colors.border,
                backgroundColor: colors.inputSurface,
              },
            ]}
          />
        ) : editMode === 'compact' ? (
          <View style={[styles.compactCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            {keysOrder.map((key) => {
              const readOnly = key === '_id';
              return (
                <View key={key} style={[styles.compactRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.fieldName, { color: colors.text }]} numberOfLines={1}>
                    {key}
                    <Text style={{ color: colors.syntaxPunctuation }}>:</Text>
                  </Text>
                  <TextInput
                    value={
                      readOnly && editMode === 'compact'
                        ? (compactObjectIdFieldDisplayFromText(fieldTexts[key] ?? '') ??
                            (fieldTexts[key] ?? ''))
                        : (fieldTexts[key] ?? '')
                    }
                    editable={!readOnly}
                    onChangeText={(t) => updateField(key, t)}
                    multiline
                    scrollEnabled={false}
                    textAlignVertical="top"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[
                      styles.compactInput,
                      {
                        color: readOnly ? colors.textMuted : colors.text,
                        fontFamily: monoFontFamily,
                      },
                    ]}
                  />
                  {!readOnly ? (
                    <View style={styles.rowActions}>
                      <Pressable
                        onPress={() => setKindModal({ mode: 'type', key })}
                        hitSlop={6}
                        style={[styles.miniAct, { borderColor: colors.border }]}
                        accessibilityLabel={`Change type (${fieldTypeGlyph(fieldTexts[key] ?? '')}) for ${key}`}
                      >
                        <Text
                          style={[styles.typeGlyph, { color: colors.primary, fontFamily: monoFontFamily }]}
                          numberOfLines={1}
                        >
                          {fieldTypeGlyph(fieldTexts[key] ?? '')}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => confirmDeleteField(key)}
                        hitSlop={6}
                        style={[styles.miniAct, { borderColor: colors.border }]}
                        accessibilityLabel={`Delete ${key}`}
                      >
                        <Trash2 size={18} color={colors.danger} />
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator style={styles.hScroll}>
            <View style={[styles.table, { borderColor: colors.border }]}>
              <View style={[styles.headerRow, { backgroundColor: colors.inputSurface, borderColor: colors.border }]}>
                <View style={[styles.idxHead, { width: IDX_W, borderRightColor: colors.border }]}>
                  <Text style={{ fontFamily: monoFontFamily, fontSize: 12, color: colors.textMuted }} />
                </View>
                {keysOrder.map((k) => (
                  <View key={k} style={[styles.colHead, { minWidth: COL_MIN, borderRightColor: colors.border }]}>
                    <Text
                      style={[typo.caption, { fontFamily: monoFontFamily, color: colors.text, fontWeight: '600' }]}
                      numberOfLines={1}
                    >
                      {k}
                    </Text>
                    <Text style={[typo.caption, { fontFamily: monoFontFamily, color: colors.textMuted, marginTop: 2 }]}>
                      {columnTypeForKey(k, liveDocForTypes)}
                    </Text>
                    {k !== '_id' ? (
                      <View style={styles.tableHeadActions}>
                        <Pressable
                          onPress={() => setKindModal({ mode: 'type', key: k })}
                          hitSlop={4}
                          accessibilityLabel={`Change type (${fieldTypeGlyph(fieldTexts[k] ?? '')}) for ${k}`}
                        >
                          <Text
                            style={[styles.typeGlyphTable, { color: colors.primary, fontFamily: monoFontFamily }]}
                            numberOfLines={1}
                          >
                            {fieldTypeGlyph(fieldTexts[k] ?? '')}
                          </Text>
                        </Pressable>
                        <Pressable onPress={() => confirmDeleteField(k)} hitSlop={4} accessibilityLabel={`Delete ${k}`}>
                          <Trash2 size={14} color={colors.danger} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
              <View style={[styles.dataRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <View style={[styles.idxCell, { width: IDX_W, borderRightColor: colors.border }]}>
                  <Text style={{ fontFamily: monoFontFamily, fontSize: 12, color: colors.textMuted }}>1</Text>
                </View>
                {keysOrder.map((k) => {
                  const readOnly = k === '_id';
                  return (
                    <View key={k} style={[styles.cell, { minWidth: COL_MIN, borderRightColor: colors.border }]}>
                      <TextInput
                        value={
                          readOnly
                            ? (compactObjectIdFieldDisplayFromText(fieldTexts[k] ?? '') ??
                                (fieldTexts[k] ?? ''))
                            : (fieldTexts[k] ?? '')
                        }
                        editable={!readOnly}
                        onChangeText={(t) => updateField(k, t)}
                        multiline
                        textAlignVertical="top"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={{
                          fontFamily: monoFontFamily,
                          fontSize: 12,
                          minHeight: 72,
                          color: readOnly ? colors.textMuted : colors.text,
                          padding: 0,
                        }}
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        )}
      </ScrollView>

      <DocumentFieldKindModal
        visible={kindModal !== null}
        mode={kindModal?.mode === 'type' ? 'type' : 'add'}
        fieldKey={kindModal?.mode === 'type' ? kindModal.key : undefined}
        suggestedKind={
          kindModal?.mode === 'type'
            ? inferFieldValueKind(parseEditableString(fieldTexts[kindModal.key] ?? ''))
            : undefined
        }
        onClose={() => setKindModal(null)}
        onConfirm={handleKindModalConfirm}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toolsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingTop: 4,
  },
  miniAct: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 44,
    minHeight: 40,
  },
  typeGlyph: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  typeGlyphTable: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: -0.25,
    maxWidth: 72,
  },
  tableHeadActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  jsonInput: {
    minHeight: 420,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 13,
    lineHeight: 20,
  },
  compactCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fieldName: {
    fontSize: 14,
    fontWeight: '700',
    minWidth: 88,
    paddingTop: 8,
  },
  compactInput: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    minHeight: 40,
    paddingVertical: 6,
  },
  hScroll: {
    marginHorizontal: -16,
  },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    overflow: 'hidden',
    marginHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  idxHead: {
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  colHead: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  idxCell: {
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRightWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cell: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
});
