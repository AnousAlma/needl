import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { buildNavigationTheme } from './navigationTheme';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';

export function AppNavigator() {
  const { colors, scheme } = useTheme();
  const { user, loading } = useAuth();
  const navTheme = buildNavigationTheme(colors, scheme === 'dark');

  if (loading) {
    return (
      <View style={[styles.splash, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {user ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
