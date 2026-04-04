export type DatabaseNavigatorHighlight = { databaseName: string; collectionName: string };

let highlight: DatabaseNavigatorHighlight | null = null;

export function setDatabaseNavigatorHighlight(next: DatabaseNavigatorHighlight | null) {
  highlight = next;
}

export function peekDatabaseNavigatorHighlight(): DatabaseNavigatorHighlight | null {
  return highlight;
}
