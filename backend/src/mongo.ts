import { EJSON } from 'bson';
import { MongoClient, ObjectId, type Document, type Sort } from 'mongodb';

/** JSON bodies use hex strings or `{ $oid }`; queries need real BSON ObjectId. */
function normalizeFilterId(id: unknown): unknown {
  if (id instanceof ObjectId) return id;
  if (typeof id === 'string' && /^[a-fA-F\d]{24}$/.test(id)) {
    try {
      return new ObjectId(id);
    } catch {
      return id;
    }
  }
  if (id && typeof id === 'object' && !Array.isArray(id)) {
    const oid = (id as Record<string, unknown>).$oid;
    if (typeof oid === 'string' && /^[a-fA-F\d]{24}$/.test(oid)) {
      try {
        return new ObjectId(oid);
      } catch {
        return id;
      }
    }
  }
  return id;
}

/**
 * Validates a MongoDB connection URI to prevent SSRF attacks.
 * Only `mongodb://` and `mongodb+srv://` schemes are permitted, and
 * hostnames that resolve to private / loopback / link-local IP ranges
 * in the URI are rejected.
 */
export function validateMongoUri(uri: string): void {
  if (!/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
    throw new Error('Invalid MongoDB URI: must start with mongodb:// or mongodb+srv://');
  }

  // Extract host(s) from the URI for a simple pattern check.
  // Full DNS resolution is not done here; we block the most obvious literals.
  let hostsPart: string;
  try {
    // Strip the scheme so URL can parse it (URL requires a valid scheme)
    const withHttpScheme = uri.replace(/^mongodb(\+srv)?:\/\//i, 'http://');
    const parsed = new URL(withHttpScheme);
    hostsPart = parsed.hostname;
  } catch {
    throw new Error('Invalid MongoDB URI format');
  }

  // Block obviously private / loopback / metadata hostnames
  const BLOCKED = [
    /^localhost$/i,
    /^127\.\d+\.\d+\.\d+$/,
    /^0\.0\.0\.0$/,
    /^::1$/,
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
    /^192\.168\.\d+\.\d+$/,
    /^169\.254\.\d+\.\d+$/,        // link-local / AWS metadata
    /^fd[0-9a-f]{2}:/i,            // IPv6 unique-local
    /^fe80:/i,                     // IPv6 link-local
  ];

  for (const pattern of BLOCKED) {
    if (pattern.test(hostsPart)) {
      throw new Error(`MongoDB URI host is not allowed: ${hostsPart}`);
    }
  }
}

const SERVER_MS = 25_000;

export async function withMongoClient<T>(uri: string, fn: (client: MongoClient) => Promise<T>): Promise<T> {
  validateMongoUri(uri);
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: SERVER_MS,
    connectTimeoutMS: SERVER_MS,
    socketTimeoutMS: SERVER_MS,
  });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

export async function listDatabaseNames(uri: string): Promise<string[]> {
  const rows = await listDatabasesWithStats(uri);
  return rows.map((r) => r.name);
}

export type DatabaseStat = { name: string; sizeOnDiskBytes: number };

export async function listDatabasesWithStats(uri: string): Promise<DatabaseStat[]> {
  return withMongoClient(uri, async (client) => {
    const admin = client.db().admin();
    const r = await admin.listDatabases();
    const rows = (r.databases ?? [])
      .map((d) => ({
        name: typeof d.name === 'string' ? d.name : '',
        sizeOnDiskBytes:
          typeof d.sizeOnDisk === 'number' && Number.isFinite(d.sizeOnDisk) ? d.sizeOnDisk : 0,
      }))
      .filter((x) => x.name.length > 0);
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.name, row.sizeOnDiskBytes);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, sizeOnDiskBytes]) => ({ name, sizeOnDiskBytes }));
  });
}

export type CollectionStat = { name: string; estimatedCount: number | null };

export async function listCollectionsWithEstimates(uri: string, databaseName: string): Promise<CollectionStat[]> {
  return withMongoClient(uri, async (client) => {
    const db = client.db(databaseName);
    const cols = await db.listCollections().toArray();
    const names = cols.map((c) => c.name).filter((n): n is string => typeof n === 'string' && n.length > 0);
    const sorted = [...new Set(names)].sort((a, b) => a.localeCompare(b));
    const results = await Promise.all(
      sorted.map(async (name) => {
        try {
          const n = await db.collection(name).estimatedDocumentCount();
          return { name, estimatedCount: n } satisfies CollectionStat;
        } catch {
          return { name, estimatedCount: null } satisfies CollectionStat;
        }
      }),
    );
    return results;
  });
}

