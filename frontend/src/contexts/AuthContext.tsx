import { auth, isFirebaseConfigured } from '../firebase/config';
import { deleteAllUserFirestoreData, ensureUserDocument } from '../firebase/firestoreSync';
import { useConnectionStore } from '../store/connectionStore';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  /** Email/password accounts only: re-authenticates, removes Firestore + local data, then deletes the Auth user. */
  deleteAccount: (password: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      void (async () => {
        if (u) {
          try {
            await ensureUserDocument(u.uid, u.email);
          } catch (e) {
            if (__DEV__) {
              console.warn('[Needl] ensureUserDocument', e);
            }
          }
        }
        setUser(u);
        setLoading(false);
      })();
    });
    return unsub;
  }, [configured]);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const logOut = useCallback(async () => {
    await signOut(auth);
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    if (!configured) {
      throw new Error('Firebase is not configured');
    }
    const u = auth.currentUser;
    if (!u?.email) {
      throw new Error('This account cannot be deleted from the app (missing email).');
    }
    const cred = EmailAuthProvider.credential(u.email, password);
    await reauthenticateWithCredential(u, cred);
    try {
      await deleteAllUserFirestoreData(u.uid);
    } catch (e) {
      if (__DEV__) {
        console.warn('[Needl] Firestore cleanup before account delete failed (continuing)', e);
      }
    }
    await useConnectionStore.getState().clearAll();
    await deleteUser(u);
  }, [configured]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      configured,
      signIn,
      signUp,
      logOut,
      deleteAccount,
    }),
    [user, loading, configured, signIn, signUp, logOut, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
