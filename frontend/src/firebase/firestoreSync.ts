import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import type { StoredConnection } from '../storage/connectionStorage';
import { db } from './config';

/** Non-secret metadata only — never store Atlas URI or API keys here. */
export async function syncConnectionMetadata(uid: string, c: StoredConnection): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'connections', c.id),
    {
      name: c.name,
      favorite: Boolean(c.favorite),
      colorTag: c.colorTag ?? null,
      dataSource: c.dataSource || 'mongodb-atlas',
      appId: c.appId || '',
      regionHost: c.regionHost ?? null,
      defaultDatabase: c.defaultDatabase ?? null,
      listingAnchorCollection: c.listingAnchorCollection ?? null,
      hasDataApi: Boolean(c.appId?.trim()),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function removeConnectionMetadata(uid: string, connectionId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'connections', connectionId));
}

export async function ensureUserDocument(uid: string, email: string | null): Promise<void> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  await setDoc(
    ref,
    {
      email: email ?? null,
      updatedAt: serverTimestamp(),
      ...(snap.exists() ? {} : { createdAt: serverTimestamp() }),
    },
    { merge: true },
  );
}

const FIRESTORE_BATCH_LIMIT = 500;

/**
 * Deletes all Firestore data for this user: `users/{uid}/connections/*` then `users/{uid}`.
 * Call while authenticated as this user (after re-auth if required).
 */
export async function deleteAllUserFirestoreData(uid: string): Promise<void> {
  const connectionsCol = collection(db, 'users', uid, 'connections');
  const snapshot = await getDocs(connectionsCol);
  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + FIRESTORE_BATCH_LIMIT)) {
      batch.delete(d.ref);
    }
    await batch.commit();
  }
  await deleteDoc(doc(db, 'users', uid));
}