export async function listCollectionNames(uri: string, databaseName: string): Promise<string[]> {
  return withMongoClient(uri, async (client) => {
    const cols = await client.db(databaseName).listCollections().toArray();
    const names = cols.map((c) => c.name).filter((n): n is string => typeof n === 'string' && n.length > 0);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  });
}

export async function findDocuments(
  uri: string,
  databaseName: string,
  collectionName: string,
  options: { filter?: Document; limit?: number; skip?: number; sort?: Sort },
): Promise<Document[]> {
  return withMongoClient(uri, async (client) => {
    const col = client.db(databaseName).collection(collectionName);
    let cursor = col.find(options.filter ?? {});
    if (options.sort && Object.keys(options.sort).length > 0) {
      cursor = cursor.sort(options.sort);
    }
    const MAX_SKIP = 100_000;
    cursor = cursor.skip(Math.min(options.skip ?? 0, MAX_SKIP)).limit(Math.min(options.limit ?? 20, 200));
    return cursor.toArray();
  });
}

/** Materialize a new database by creating its first collection (MongoDB has no empty DB). */
export async function createDatabaseWithCollection(
  uri: string,
  databaseName: string,
  seedCollection: string,
): Promise<void> {
  const dbn = databaseName.trim();
  const coln = seedCollection.trim() || 'data';
  if (!dbn) throw new Error('database name is required');
  return withMongoClient(uri, async (client) => {
    await client.db(dbn).createCollection(coln);
  });
}

export async function createMongoCollection(
  uri: string,
  databaseName: string,
  collectionName: string,
): Promise<void> {
  const dbn = databaseName.trim();
  const cn = collectionName.trim();
  if (!dbn || !cn) throw new Error('database and collection names are required');
  return withMongoClient(uri, async (client) => {
    await client.db(dbn).createCollection(cn);
  });
}

export async function insertOneDocument(
  uri: string,
  databaseName: string,
  collectionName: string,
  document: Document,
): Promise<{ document: Record<string, unknown> }> {
  return withMongoClient(uri, async (client) => {
    const col = client.db(databaseName).collection(collectionName);
    const raw =
      document && typeof document === 'object' && !Array.isArray(document) ? { ...(document as object) } : {};
    const r = await col.insertOne(raw as Document);
    const withId = { ...raw, _id: r.insertedId } as Document;
    const serialized = EJSON.serialize(withId) as Record<string, unknown>;
    return { document: serialized };
  });
}

export async function replaceDocument(
  uri: string,
  databaseName: string,
  collectionName: string,
  replacement: Document,
): Promise<{ matchedCount: number }> {
  return withMongoClient(uri, async (client) => {
    const col = client.db(databaseName).collection(collectionName);
    const rawId = replacement._id;
    if (rawId === undefined) {
      throw new Error('replacement must include _id');
    }
    const id = normalizeFilterId(rawId);
    const toStore = { ...replacement, _id: id } as Document;
    const r = await col.replaceOne({ _id: id as Document['_id'] }, toStore);
    return { matchedCount: r.matchedCount };
  });
}

export async function deleteOneById(
  uri: string,
  databaseName: string,
  collectionName: string,
  rawId: unknown,
): Promise<{ deletedCount: number }> {
  return withMongoClient(uri, async (client) => {
    const col = client.db(databaseName).collection(collectionName);
    const id = normalizeFilterId(rawId);
    const r = await col.deleteOne({ _id: id as Document['_id'] });
    return { deletedCount: r.deletedCount };
  });
}

export async function dropMongoCollection(
  uri: string,
  databaseName: string,
  collectionName: string,
): Promise<void> {
  const dbn = databaseName.trim();
  const cn = collectionName.trim();
  if (!dbn || !cn) throw new Error('database and collection names are required');
  return withMongoClient(uri, async (client) => {
    const col = client.db(dbn).collection(cn);
    await col.drop();
  });
}
