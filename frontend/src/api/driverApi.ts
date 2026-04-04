import type { StoredConnection } from '../storage/connectionStorage';

/** MongoDB connection string saved on the connection (Compass-style URI). */
export function getConnectionMongoUri(conn: StoredConnection | null | undefined): string | null {
  if (!conn) return null;
  const u = (conn.atlasUri ?? conn.connectionString ?? '').trim();
  return u.length > 0 ? u : null;
}

export function isDriverBackendConfigured(): boolean {
  return Boolean(process.env.EXPO_PUBLIC_DRIVER_API_URL?.trim());
}

export function driverApiBaseUrl(): string {
  const u = process.env.EXPO_PUBLIC_DRIVER_API_URL?.trim().replace(/\/$/, '');
  if (!u) throw new DriverApiError('Needl server URL is not configured');
  return u;
}

/** Signed-in user + saved URI + driver base URL → wire-protocol browsing works. */
export function canBrowseWithDriver(conn: StoredConnection | null | undefined, userSignedIn: boolean): boolean {
  return isDriverBackendConfigured() && Boolean(getConnectionMongoUri(conn)) && userSignedIn;
}

export class DriverApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DriverApiError';
  }
}

async function driverPost<T>(path: string, idToken: string, body: Record<string, unknown>): Promise<T> {
  const url = `${driverApiBaseUrl()}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    if (!res.ok) throw new DriverApiError(raw || res.statusText || 'Request failed', res.status);
    throw new DriverApiError('Invalid response from server', res.status);
  }
  if (!res.ok) {
    const err =
      parsed && typeof parsed === 'object' && 'error' in parsed && typeof (parsed as { error: unknown }).error === 'string'
        ? (parsed as { error: string }).error
        : `HTTP ${res.status}`;
    throw new DriverApiError(err, res.status);
  }
  return parsed as T;
}

export type DriverDatabaseInfo = { name: string; sizeOnDiskBytes: number };

export async function driverListDatabases(uri: string, idToken: string): Promise<DriverDatabaseInfo[]> {
  const r = await driverPost<{ databases?: unknown }>('/v1/mongo/list-databases', idToken, { uri });
  const d = r.databases;
  if (!Array.isArray(d) || d.length === 0) return [];
  if (typeof d[0] === 'string') {
    return (d as string[]).map((name) => ({ name, sizeOnDiskBytes: 0 }));
  }
  return (d as { name?: string; sizeOnDiskBytes?: number }[])
    .filter((x): x is { name: string; sizeOnDiskBytes?: number } => typeof x?.name === 'string')
    .map((x) => ({
      name: x.name,
      sizeOnDiskBytes: typeof x.sizeOnDiskBytes === 'number' && Number.isFinite(x.sizeOnDiskBytes) ? x.sizeOnDiskBytes : 0,
    }));
}

export type DriverCollectionInfo = { name: string; estimatedCount: number | null };

export async function driverListCollectionsDetailed(
  uri: string,
  database: string,
  idToken: string,
): Promise<DriverCollectionInfo[]> {
  const r = await driverPost<{ collections?: DriverCollectionInfo[] }>(
    '/v1/mongo/list-collections-detailed',
    idToken,
    { uri, database },
  );
  if (!Array.isArray(r.collections)) return [];
  return r.collections.filter((c) => typeof c?.name === 'string');
}

export async function driverListCollections(uri: string, database: string, idToken: string): Promise<string[]> {
  const r = await driverPost<{ collections?: string[] }>('/v1/mongo/list-collections', idToken, { uri, database });
  return Array.isArray(r.collections) ? r.collections : [];
}

export async function driverFindDocuments(
  uri: string,
  database: string,
  collection: string,
  idToken: string,
  options: {
    filter?: Record<string, unknown>;
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
  },
): Promise<unknown[]> {
  const payload: Record<string, unknown> = {
    uri,
    database,
    collection,
    filter: options.filter ?? {},
    limit: options.limit ?? 20,
    skip: options.skip ?? 0,
  };
  if (options.sort && Object.keys(options.sort).length > 0) {
    payload.sort = options.sort;
  }
  const r = await driverPost<{ documents?: unknown[] }>('/v1/mongo/find', idToken, payload);
  return Array.isArray(r.documents) ? r.documents : [];
}

export async function driverCreateDatabase(
  uri: string,
  database: string,
  idToken: string,
  seedCollection = 'data',
): Promise<void> {
  await driverPost<{ ok?: boolean }>('/v1/mongo/create-database', idToken, {
    uri,
    database,
    seedCollection: seedCollection.trim() || 'data',
  });
}

export async function driverCreateCollection(
  uri: string,
  database: string,
  collection: string,
  idToken: string,
): Promise<void> {
  await driverPost<{ ok?: boolean }>('/v1/mongo/create-collection', idToken, {
    uri,
    database,
    collection,
  });
}

export async function driverInsertOne(
  uri: string,
  database: string,
  collection: string,
  idToken: string,
  document: Record<string, unknown> = {},
): Promise<{ document: Record<string, unknown> }> {
  const r = await driverPost<{ document?: Record<string, unknown> }>('/v1/mongo/insert-one', idToken, {
    uri,
    database,
    collection,
    document,
  });
  if (!r.document || typeof r.document !== 'object') {
    throw new DriverApiError('insert-one returned no document');
  }
  return { document: r.document };
}

export async function driverReplaceOne(
  uri: string,
  database: string,
  collection: string,
  idToken: string,
  replacement: Record<string, unknown>,
): Promise<{ matchedCount: number }> {
  const r = await driverPost<{ matchedCount?: number }>('/v1/mongo/replace-one', idToken, {
    uri,
    database,
    collection,
    replacement,
  });
  return { matchedCount: typeof r.matchedCount === 'number' ? r.matchedCount : 0 };
}

export async function driverDeleteOne(
  uri: string,
  database: string,
  collection: string,
  idToken: string,
  _id: unknown,
): Promise<{ deletedCount: number }> {
  const r = await driverPost<{ deletedCount?: number }>('/v1/mongo/delete-one', idToken, {
    uri,
    database,
    collection,
    _id,
  });
  return { deletedCount: typeof r.deletedCount === 'number' ? r.deletedCount : 0 };
}

export async function driverDropCollection(
  uri: string,
  database: string,
  collection: string,
  idToken: string,
): Promise<void> {
  await driverPost<{ ok?: boolean }>('/v1/mongo/drop-collection', idToken, {
    uri,
    database,
    collection,
  });
}
