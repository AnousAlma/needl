import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { RootStackParamList } from '../types/navigation';
import { useConnectionStore } from '../store/connectionStore';
import { useSettingsStore } from '../store/settingsStore';
import { NeedlHomeHeaderTitle } from '../components/NeedlHomeHeaderTitle';
import { ConnectionsHomeScreen } from '../screens/ConnectionsHomeScreen';
import { AddConnectionScreen } from '../screens/AddConnectionScreen';
import { DatabasesScreen } from '../screens/DatabasesScreen';
import { DocumentEditScreen } from '../screens/DocumentEditScreen';
import { DocumentExplorerScreen } from '../screens/DocumentExplorerScreen';
import { SupportDonateModalProvider } from '../contexts/SupportDonateModalContext';
import { SettingsScreen } from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Main app stack (shown after Firebase sign-in). */
export function MainNavigator() {
  const { colors } = useTheme();
  const hydrateConnections = useConnectionStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);

  useEffect(() => {
    void Promise.all([hydrateConnections(), hydrateSettings()]);
  }, [hydrateConnections, hydrateSettings]);

  return (
    <SupportDonateModalProvider>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text, fontWeight: '700', fontSize: 20 },
          headerBackButtonDisplayMode: 'minimal',
          gestureEnabled: true,
          fullScreenGestureEnabled: Platform.OS === 'ios',
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
        <Stack.Screen
          name="ConnectionsHome"
          component={ConnectionsHomeScreen}
          options={{
            headerTitle: () => (
              <NeedlHomeHeaderTitle textColor={colors.text} markBackgroundColor={colors.background} />
            ),
          }}
        />
        <Stack.Screen
          name="AddConnection"
          component={AddConnectionScreen}
          options={{ title: 'Add Connection', headerBackTitle: 'Back' }}
        />
        <Stack.Screen
          name="Databases"
          component={DatabasesScreen}
          options={{ title: 'Database navigator' }}
        />
        <Stack.Screen
          name="DocumentExplorer"
          component={DocumentExplorerScreen}
          options={{ title: 'Documents' }}
        />
        <Stack.Screen
          name="DocumentEdit"
          component={DocumentEditScreen}
          options={{ title: 'Edit document', headerBackTitle: 'Back' }}
        />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      </Stack.Navigator>
    </SupportDonateModalProvider>
  );
}
