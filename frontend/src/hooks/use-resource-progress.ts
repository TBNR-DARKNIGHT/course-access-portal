import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalAuth } from '../auth/auth-context';
import { shouldUseMockApiData } from '../auth/env';
import {
  getResourceProgress,
  markResourceComplete,
  markResourceIncomplete,
  resetCourseProgress,
  updateResourceProgress,
  type ResourceProgressUpdateInput,
} from '../lib/api';
import { mockProgress } from '../lib/mock-data';
import type { ResourceProgress } from '../types';

function progressQueryKey(source: 'mock' | 'live', userKey: string) {
  return ['resource-progress', source, userKey] as const;
}

function mergeProgress(rows: ResourceProgress[] | undefined, next: ResourceProgress) {
  const byId = new Map((rows ?? []).map((row) => [row.resourceId, row]));
  byId.set(next.resourceId, next);
  return [...byId.values()];
}

function mockProgressRow(
  resourceId: string,
  input: ResourceProgressUpdateInput,
  userId: string,
): ResourceProgress {
  const completed = Boolean(input.completed);
  const progressPercent = completed ? 100 : Math.max(0, Math.min(100, input.progressPercent ?? 0));
  return {
    resourceId,
    userId,
    status: completed ? 'completed' : progressPercent > 0 ? 'in_progress' : 'not_started',
    completed,
    progressPercent,
    completedAt: completed ? new Date().toISOString() : undefined,
    lastAccessedAt: new Date().toISOString(),
    lastPositionSeconds: input.lastPositionSeconds,
    durationSeconds: input.durationSeconds,
    pagesViewed: input.pagesViewed,
    pageCount: input.pageCount,
    completionSource: completed ? (input.completionSource ?? 'manual') : undefined,
  };
}

export function useResourceProgress() {
  const { getToken, isLoaded, isSignedIn, user } = usePortalAuth();
  const source = shouldUseMockApiData() ? 'mock' : 'live';
  const userKey = isSignedIn ? (user?.id ?? 'signed-in') : 'guest';

  const query = useQuery({
    queryKey: progressQueryKey(source, userKey),
    enabled: isLoaded && isSignedIn,
    queryFn: () => {
      if (!isSignedIn) return Promise.resolve([]);
      if (source === 'mock') return Promise.resolve(mockProgress.filter((row) => row.userId === userKey));
      return getResourceProgress(getToken);
    },
    staleTime: 30_000,
  });

  const progress = isSignedIn ? (query.data ?? []) : [];
  const progressByResourceId = useMemo(
    () => new Map(progress.map((row) => [row.resourceId, row])),
    [progress],
  );

  return {
    progress,
    progressByResourceId,
    isLoading: isSignedIn ? query.isLoading : false,
    error: isSignedIn ? query.error : null,
  };
}

export function useResourceProgressActions(resourceId: string) {
  const { getToken, isSignedIn, user } = usePortalAuth();
  const source = shouldUseMockApiData() ? 'mock' : 'live';
  const userKey = isSignedIn ? (user?.id ?? 'signed-in') : 'guest';
  const queryKey = progressQueryKey(source, userKey);
  const queryClient = useQueryClient();

  const writeProgress = (row: ResourceProgress) => {
    queryClient.setQueryData<ResourceProgress[]>(queryKey, (rows) => mergeProgress(rows, row));
  };

  const updateProgress = useMutation({
    mutationFn: async (input: ResourceProgressUpdateInput) => {
      if (!isSignedIn) throw new Error('Sign in to save progress');
      if (source === 'mock') return mockProgressRow(resourceId, input, userKey);
      return updateResourceProgress(resourceId, input, getToken);
    },
    onSuccess: writeProgress,
  });

  const completeResource = useMutation({
    mutationFn: async (completionSource: ResourceProgress['completionSource'] = 'manual') => {
      if (!isSignedIn) throw new Error('Sign in to save progress');
      if (source === 'mock') {
        return mockProgressRow(resourceId, { completed: true, progressPercent: 100, completionSource }, userKey);
      }
      return markResourceComplete(resourceId, completionSource, getToken);
    },
    onSuccess: writeProgress,
  });

  const incompleteResource = useMutation({
    mutationFn: async () => {
      if (!isSignedIn) throw new Error('Sign in to save progress');
      if (source === 'mock') return mockProgressRow(resourceId, { progressPercent: 0 }, userKey);
      return markResourceIncomplete(resourceId, getToken);
    },
    onSuccess: writeProgress,
  });

  return { updateProgress, completeResource, incompleteResource };
}

export function useCourseProgressActions(courseId: string, resourceIds: readonly string[]) {
  const { getToken, isSignedIn, user } = usePortalAuth();
  const source = shouldUseMockApiData() ? 'mock' : 'live';
  const userKey = isSignedIn ? (user?.id ?? 'signed-in') : 'guest';
  const queryKey = progressQueryKey(source, userKey);
  const queryClient = useQueryClient();

  const resetCourse = useMutation({
    mutationFn: async () => {
      if (!isSignedIn) throw new Error('Sign in to reset progress');
      if (source === 'mock') return null;
      return resetCourseProgress(courseId, getToken);
    },
    onSuccess: () => {
      const resourceIdSet = new Set(resourceIds);
      queryClient.setQueryData<ResourceProgress[]>(queryKey, (rows) =>
        (rows ?? []).filter((row) => !resourceIdSet.has(row.resourceId)),
      );
    },
  });

  return { resetCourseProgress: resetCourse };
}
