import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { DocumentViewMode } from '../store/settingsStore';

export type RootStackParamList = {
  ConnectionsHome: undefined;
  AddConnection: undefined;
  Databases: { connectionId: string; connectionName: string };
  DocumentExplorer: {
    connectionId: string;
    connectionName: string;
    databaseName: string;
    collectionName: string;
    refreshAfterEdit?: number;
  };
  DocumentEdit: {
    connectionId: string;
    connectionName: string;
    databaseName: string;
    collectionName: string;
    documentJson: string;
    initialViewMode: DocumentViewMode;
  };
  Settings: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
