import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Platform } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { AuthStackParamList } from '../types/authNavigation';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.secondary,
        headerTitleStyle: { color: colors.text, fontWeight: '600' },
        contentStyle: { backgroundColor: colors.background },
        ...(Platform.OS === 'ios'
          ? {
              scrollEdgeEffects: {
                top: 'hidden' as const,
                bottom: 'hidden' as const,
                left: 'hidden' as const,
                right: 'hidden' as const,
              },
            }
          : {}),
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Register' }} />
    </Stack.Navigator>
  );
}
