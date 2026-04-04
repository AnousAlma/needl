import type { ConnectionColorTag } from '../theme/atlasConnectionUi';
import { createConnectionId } from '../utils/createId';
import { asyncAppStorage } from './asyncAppStorage';
import { secureDeleteItem, secureGetItem, secureSetItem } from './secureStorageAdapter';

const KEY_CONNECTIONS = 'saved_connections';

/** Unchanged prefix so existing SecureStore entries keep working after rebrand. */
const SECURE_API_KEY_PREFIX = 'mongogo_conn_api_';

export interface StoredConnection {
  id: string;
  name: string;
  createdAt: number;
  /** Atlas App Services / Data API App ID */
  appId: string;
  /** Linked cluster name in the app (often `mongodb-atlas`) */
  dataSource: string;
  /** Regional host only, e.g. `us-east-1.aws.data.mongodb.com` — omit for global endpoint */
  regionHost?: string;
  defaultDatabase?: string;
  /**
   * Any collection that exists in each database you browse — used only as the aggregate target
   * for `$listCollections`. Must exist in that database.
   */
  listingAnchorCollection?: string;
  /** Pasted URI (Atlas-style); mobile still uses Data API under the hood */
  atlasUri?: string;
  favorite?: boolean;
  colorTag?: ConnectionColorTag;
  /** Legacy saves before Data API — open connection card will prompt to re-add */
  connectionString?: string;
}

const KEY_LEGACY = 'connectionString';

async function readRawList(): Promise<unknown[]> {
  const raw = await asyncAppStorage.getString(KEY_CONNECTIONS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseRow(raw: unknown): StoredConnection | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string' || typeof o.createdAt !== 'number') {
    return null;
  }

  const appId = typeof o.appId === 'string' ? o.appId.trim() : '';
  const dataSource = typeof o.dataSource === 'string' ? o.dataSource.trim() : '';
  const legacyCs = typeof o[KEY_LEGACY] === 'string' ? o[KEY_LEGACY] : undefined;

  if (appId && dataSource) {
    const colorRaw = o.colorTag;
    const colorTag =
      colorRaw === 'green' ||
      colorRaw === 'teal' ||
      colorRaw === 'blue' ||
      colorRaw === 'purple' ||
      colorRaw === 'orange' ||
      colorRaw === 'red' ||
      colorRaw === 'none'
        ? colorRaw
        : undefined;
    return {
      id: o.id,
      name: o.name,
      createdAt: o.createdAt,
      appId,
      dataSource,
      regionHost: typeof o.regionHost === 'string' ? o.regionHost.trim() || undefined : undefined,
      defaultDatabase:
        typeof o.defaultDatabase === 'string' ? o.defaultDatabase.trim() || undefined : undefined,
      listingAnchorCollection:
        typeof o.listingAnchorCollection === 'string'
          ? o.listingAnchorCollection.trim() || undefined
          : undefined,
      atlasUri: typeof o.atlasUri === 'string' ? o.atlasUri.trim() || undefined : undefined,
      favorite: typeof o.favorite === 'boolean' ? o.favorite : undefined,
      colorTag,
    };
  }

  if (legacyCs) {
    const colorRaw = o.colorTag;
    const colorTag =
      colorRaw === 'green' ||
      colorRaw === 'teal' ||
      colorRaw === 'blue' ||
      colorRaw === 'purple' ||
      colorRaw === 'orange' ||
      colorRaw === 'red' ||
      colorRaw === 'none'
        ? colorRaw
        : undefined;
    return {
      id: o.id,
      name: o.name,
      createdAt: o.createdAt,
      appId: '',
      dataSource: 'mongodb-atlas',
      connectionString: legacyCs,
      atlasUri: typeof o.atlasUri === 'string' ? o.atlasUri.trim() || undefined : legacyCs,
      favorite: typeof o.favorite === 'boolean' ? o.favorite : undefined,
      colorTag,
    };
  }

  return null;
}

async function readConnections(): Promise<StoredConnection[]> {
  const rows = await readRawList();
  const out: StoredConnection[] = [];
  for (const row of rows) {
    const c = parseRow(row);
    if (c) out.push(c);
  }
  return out;
}

async function writeConnections(list: StoredConnection[]): Promise<void> {
  await asyncAppStorage.setString(KEY_CONNECTIONS, JSON.stringify(list));
}

