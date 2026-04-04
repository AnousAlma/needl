/** MongoDB Atlas-style accents for the “New Connection” flow (works in light + dark). */
export const atlasUi = {
  /** Compass / Atlas primary green for outlined actions */
  actionGreen: '#00684A',
  actionGreenMuted: '#004D37',
  helpCardBgLight: '#F4F6F8',
  helpCardBgDark: '#0A2F3D',
  helpCardBorderLight: '#E2E8F0',
  helpCardBorderDark: '#134E66',
  fieldBorderLight: '#D1D5DB',
  fieldBorderDark: '#2A4A5C',
};

export type ConnectionColorTag =
  | 'none'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'orange'
  | 'red';

export const CONNECTION_COLOR_OPTIONS: { tag: ConnectionColorTag; hex: string | null; label: string }[] = [
  { tag: 'none', hex: null, label: 'No color' },
  { tag: 'green', hex: '#00ED64', label: 'Green' },
  { tag: 'teal', hex: '#14B8A6', label: 'Teal' },
  { tag: 'blue', hex: '#3B82F6', label: 'Blue' },
  { tag: 'purple', hex: '#8B5CF6', label: 'Purple' },
  { tag: 'orange', hex: '#F97316', label: 'Orange' },
  { tag: 'red', hex: '#EF4444', label: 'Red' },
];

export function colorHexForTag(tag: ConnectionColorTag | undefined): string | null {
  const o = CONNECTION_COLOR_OPTIONS.find((c) => c.tag === (tag ?? 'none'));
  return o?.hex ?? null;
}
