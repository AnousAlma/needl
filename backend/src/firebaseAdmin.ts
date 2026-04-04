import fs from 'node:fs';
import path from 'node:path';
import firebaseAdmin from 'firebase-admin';

let initialized = false;

/** PEM in .env is usually one line with literal `\n` sequences — convert to real newlines. */
function normalizePrivateKeyFromEnv(raw: string): string {
  const t = raw.trim().replace(/^["']|["']$/g, '');
  if (!t) return t;
  return t.replace(/\\n/g, '\n');
}

function initFromEnvVars(): void {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? normalizePrivateKeyFromEnv(process.env.FIREBASE_PRIVATE_KEY)
    : '';

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY (from the service account JSON: project_id, client_email, private_key). Or set FIREBASE_SERVICE_ACCOUNT_PATH.',
    );
  }

  firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

function initFromServiceAccountFile(): void {
  const p = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (!p) {
    throw new Error(
      'Firebase Admin: set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY — or FIREBASE_SERVICE_ACCOUNT_PATH to a service account JSON file.',
    );
  }
  const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  if (!fs.existsSync(abs)) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_PATH not found: ${abs}`);
  }
  const json = JSON.parse(fs.readFileSync(abs, 'utf8')) as firebaseAdmin.ServiceAccount;
  firebaseAdmin.initializeApp({
    credential: firebaseAdmin.credential.cert(json),
  });
}

export function initFirebaseAdmin(): void {
  if (initialized) return;

  const hasEnvCert =
    Boolean(process.env.FIREBASE_PROJECT_ID?.trim()) &&
    Boolean(process.env.FIREBASE_CLIENT_EMAIL?.trim()) &&
    Boolean(process.env.FIREBASE_PRIVATE_KEY?.trim());

  if (hasEnvCert) {
    initFromEnvVars();
  } else {
    initFromServiceAccountFile();
  }
  initialized = true;
}

export async function verifyIdToken(idToken: string): Promise<string> {
  initFirebaseAdmin();
  const decoded = await firebaseAdmin.auth().verifyIdToken(idToken);
  if (!decoded.uid) throw new Error('Token missing uid');
  return decoded.uid;
}