function secureApiKeyKey(connectionId: string): string {
  return `${SECURE_API_KEY_PREFIX}${connectionId}`;
}

/** @deprecated Use secureApiKeyKey — kept for reading keys saved under the old prefix */
const LEGACY_PASSWORD_PREFIX = 'mongogo_conn_pwd_';

function legacyPasswordKey(connectionId: string): string {
  return `${LEGACY_PASSWORD_PREFIX}${connectionId}`;
}

function newConnectionId(): string {
  return createConnectionId();
}

function sortConnections(list: StoredConnection[]): StoredConnection[] {
  return [...list].sort((a, b) => {
    const fa = a.favorite ? 1 : 0;
    const fb = b.favorite ? 1 : 0;
    if (fa !== fb) return fb - fa;
    return b.createdAt - a.createdAt;
  });
}

export const connectionStorage = {
  async getAll(): Promise<StoredConnection[]> {
    const list = await readConnections();
    return sortConnections(list);
  },

  async getById(id: string): Promise<StoredConnection | undefined> {
    return (await readConnections()).find((c) => c.id === id);
  },

  /**
   * Compass-style: only a pasted URI (no Data API yet). Stored as on-device reference;
   * browsing data still requires completing Advanced / Data API later.
   */
  async saveCompassUriOnly(input: {
    name: string;
    uri: string;
    favorite?: boolean;
    colorTag?: ConnectionColorTag;
  }): Promise<StoredConnection> {
    const id = newConnectionId();
    const uri = input.uri.trim();
    const wire: Record<string, unknown> = {
      id,
      name: input.name.trim() || 'MongoDB',
      createdAt: Date.now(),
      connectionString: uri,
      atlasUri: uri,
    };
    if (input.favorite) wire.favorite = true;
    if (input.colorTag && input.colorTag !== 'none') wire.colorTag = input.colorTag;

    const rows = await readRawList();
    rows.push(wire);
    await asyncAppStorage.setString(KEY_CONNECTIONS, JSON.stringify(rows));

    const parsed = parseRow(wire);
    if (!parsed) {
      throw new Error('Failed to persist connection');
    }
    return parsed;
  },

  async save(
    input: {
      name: string;
      appId: string;
      dataSource: string;
      regionHost?: string;
      defaultDatabase?: string;
      listingAnchorCollection?: string;
      atlasUri?: string;
      favorite?: boolean;
      colorTag?: ConnectionColorTag;
      id?: string;
    },
    apiKey: string,
  ): Promise<StoredConnection> {
    const id = input.id ?? newConnectionId();
    const all = await readConnections();
    const prev = all.find((c) => c.id === id);
    const existing = all.filter((c) => c.id !== id);
    const record: StoredConnection = {
      id,
      name: input.name.trim(),
      createdAt: prev?.createdAt ?? Date.now(),
      appId: input.appId.trim(),
      dataSource: (input.dataSource.trim() || 'mongodb-atlas'),
      regionHost: input.regionHost?.trim() || undefined,
      defaultDatabase: input.defaultDatabase?.trim() || undefined,
      listingAnchorCollection: input.listingAnchorCollection?.trim() || undefined,
      atlasUri: input.atlasUri?.trim() || undefined,
      favorite: input.favorite ?? false,
      colorTag: input.colorTag && input.colorTag !== 'none' ? input.colorTag : undefined,
    };
    existing.push(record);
    await writeConnections(sortConnections(existing));

    await secureSetItem(secureApiKeyKey(id), apiKey);

    return record;
  },

  async delete(id: string): Promise<void> {
    const next = (await readConnections()).filter((c) => c.id !== id);
    await writeConnections(next);
    await secureDeleteItem(secureApiKeyKey(id));
    await secureDeleteItem(legacyPasswordKey(id));
  },

  /** Data API key (or legacy “password” field used as API key). */
  async getApiKey(id: string): Promise<string | null> {
    const next = await secureGetItem(secureApiKeyKey(id));
    if (next) return next;
    return secureGetItem(legacyPasswordKey(id));
  },

  async updateApiKey(id: string, apiKey: string): Promise<void> {
    await secureSetItem(secureApiKeyKey(id), apiKey);
  },
};
