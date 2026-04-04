import { create } from 'zustand';
import { asyncAppStorage } from '../storage/asyncAppStorage';

/** Document explorer: cards (compact), dense rows (list), pretty JSON (json). */
export type DocumentViewMode = 'compact' | 'list' | 'json';

export type PageSizeOption = 10 | 20 | 50;

/** `custom_ts` sorts by a user-configurable field and direction (see `customSortField`). */
export type DocumentSortPreset = 'id_desc' | 'custom_ts';

export type CustomSortDirection = 'asc' | 'desc';

const KEY_VIEW_MODE = 'settings_document_view_mode';
const KEY_PAGE_SIZE = 'settings_page_size';
const KEY_SORT = 'settings_sort_preset';
const KEY_CUSTOM_SORT_FIELD = 'settings_custom_sort_field';
const KEY_CUSTOM_SORT_DIR = 'settings_custom_sort_dir';

async function readViewMode(): Promise<DocumentViewMode> {
  const v = await asyncAppStorage.getString(KEY_VIEW_MODE);
  if (v === 'compact' || v === 'list' || v === 'json') return v;
  if (v === 'raw') return 'json';
  if (v === 'detailed') return 'list';
  return 'compact';
}

async function readPageSize(): Promise<PageSizeOption> {
  const v = await asyncAppStorage.getString(KEY_PAGE_SIZE);
  if (v === '10' || v === '20' || v === '50') return Number(v) as PageSizeOption;
  return 20;
}

async function readSort(): Promise<DocumentSortPreset> {
  const v = await asyncAppStorage.getString(KEY_SORT);
  if (v === 'id_desc' || v === 'custom_ts') return v;
  return 'id_desc';
}

async function readCustomSortField(): Promise<string> {
  const v = (await asyncAppStorage.getString(KEY_CUSTOM_SORT_FIELD))?.trim();
  return v && v.length > 0 ? v : 'updatedAt';
}

async function readCustomSortDir(): Promise<CustomSortDirection> {
  const v = await asyncAppStorage.getString(KEY_CUSTOM_SORT_DIR);
  if (v === 'asc' || v === 'desc') return v;
  return 'desc';
}

interface SettingsState {
  documentViewMode: DocumentViewMode;
  pageSize: PageSizeOption;
  sortPreset: DocumentSortPreset;
  /** Field name for `custom_ts` preset (e.g. updatedAt, createdAt). */
  customSortField: string;
  customSortDirection: CustomSortDirection;
  hydrate: () => Promise<void>;
  setDocumentViewMode: (mode: DocumentViewMode) => void;
  setPageSize: (n: PageSizeOption) => void;
  setSortPreset: (p: DocumentSortPreset) => void;
  setCustomSortField: (field: string) => void;
  setCustomSortDirection: (dir: CustomSortDirection) => void;
}

function normalizeCustomSortField(raw: string): string {
  const t = raw.trim();
  if (!t) return 'updatedAt';
  if (t.startsWith('$')) return 'updatedAt';
  return t.slice(0, 128);
}

export const useSettingsStore = create<SettingsState>((set) => ({
  documentViewMode: 'compact',
  pageSize: 20,
  sortPreset: 'id_desc',
  customSortField: 'updatedAt',
  customSortDirection: 'desc',

  hydrate: async () => {
    const [documentViewMode, pageSize, sortPreset, customSortField, customSortDirection] = await Promise.all([
      readViewMode(),
      readPageSize(),
      readSort(),
      readCustomSortField(),
      readCustomSortDir(),
    ]);
    set({ documentViewMode, pageSize, sortPreset, customSortField, customSortDirection });
  },

  setDocumentViewMode: (mode) => {
    void asyncAppStorage.setString(KEY_VIEW_MODE, mode);
    set({ documentViewMode: mode });
  },

  setPageSize: (pageSize) => {
    void asyncAppStorage.setString(KEY_PAGE_SIZE, String(pageSize));
    set({ pageSize });
  },

  setSortPreset: (sortPreset) => {
    void asyncAppStorage.setString(KEY_SORT, sortPreset);
    set({ sortPreset });
  },

  setCustomSortField: (field) => {
    const normalized = normalizeCustomSortField(field);
    void asyncAppStorage.setString(KEY_CUSTOM_SORT_FIELD, normalized);
    set({ customSortField: normalized });
  },

  setCustomSortDirection: (customSortDirection) => {
    void asyncAppStorage.setString(KEY_CUSTOM_SORT_DIR, customSortDirection);
    set({ customSortDirection });
  },
}));
