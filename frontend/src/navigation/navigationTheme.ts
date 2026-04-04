import type { Theme as NavTheme } from '@react-navigation/native';
import type { ThemeColors } from '../theme/colors';

export function buildNavigationTheme(colors: ThemeColors, dark: boolean): NavTheme {
  return {
    dark,
    colors: {
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.primary,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' },
      medium: { fontFamily: 'System', fontWeight: '500' },
      bold: { fontFamily: 'System', fontWeight: '700' },
      heavy: { fontFamily: 'System', fontWeight: '800' },
    },
  };
}
