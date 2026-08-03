import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalAuth } from '../auth/auth-context';
import { shouldUseMockApiData } from '../auth/env';
import { COURSES, PUBLIC_COURSE_IDS } from '../config/courses';
import { PRODUCT } from '../config/product';
import { getEntitlements, redeemAccessCode } from '../lib/api';

function entitlementsQueryKey(source: 'mock' | 'live', userKey: string, tier: string) {
  return ['entitlements', source, userKey, tier] as const;
}

export function useEntitlements() {
  const { getToken, isSignedIn, tier, user } = usePortalAuth();
  const source = shouldUseMockApiData() ? 'mock' : 'live';
  const userKey = isSignedIn ? (user?.id ?? 'signed-in') : 'guest';

  const query = useQuery({
    queryKey: entitlementsQueryKey(source, userKey, tier),
    enabled: source === 'mock' || isSignedIn,
    queryFn: async () => {
      if (source === 'mock') {
        const paidCourseIds = tier === 'paid' || tier === 'admin' ? COURSES.map((course) => course.id) : [];
        return { courses: [...new Set([...PUBLIC_COURSE_IDS, ...paidCourseIds])] };
      }
      return getEntitlements(getToken);
    },
    staleTime: 60_000,
  });

  const courses = [...new Set([...(query.data?.courses ?? []), ...PUBLIC_COURSE_IDS])];
  const hasCourseAccess = (courseId: string) => courses.includes(courseId);

  return {
    ...query,
    courses,
    hasCourseAccess,
  };
}

export function useRedeemAccessCode() {
  const { getToken, isSignedIn, tier, user } = usePortalAuth();
  const source = shouldUseMockApiData() ? 'mock' : 'live';
  const userKey = isSignedIn ? (user?.id ?? 'signed-in') : 'guest';
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) => {
      if (!isSignedIn) throw new Error('Sign in to redeem an access code');
      if (source === 'mock') {
        if (code.trim().toUpperCase() !== PRODUCT.mockAccessCode) {
          throw new Error(`Use ${PRODUCT.mockAccessCode} in mock mode`);
        }
        return { courseId: 'course-2', status: 'granted' as const };
      }
      return redeemAccessCode(code, getToken);
    },
    onSuccess: async ({ courseId }) => {
      queryClient.setQueryData<{ courses: string[] }>(
        entitlementsQueryKey(source, userKey, tier),
        (current) => ({ courses: [...new Set([...(current?.courses ?? []), courseId])] }),
      );
      if (source !== 'mock') {
        await queryClient.invalidateQueries({ queryKey: ['entitlements'] });
      }
      await queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}
