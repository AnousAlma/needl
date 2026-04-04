import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'needl.';
/** Legacy namespace — migrated on read so existing installs keep settings. */
const LEGACY_PREFIX = 'mongogo.';

const KEY_SAVED_CONNECTIONS = 'saved_connections';

function parseJsonArray(raw: string | null): unknown[] | null {
  if (raw == null) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * If Needl bucket has an empty or invalid `saved_connections` but legacy still has rows,
 * prefer legacy and persist it under Needl. Otherwise returns null (use normal read path).
 */
function recoverSavedConnectionsFromLegacy(
  needlRaw: string | null,
  legacyRaw: string | null,
): string | null {
  const legacyArr = parseJsonArray(legacyRaw);
  if (legacyArr == null || legacyArr.length === 0) return null;
  if (needlRaw == null) return null;

  const needlArr = parseJsonArray(needlRaw);
  if (needlArr == null) return JSON.stringify(legacyArr);
  if (needlArr.length === 0) return JSON.stringify(legacyArr);
  return null;
}

/** Namespaced keys for Needl persisted preferences (Expo Go–compatible). */
export const asyncAppStorage = {
  async getString(key: string): Promise<string | null> {
    const k = `${STORAGE_PREFIX}${key}`;
    const legacyKey = `${LEGACY_PREFIX}${key}`;

    const [v, legacy] = await Promise.all([
      AsyncStorage.getItem(k),
      AsyncStorage.getItem(legacyKey),
    ]);

    if (key === KEY_SAVED_CONNECTIONS) {
      const recovered = recoverSavedConnectionsFromLegacy(v, legacy);
      if (recovered != null) {
        await AsyncStorage.setItem(k, recovered);
        if (legacy != null) await AsyncStorage.removeItem(legacyKey);
        return recovered;
      }
    }

    if (v != null) return v;
    if (legacy != null) {
      await AsyncStorage.setItem(k, legacy);
      await AsyncStorage.removeItem(legacyKey);
      return legacy;
    }
    return null;
  },

  async setString(key: string, value: string): Promise<void> {
    const k = `${STORAGE_PREFIX}${key}`;
    await AsyncStorage.setItem(k, value);
    await AsyncStorage.removeItem(`${LEGACY_PREFIX}${key}`);
  },

  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(`${STORAGE_PREFIX}${key}`);
    await AsyncStorage.removeItem(`${LEGACY_PREFIX}${key}`);
  },
};
