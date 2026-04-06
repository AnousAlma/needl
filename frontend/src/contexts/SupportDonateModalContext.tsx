import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { SupportDonateModal } from '../components/SupportDonateModal';

type SupportDonateModalContextValue = {
  openSupportDonate: () => void;
  closeSupportDonate: () => void;
};

const SupportDonateModalContext = createContext<SupportDonateModalContextValue | null>(null);

export function SupportDonateModalProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const openSupportDonate = useCallback(() => setVisible(true), []);
  const closeSupportDonate = useCallback(() => setVisible(false), []);

  const value = useMemo(
    () => ({ openSupportDonate, closeSupportDonate }),
    [openSupportDonate, closeSupportDonate],
  );

  return (
    <SupportDonateModalContext.Provider value={value}>
      {children}
      <SupportDonateModal visible={visible} onClose={closeSupportDonate} />
    </SupportDonateModalContext.Provider>
  );
}

export function useSupportDonateModal(): SupportDonateModalContextValue {
  const ctx = useContext(SupportDonateModalContext);
  if (!ctx) {
    throw new Error('useSupportDonateModal must be used within SupportDonateModalProvider');
  }
  return ctx;
}
