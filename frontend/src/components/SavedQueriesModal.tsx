import * as Haptics from 'expo-haptics';
import { BookmarkPlus, Trash2 } from 'lucide-react-native';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SavedExplorerQuery } from '../storage/savedQueryStorage';
import type { Theme } from '../theme/ThemeProvider';
import { clauseSummary } from '../utils/queryFilterBuilder';

type Props = {
  visible: boolean;
  onClose: () => void;
  queries: SavedExplorerQuery[];
  onApply: (q: SavedExplorerQuery) => void;
  onDelete: (id: string) => void;
  onSaveCurrent?: () => void | Promise<void>;
  canSaveCurrent: boolean;
  theme: Theme;
};

function queryPreviewLine(q: SavedExplorerQuery): string {
  const t = q.filterText.trim();
  if (t.length > 0) return t.length > 72 ? `${t.slice(0, 69)}…` : t;
  if (q.builderClauses.length > 0) return `${q.builderClauses.length} visual filter(s)`;
  return '{}';
}

export function SavedQueriesModal({
  visible,
  onClose,
  queries,
  onApply,
  onDelete,
  onSaveCurrent,
  canSaveCurrent,
  theme,
}: Props) {
  const { colors, typography: typo, monoFontFamily } = theme;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => {
              void Haptics.selectionAsync();
              onClose();
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={[typo.subtitle, { color: colors.primary }]}>Done</Text>
          </Pressable>
          <Text style={[typo.subtitle, { color: colors.text }]}>Saved queries</Text>
          <View style={{ width: 48 }} />
        </View>

        {canSaveCurrent && onSaveCurrent ? (
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              void Promise.resolve(onSaveCurrent());
            }}
            style={({ pressed }) => [
              styles.saveBtn,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: pressed ? 0.88 : 1,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Save current query"
          >
            <BookmarkPlus color={colors.primary} size={22} strokeWidth={2.2} />
            <Text style={[typo.subtitle, { color: colors.text, marginLeft: 10 }]}>Save current query</Text>
          </Pressable>
        ) : null}

        {queries.length === 0 ? (
          <Text style={[typo.body, { color: colors.textMuted, padding: 24, textAlign: 'center' }]}>
            No saved queries for this collection yet. Run a filter, then tap “Save current query”.
          </Text>
        ) : (
          <FlatList
            data={queries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View
                style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Pressable
                  style={styles.rowMain}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    onApply(item);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Apply saved query"
                >
                  <Text
                    style={[typo.caption, { color: colors.text, fontFamily: monoFontFamily }]}
                    numberOfLines={3}
                  >
                    {queryPreviewLine(item)}
                  </Text>
                  {item.builderClauses.length > 0 && item.filterText.trim() ? (
                    <Text style={[typo.caption, { color: colors.textMuted, marginTop: 6 }]}>
                      + {item.builderClauses.length} visual filter(s)
                    </Text>
                  ) : null}
                  {item.builderClauses.length > 0 && !item.filterText.trim() ? (
                    <View style={{ marginTop: 6, gap: 4 }}>
                      {item.builderClauses.slice(0, 2).map((c, i) => (
                        <Text
                          key={i}
                          style={[typo.caption, { color: colors.textMuted, fontFamily: monoFontFamily }]}
                          numberOfLines={1}
                        >
                          {clauseSummary(c)}
                        </Text>
                      ))}
                      {item.builderClauses.length > 2 ? (
                        <Text style={[typo.caption, { color: colors.textMuted }]}>
                          +{item.builderClauses.length - 2} more
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => {
                    void Haptics.selectionAsync();
                    onDelete(item.id);
                  }}
                  hitSlop={10}
                  style={[styles.trash, { borderLeftColor: colors.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="Delete saved query"
                >
                  <Trash2 color={colors.danger} size={20} strokeWidth={2} />
                </Pressable>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  list: { padding: 16, paddingBottom: 32, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  rowMain: { flex: 1, padding: 14, paddingRight: 8 },
  trash: {
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
});
