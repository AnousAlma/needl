import type { StoredConnection } from '../storage/connectionStorage';

/** Returns true when the saved record has Atlas Data API credentials (not legacy URI-only). */
export function isDataApiReady(conn: StoredConnection | null | undefined): boolean {
  return Boolean(conn?.appId?.trim() && conn.dataSource?.trim());
}

export function getDataApiBaseUrl(conn: StoredConnection): string {
  const host = conn.regionHost?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (host) {
    return `https://${host}/app/${conn.appId}/endpoint/data/v1`;
  }
  return `https://data.mongodb-api.com/app/${conn.appId}/endpoint/data/v1`;
}

export class DataApiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'DataApiRequestError';
  }
}

function parseErrorMessage(parsed: unknown, fallback: string): string {
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    const e = (parsed as { error: unknown }).error;
    if (typeof e === 'string' && e.length > 0) return e;
  }
  return fallback;
}

export async function dataApiAction(
  conn: StoredConnection,
  apiKey: string,
  action: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = `${getDataApiBaseUrl(conn)}/action/${action}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      apiKey,
    },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    if (!res.ok) {
      throw new DataApiRequestError(raw || res.statusText || 'Request failed', res.status);
    }
    throw new DataApiRequestError('Invalid response from server', res.status);
  }

  if (!res.ok) {
    throw new DataApiRequestError(parseErrorMessage(parsed, `HTTP ${res.status}`), res.status);
  }

  return parsed;
}

/**
 * Uses $listCollections on the given database. `anchorCollection` must exist in that database
 * (Data API requires a collection on aggregate requests).
 */
export async function listCollectionNames(
  conn: StoredConnection,
  apiKey: string,
  databaseName: string,
  anchorCollection: string,
): Promise<string[]> {
  const result = await dataApiAction(conn, apiKey, 'aggregate', {
    dataSource: conn.dataSource,
    database: databaseName,
    collection: anchorCollection,
    pipeline: [{ $listCollections: {} }],
  });

  if (!result || typeof result !== 'object') return [];
  const docs = (result as { documents?: unknown[] }).documents;
  if (!Array.isArray(docs)) return [];

  const names: string[] = [];
  for (const d of docs) {
    if (d && typeof d === 'object' && 'name' in d) {
      const n = (d as { name: unknown }).name;
      if (typeof n === 'string' && n.length > 0) names.push(n);
    }
  }
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

export async function findDocuments(
  conn: StoredConnection,
  apiKey: string,
  databaseName: string,
  collectionName: string,
  options: {
    filter?: Record<string, unknown>;
    limit?: number;
    skip?: number;
    sort?: Record<string, 1 | -1>;
  },
): Promise<unknown[]> {
  const body: Record<string, unknown> = {
    dataSource: conn.dataSource,
    database: databaseName,
    collection: collectionName,
    filter: options.filter ?? {},
    limit: options.limit ?? 20,
    skip: options.skip ?? 0,
  };
  if (options.sort && Object.keys(options.sort).length > 0) {
    body.sort = options.sort;
  }
  const result = await dataApiAction(conn, apiKey, 'find', body);

  if (!result || typeof result !== 'object') return [];
  const docs = (result as { documents?: unknown[] }).documents;
  return Array.isArray(docs) ? docs : [];
}

export async function insertOneDocument(
  conn: StoredConnection,
  apiKey: string,
  databaseName: string,
  collectionName: string,
  document: Record<string, unknown> = {},
): Promise<{ document: Record<string, unknown> }> {
  const result = (await dataApiAction(conn, apiKey, 'insertOne', {
    dataSource: conn.dataSource,
    database: databaseName,
    collection: collectionName,
    document,
  })) as { insertedId?: unknown; document?: Record<string, unknown> };

  if (result.document && typeof result.document === 'object' && !Array.isArray(result.document)) {
    return { document: result.document };
  }
  if (result.insertedId !== undefined) {
    return { document: { _id: result.insertedId } };
  }
  throw new DataApiRequestError('insertOne did not return an inserted id or document');
}

export async function replaceDocument(
  conn: StoredConnection,
  apiKey: string,
  databaseName: string,
  collectionName: string,
  replacement: Record<string, unknown>,
): Promise<void> {
  if (!('_id' in replacement)) {
    throw new DataApiRequestError('replacement must include _id');
  }
  await dataApiAction(conn, apiKey, 'replaceOne', {
    dataSource: conn.dataSource,
    database: databaseName,
    collection: collectionName,
    filter: { _id: replacement._id },
    replacement,
  });
}

export async function deleteOneById(
  conn: StoredConnection,
  apiKey: string,
  databaseName: string,
  collectionName: string,
  _id: unknown,
): Promise<{ deletedCount: number }> {
  const result = (await dataApiAction(conn, apiKey, 'deleteOne', {
    dataSource: conn.dataSource,
    database: databaseName,
    collection: collectionName,
    filter: { _id },
  })) as { deletedCount?: number };
  return { deletedCount: typeof result.deletedCount === 'number' ? result.deletedCount : 0 };
}

/** Lightweight check that credentials and rules allow reads on the anchor collection. */
export async function verifyDataApiAccess(
  conn: StoredConnection,
  apiKey: string,
  databaseName: string,
  anchorCollection: string,
): Promise<void> {
  await dataApiAction(conn, apiKey, 'findOne', {
    dataSource: conn.dataSource,
    database: databaseName,
    collection: anchorCollection,
    filter: {},
  });
}
