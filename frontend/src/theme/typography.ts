import { Platform, TextStyle } from 'react-native';

/** Monospace for JSON keys, values, and query inputs */
export const monoFontFamily = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
}) as string;

export const typography = {
  title: { fontSize: 22, fontWeight: '600' as const },
  subtitle: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  mono: { fontFamily: monoFontFamily, fontSize: 14 } satisfies TextStyle,
};
