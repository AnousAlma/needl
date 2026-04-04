import { getAuth } from 'firebase/auth';
import type { StoredConnection } from '../storage/connectionStorage';
import { removeConnectionMetadata, syncConnectionMetadata } from './firestoreSync';

export function pushConnectionToCloud(record: StoredConnection): void {
  const u = getAuth().currentUser;
  if (!u) return;
  void syncConnectionMetadata(u.uid, record).catch((err) => {
    if (__DEV__) {
      console.warn('[Needl] Firestore sync failed', err);
    }
  });
}

export function deleteConnectionFromCloud(connectionId: string): void {
  const u = getAuth().currentUser;
  if (!u) return;
  void removeConnectionMetadata(u.uid, connectionId).catch((err) => {
    if (__DEV__) {
      console.warn('[Needl] Firestore delete failed', err);
    }
  });
}
