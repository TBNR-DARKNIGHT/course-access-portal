import { ClerkProvider, useAuth, useClerk, useUser } from '@clerk/react';
import { useCallback, useMemo, type ReactNode } from 'react';
import { PortalAuthContext } from './auth-context';
import type { PortalAuthContextValue, PortalUser } from './types';

function clerkUserToPortalUser(user: ReturnType<typeof useUser>['user']): PortalUser | null {
  if (!user) return null;
  return {
    id: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
  };
}

function ClerkBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  const { openSignIn, signOut: clerkSignOut } = useClerk();

  const signIn = useCallback(async () => {
    openSignIn();
  }, [openSignIn]);

  const signOut = useCallback(async () => {
    await clerkSignOut();
  }, [clerkSignOut]);

  const value = useMemo<PortalAuthContextValue>(
    () => ({
      isLoaded: Boolean(isLoaded),
      isSignedIn: Boolean(isSignedIn),
      user: clerkUserToPortalUser(user),
      tier: 'free',
      getToken,
      signIn,
      signOut,
    }),
    [getToken, isLoaded, isSignedIn, signIn, signOut, user],
  );

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
}

export function ClerkAuthProvider({ children }: { children: ReactNode }) {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error('VITE_CLERK_PUBLISHABLE_KEY is required unless VITE_AUTH_MODE=mock');
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkBridge>{children}</ClerkBridge>
    </ClerkProvider>
  );
}
