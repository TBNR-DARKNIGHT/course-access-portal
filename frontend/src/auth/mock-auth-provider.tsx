import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { PortalAuthContext } from './auth-context';
import type { PortalAuthContextValue, PortalTier, PortalUser } from './types';

const MOCK_USERS: Record<PortalTier, PortalUser> = {
  free: {
    id: 'mock-free-user',
    email: 'free@example.com',
    firstName: 'Free',
    lastName: 'Learner',
  },
  paid: {
    id: 'mock-paid-user',
    email: 'paid@example.com',
    firstName: 'Paid',
    lastName: 'Learner',
  },
  admin: {
    id: 'mock-admin-user',
    email: 'admin@example.com',
    firstName: 'Template',
    lastName: 'Admin',
  },
};

export function MockAuthProvider({ children }: { children: ReactNode }) {
  const [isSignedIn, setSignedIn] = useState(false);
  const [tier, setTier] = useState<PortalTier>('free');
  const devBearerToken = import.meta.env.VITE_DEV_BEARER_TOKEN ?? null;

  const signIn = useCallback(async (nextTier: PortalTier = 'free') => {
    setTier(nextTier);
    setSignedIn(true);
  }, []);

  const signOut = useCallback(async () => {
    setTier('free');
    setSignedIn(false);
  }, []);

  const value = useMemo<PortalAuthContextValue>(
    () => ({
      isLoaded: true,
      isSignedIn,
      user: isSignedIn ? MOCK_USERS[tier] : null,
      tier: isSignedIn ? tier : 'free',
      getToken: async () => (isSignedIn && devBearerToken ? devBearerToken : null),
      signIn,
      signOut,
    }),
    [devBearerToken, isSignedIn, signIn, signOut, tier],
  );

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
}
