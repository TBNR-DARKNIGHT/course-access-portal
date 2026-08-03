import { useQuery } from '@tanstack/react-query';
import { usePortalAuth } from '../auth/auth-context';
import { shouldUseMockApiData } from '../auth/env';
import { getResources } from '../lib/api';
import { mockResources } from '../lib/mock-data';

export function useResources() {
  const { getToken } = usePortalAuth();
  const source = shouldUseMockApiData() ? 'mock' : 'live';

  const query = useQuery({
    queryKey: ['resources', source],
    queryFn: () => (source === 'mock' ? Promise.resolve(mockResources) : getResources(getToken)),
    staleTime: 5 * 60 * 1000,
  });

  return {
    resources: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
