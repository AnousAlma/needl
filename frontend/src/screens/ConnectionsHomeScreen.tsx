import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Plus, Settings, Star, Trash2 } from 'lucide-react-native';
import { useCallback, useLayoutEffect, useRef } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isDataApiReady } from '../api/atlasDataApi';
import { canBrowseWithDriver, getConnectionMongoUri } from '../api/driverApi';
import { useAuth } from '../contexts/AuthContext';
import type { StoredConnection } from '../storage/connectionStorage';
import { colorHexForTag } from '../theme/atlasConnectionUi';
import { useConnectionStore } from '../store/connectionStore';
import type { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeProvider';
import { summarizeUriForDisplay } from '../utils/mongoUri';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type ConnectionRowProps = {
  item: StoredConnection;
  user: ReturnType<typeof useAuth>['user'];
  colors: ReturnType<typeof useTheme>['colors'];
  typo: ReturnType<typeof useTheme>['typography'];
  monoFontFamily: string;
  onNavigate: () => void;
  onRemove: (id: string) => Promise<void>;
};

function ConnectionRow({
  item,
  user,
  colors,
  typo,
  monoFontFamily,
  onNavigate,
  onRemove,
}: ConnectionRowProps) {
  const swipeRef = useRef<Swipeable>(null);
  const browseReady = isDataApiReady(item) || canBrowseWithDriver(item, Boolean(user));
  const uri = getConnectionMongoUri(item);
  const uriLine = uri ? summarizeUriForDisplay(uri, 56) : null;

  const closeSwipe = () => {
    swipeRef.current?.close();
  };

  const askRemove = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Remove connection',
      `Remove "${item.name}" from this device? Saved keys for this connection will be deleted.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: closeSwipe },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await onRemove(item.id);
              closeSwipe();
            })();
          },
        },
      ],
      { cancelable: true, onDismiss: closeSwipe },
    );
  };

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    _dragX: Animated.AnimatedInterpolation<number>,
  ) => (
    <Pressable
      onPress={askRemove}
      accessibilityRole="button"
      accessibilityLabel="Remove connection"
      style={({ pressed }) => [
        styles.swipeDeleteBtn,
        {
          backgroundColor: colors.danger,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <Trash2 color="#FFFFFF" size={22} />
    </Pressable>
  );

  return (
    <View style={styles.swipeRow}>
      <Swipeable
        ref={swipeRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        friction={2}
        rightThreshold={48}
      >
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            onNavigate();
          }}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRightColor: colors.cardAccent,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          {colorHexForTag(item.colorTag) ? (
            <View style={[styles.colorBar, { backgroundColor: colorHexForTag(item.colorTag)! }]} />
          ) : (
            <View style={styles.colorBarPlaceholder} />
          )}

          <View style={styles.cardBody}>
            <View style={styles.titleRow}>
              {item.favorite ? (
                <Star size={16} color={colors.primary} fill={colors.primary} style={{ marginRight: 6 }} />
              ) : null}
              <Text style={[typo.subtitle, { color: colors.text, flex: 1, fontWeight: '700' }]} numberOfLines={1}>
                {item.name}
              </Text>
            </View>
            {uriLine ? (
              <Text
                style={[
                  styles.uriText,
                  {
                    fontFamily: monoFontFamily,
                    color: browseReady ? '#6BA3FF' : colors.textMuted,
                    textDecorationLine: browseReady ? 'underline' : 'none',
                  },
                ]}
                numberOfLines={2}
              >
                {uriLine}
              </Text>
            ) : !browseReady ? (
              <Text style={[typo.caption, { color: colors.textMuted, marginTop: 4 }]}>
                Sign in or finish connection setup to browse
              </Text>
            ) : null}
          </View>

          <View
            style={[
              styles.statusDot,
              { backgroundColor: browseReady ? colors.primary : '#6B7280' },
            ]}
          />
        </Pressable>
      </Swipeable>
    </View>
  );
}

export function ConnectionsHomeScreen() {
  const { colors, typography: typo, monoFontFamily } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const connections = useConnectionStore((s) => s.connections);
  const removeConnection = useConnectionStore((s) => s.removeConnection);

  const openSettings = useCallback(() => {
    void Haptics.selectionAsync();
    navigation.navigate('Settings');
  }, [navigation]);

  const openAdd = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('AddConnection');
  }, [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={openSettings}
          hitSlop={12}
          style={{ marginRight: 5, paddingLeft: 3, transform: [{ translateX: 2 }] }}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Settings color={colors.text} size={24} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, openSettings, colors.text]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={connections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={[typo.body, { color: colors.textMuted, textAlign: 'center', marginTop: 48 }]}>
            No connections yet. Tap + to add one. Data stays on this device.
          </Text>
        }
        renderItem={({ item }) => (
          <ConnectionRow
            item={item}
            user={user}
            colors={colors}
            typo={typo}
            monoFontFamily={monoFontFamily}
            onNavigate={() =>
              navigation.navigate('Databases', {
                connectionId: item.id,
                connectionName: item.name,
              })
            }
            onRemove={removeConnection}
          />
        )}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add connection"
        onPress={openAdd}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: colors.primary,
            opacity: pressed ? 0.9 : 1,
            bottom: 24 + insets.bottom,
          },
        ]}
      >
        <Plus color="#0A0A0A" size={28} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 120,
    paddingTop: 12,
    flexGrow: 1,
  },
  swipeRow: {
    marginBottom: 12,
  },
  swipeDeleteBtn: {
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    marginLeft: 8,
    alignSelf: 'stretch',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 16,
    paddingLeft: 12,
    paddingRight: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRightWidth: 3,
  },
  colorBar: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginRight: 2,
  },
  colorBarPlaceholder: {
    width: 4,
    marginRight: 2,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  uriText: {
    fontSize: 12,
    marginTop: 6,
    lineHeight: 17,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
});
