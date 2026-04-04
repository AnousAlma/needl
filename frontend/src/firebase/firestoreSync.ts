import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
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
