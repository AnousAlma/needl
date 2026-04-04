export type ColorSchemeName = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  primary: string;
  secondary: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  danger: string;
  /** Inputs / nested cards (Figma ~#2A2A2A dark) */
  inputSurface: string;
  /** Right accent stripe on connection cards (Compass-inspired) */
  cardAccent: string;
  /** JSON / BSON preview */
  syntaxKey: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxBoolean: string;
  syntaxNull: string;
  syntaxPunctuation: string;
  /** BSON ObjectId (Compass terracotta) */
  syntaxObjectId: string;
  /** JSON editor / preview (Compass: white keys + punct, green value strings, warm numbers) */
  syntaxJsonKey: string;
  syntaxJsonStringValue: string;
  syntaxJsonNumber: string;
  syntaxJsonPunct: string;
  syntaxJsonKeyword: string;
  syntaxJsonNull: string;
}

export const lightColors: ThemeColors = {
  background: '#F9FAFB',
  primary: '#00ED64',
  secondary: '#00684A',
  surface: '#FFFFFF',
  text: '#111827',
  textMuted: '#6B7280',
  border: '#E5E7EB',
  danger: '#DC2626',
  inputSurface: '#F3F4F6',
  cardAccent: '#E58934',
  syntaxKey: '#1D4ED8',
  syntaxString: '#059669',
  syntaxNumber: '#EA580C',
  syntaxBoolean: '#2563EB',
  syntaxNull: '#6B7280',
  syntaxPunctuation: '#374151',
  syntaxObjectId: '#9B4B1D',
  syntaxJsonKey: '#111827',
  syntaxJsonStringValue: '#059669',
  syntaxJsonNumber: '#C2410C',
  syntaxJsonPunct: '#374151',
  syntaxJsonKeyword: '#1D4ED8',
  syntaxJsonNull: '#6B7280',
};

/** Dark UI — Needl / Document Explorer canvas (#222421) */
export const darkColors: ThemeColors = {
  background: '#222421',
  primary: '#00ED64',
  secondary: '#00ED64',
  surface: '#1E1E1E',
  text: '#FFFFFF',
  textMuted: '#A3A3A3',
  border: '#2E2E2E',
  danger: '#F87171',
  inputSurface: '#2A2A2A',
  cardAccent: '#E58934',
  syntaxKey: '#E5E5E5',
  syntaxString: '#00ED64',
  syntaxNumber: '#FFB366',
  syntaxBoolean: '#6BA3FF',
  syntaxNull: '#888888',
  syntaxPunctuation: '#737373',
  syntaxObjectId: '#E8A07A',
  syntaxJsonKey: '#FFFFFF',
  syntaxJsonStringValue: '#00ED64',
  syntaxJsonNumber: '#E8A876',
  syntaxJsonPunct: '#FFFFFF',
  syntaxJsonKeyword: '#FFFFFF',
  syntaxJsonNull: '#A3A3A3',
};

export function getColors(scheme: ColorSchemeName): ThemeColors {
  return scheme === 'dark' ? darkColors : lightColors;
}
