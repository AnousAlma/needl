import { create } from 'zustand';
import { deleteConnectionFromCloud, pushConnectionToCloud } from '../firebase/pushConnectionToCloud';
import type { ConnectionColorTag } from '../theme/atlasConnectionUi';
import type { StoredConnection } from '../storage/connectionStorage';
import { connectionStorage } from '../storage/connectionStorage';

export type NewConnectionInput = {
  name: string;
  appId: string;
  dataSource: string;
  regionHost?: string;
  defaultDatabase?: string;
  listingAnchorCollection?: string;
  atlasUri?: string;
  favorite?: boolean;
  colorTag?: ConnectionColorTag;
};

interface ConnectionStoreState {
  connections: StoredConnection[];
  activeConnectionId: string | null;
  hydrate: () => Promise<void>;
  /** Clear all connections and keys from device storage (e.g. after account deletion). */
  clearAll: () => Promise<void>;
  setActiveConnectionId: (id: string | null) => void;
  addSavedConnection: (input: NewConnectionInput, apiKey: string) => Promise<StoredConnection>;
  addCompassUriConnection: (input: {
    name: string;
    uri: string;
    favorite?: boolean;
    colorTag?: ConnectionColorTag;
  }) => Promise<StoredConnection>;
  removeConnection: (id: string) => Promise<void>;
}

export const useConnectionStore = create<ConnectionStoreState>((set, get) => ({
  connections: [],
  activeConnectionId: null,

  hydrate: async () => {
    const connections = await connectionStorage.getAll();
    set({ connections });
  },

  clearAll: async () => {
    await connectionStorage.clearAll();
    set({ connections: [], activeConnectionId: null });
  },

  setActiveConnectionId: (id) => set({ activeConnectionId: id }),

  addSavedConnection: async (input, apiKey) => {
    const record = await connectionStorage.save(input, apiKey);
    set({ connections: await connectionStorage.getAll() });
    pushConnectionToCloud(record);
    return record;
  },

  addCompassUriConnection: async (input) => {
    const record = await connectionStorage.saveCompassUriOnly(input);
    set({ connections: await connectionStorage.getAll() });
    pushConnectionToCloud(record);
    return record;
  },

  removeConnection: async (id) => {
    await connectionStorage.delete(id);
    deleteConnectionFromCloud(id);
    const { activeConnectionId } = get();
    set({
      connections: await connectionStorage.getAll(),
      activeConnectionId: activeConnectionId === id ? null : activeConnectionId,
    });
  },
}));
