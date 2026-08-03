import { useQuery } from '@tanstack/react-query';
import { usePortalAuth } from '../auth/auth-context';
import { shouldUseMockApiData } from '../auth/env';
import { getCurrentUser } from '../lib/api';
import type { CurrentUser } from '../types';

export function useCurrentUser() {
  const { getToken, isSignedIn, tier, user } = usePortalAuth();

  return useQuery({
    queryKey: ['current-user', shouldUseMockApiData() ? 'mock' : 'live', user?.id, tier],
    enabled: isSignedIn,
    queryFn: async (): Promise<CurrentUser> => {
      if (shouldUseMockApiData()) {
        return {
          id: user?.id ?? 'mock-user',
          clerkUserId: user?.id ?? 'mock-user',
          email: user?.email ?? null,
          role: tier === 'admin' ? 'ADMIN' : 'CLIENT',
        };
      }
      return getCurrentUser(getToken);
    },
    staleTime: 60_000,
  });
}
