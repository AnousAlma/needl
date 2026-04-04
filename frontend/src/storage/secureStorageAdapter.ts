import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const WEB_PREFIX = 'needl_secure_';

function webStorageKey(key: string): string {
  return `${WEB_PREFIX}${key}`;
}

/**
 * expo-secure-store is inert on web (`ExpoSecureStore.web` is empty). Use localStorage so
 * Data API keys work in the browser (not hardware-backed; fine for local dev / PWA).
 */
export async function secureSetItem(
  key: string,
  value: string,
  options?: SecureStore.SecureStoreOptions,
): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(webStorageKey(key), value);
      }
    } catch {
      /* quota / private mode */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
    ...options,
  });
}

export async function secureGetItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(webStorageKey(key));
      }
    } catch {
      return null;
    }
    return null;
  }
  return SecureStore.getItemAsync(key);
}

export async function secureDeleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(webStorageKey(key));
      }
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
