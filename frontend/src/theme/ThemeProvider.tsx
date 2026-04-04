import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import type { ColorSchemeName, ThemeColors } from './colors';
import { getColors } from './colors';
import { monoFontFamily, typography } from './typography';

export interface Theme {
  colors: ThemeColors;
  scheme: ColorSchemeName;
  monoFontFamily: string;
  typography: typeof typography;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const scheme: ColorSchemeName = system === 'dark' ? 'dark' : 'light';

  const value = useMemo<Theme>(
    () => ({
      colors: getColors(scheme),
      scheme,
      monoFontFamily,
      typography,
    }),
    [scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
