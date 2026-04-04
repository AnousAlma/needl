import { createConnectionId } from '../utils/createId';
import { asyncAppStorage } from './asyncAppStorage';

const STORAGE_KEY = 'explorer_saved_queries';
const MAX_PER_COLLECTION = 25;

export type SavedExplorerQuery = {
  id: string;
  filterText: string;
  builderClauses: Record<string, unknown>[];
  createdAt: number;
};

function scopeKey(connectionId: string, databaseName: string, collectionName: string): string {
  return JSON.stringify([connectionId, databaseName, collectionName]);
}

function fingerprint(filterText: string, builderClauses: Record<string, unknown>[]): string {
  return `${filterText.trim()}\n${JSON.stringify(builderClauses)}`;
}

function cloneClauses(clauses: Record<string, unknown>[]): Record<string, unknown>[] {
  return JSON.parse(JSON.stringify(clauses)) as Record<string, unknown>[];
}

async function readAll(): Promise<Record<string, SavedExplorerQuery[]>> {
  const raw = await asyncAppStorage.getString(STORAGE_KEY);
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    return o as Record<string, SavedExplorerQuery[]>;
  } catch {
    return {};
  }
}

async function writeAll(data: Record<string, SavedExplorerQuery[]>): Promise<void> {
  await asyncAppStorage.setString(STORAGE_KEY, JSON.stringify(data));
}

export async function loadSavedQueries(
  connectionId: string,
  databaseName: string,
  collectionName: string,
): Promise<SavedExplorerQuery[]> {
  const all = await readAll();
  const list = all[scopeKey(connectionId, databaseName, collectionName)];
  return Array.isArray(list) ? list : [];
}

export async function saveCurrentQuery(
  connectionId: string,
  databaseName: string,
  collectionName: string,
  filterText: string,
  builderClauses: Record<string, unknown>[],
): Promise<SavedExplorerQuery[]> {
  const key = scopeKey(connectionId, databaseName, collectionName);
  const all = await readAll();
  const prev = all[key] ?? [];
  const fp = fingerprint(filterText, builderClauses);
  const withoutDup = prev.filter((q) => fingerprint(q.filterText, q.builderClauses) !== fp);
  const entry: SavedExplorerQuery = {
    id: createConnectionId(),
    filterText,
    builderClauses: cloneClauses(builderClauses),
    createdAt: Date.now(),
  };
  const next = [entry, ...withoutDup].slice(0, MAX_PER_COLLECTION);
  all[key] = next;
  await writeAll(all);
  return next;
}

export async function deleteSavedQuery(
  connectionId: string,
  databaseName: string,
  collectionName: string,
  id: string,
): Promise<SavedExplorerQuery[]> {
  const key = scopeKey(connectionId, databaseName, collectionName);
  const all = await readAll();
  const prev = all[key] ?? [];
  const next = prev.filter((q) => q.id !== id);
  all[key] = next;
  await writeAll(all);
  return next;
}
