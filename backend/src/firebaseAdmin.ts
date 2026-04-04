import fs from 'node:fs';
import path from 'node:path';
import firebaseAdmin from 'firebase-admin';

let initialized = false;

export function initFirebaseAdmin(): void {
  if (initialized) return;
  const p = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!p) {
    throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH to your Firebase service account JSON path');
  }
  const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  if (!fs.existsSync(abs)) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_PATH not found: ${abs}`);
  }
  const json = JSON.parse(fs.readFileSync(abs, 'utf8')) as firebaseAdmin.ServiceAccount;
  firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(json),
  });
  initialized = true;
}

export async function verifyIdToken(idToken: string): Promise<string> {
  initFirebaseAdmin();
  const decoded = await firebaseAdmin.auth().verifyIdToken(idToken);
  if (!decoded.uid) throw new Error('Token missing uid');
  return decoded.uid;
}
