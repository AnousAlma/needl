import { CommonActions, type NavigationProp } from '@react-navigation/native';
import type { RootStackParamList } from '../types/navigation';

/**
 * Replaces the stack so DocumentExplorer is shown with a fixed back chain:
 * Explorer → Databases → ConnectionsHome.
 * Use after save/delete from DocumentEdit so Back never returns to Edit.
 */
export function resetStackToDocumentExplorer(
  navigation: NavigationProp<RootStackParamList>,
  params: RootStackParamList['DocumentExplorer'],
): void {
  const {
    connectionId,
    connectionName,
    databaseName,
    collectionName,
    refreshAfterEdit,
  } = params;
  navigation.dispatch(
    CommonActions.reset({
      index: 2,
      routes: [
        { name: 'ConnectionsHome' },
        { name: 'Databases', params: { connectionId, connectionName } },
        {
          name: 'DocumentExplorer',
          params: {
            connectionId,
            connectionName,
            databaseName,
            collectionName,
            ...(refreshAfterEdit != null ? { refreshAfterEdit } : {}),
          },
        },
      ],
    }),
  );
}
