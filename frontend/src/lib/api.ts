import { apiFetch } from './api-client';
import type { AdminResourceInput, CurrentUser, Resource, ResourceProgress } from '../types';

export interface StorageUrlResponse {
  bucket: string;
  path: string;
  isPaid: boolean;
  url: string;
  expiresIn: number | null;
}

export interface EntitlementsResponse {
  courses: string[];
}

export interface RedemptionResponse {
  courseId: string;
  status: 'granted';
}

export interface MuxPlaybackTokenResponse {
  token: string;
  expiresAt: number;
}

export interface ResourceProgressUpdateInput {
  progressPercent?: number;
  lastPositionSeconds?: number;
  durationSeconds?: number;
  pagesViewed?: number[];
  pageCount?: number;
  completed?: boolean;
  completionSource?: ResourceProgress['completionSource'];
}

export function getResources(getToken: () => Promise<string | null>): Promise<Resource[]> {
  return apiFetch<Resource[]>('/resources', getToken, { cache: 'no-store' });
}

export function getCurrentUser(getToken: () => Promise<string | null>): Promise<CurrentUser> {
  return apiFetch<CurrentUser>('/me', getToken, { cache: 'no-store' });
}

export function createAdminResource(
  input: AdminResourceInput,
  getToken: () => Promise<string | null>,
): Promise<Resource> {
  return apiFetch<Resource>('/admin/resources', getToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateAdminResource(
  resourceId: string,
  input: AdminResourceInput,
  getToken: () => Promise<string | null>,
): Promise<Resource> {
  return apiFetch<Resource>(`/admin/resources/${encodeURIComponent(resourceId)}`, getToken, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteAdminResource(
  resourceId: string,
  getToken: () => Promise<string | null>,
): Promise<null> {
  return apiFetch<null>(`/admin/resources/${encodeURIComponent(resourceId)}`, getToken, {
    method: 'DELETE',
  });
}

export function getEntitlements(
  getToken: () => Promise<string | null>,
): Promise<EntitlementsResponse> {
  return apiFetch<EntitlementsResponse>('/me/entitlements', getToken);
}

export function redeemAccessCode(
  code: string,
  getToken: () => Promise<string | null>,
): Promise<RedemptionResponse> {
  return apiFetch<RedemptionResponse>('/entitlements/redeem', getToken, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export function getResourceProgress(
  getToken: () => Promise<string | null>,
): Promise<ResourceProgress[]> {
  return apiFetch<ResourceProgress[]>('/resources/progress', getToken, { cache: 'no-store' });
}

export function updateResourceProgress(
  resourceId: string,
  input: ResourceProgressUpdateInput,
  getToken: () => Promise<string | null>,
): Promise<ResourceProgress> {
  return apiFetch<ResourceProgress>(`/resources/${encodeURIComponent(resourceId)}/progress`, getToken, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function markResourceComplete(
  resourceId: string,
  completionSource: ResourceProgress['completionSource'],
  getToken: () => Promise<string | null>,
): Promise<ResourceProgress> {
  return apiFetch<ResourceProgress>(`/resources/${encodeURIComponent(resourceId)}/complete`, getToken, {
    method: 'POST',
    body: JSON.stringify({ completionSource }),
  });
}

export function markResourceIncomplete(
  resourceId: string,
  getToken: () => Promise<string | null>,
): Promise<ResourceProgress> {
  return apiFetch<ResourceProgress>(`/resources/${encodeURIComponent(resourceId)}/complete`, getToken, {
    method: 'DELETE',
  });
}

export function resetCourseProgress(
  courseId: string,
  getToken: () => Promise<string | null>,
): Promise<null> {
  return apiFetch<null>(`/courses/${encodeURIComponent(courseId)}/progress`, getToken, {
    method: 'DELETE',
  });
}

export function getPublicStorageUrl(
  resourceId: string,
  getToken: () => Promise<string | null>,
): Promise<StorageUrlResponse> {
  return apiFetch<StorageUrlResponse>(
    `/storage/public-url?resource_id=${encodeURIComponent(resourceId)}`,
    getToken,
  );
}

export function getPaidStorageUrl(
  resourceId: string,
  getToken: () => Promise<string | null>,
  expiresIn = 3600,
): Promise<StorageUrlResponse> {
  const query = new URLSearchParams({ resource_id: resourceId, expires_in: String(expiresIn) });
  return apiFetch<StorageUrlResponse>(`/storage/paid-url?${query.toString()}`, getToken);
}

export function getPdfThumbnailUrl(
  resourceId: string,
  getToken: () => Promise<string | null>,
): Promise<StorageUrlResponse> {
  return apiFetch<StorageUrlResponse>(
    `/storage/thumbnail-url?resource_id=${encodeURIComponent(resourceId)}`,
    getToken,
  );
}

export function getMuxPlaybackToken(
  resourceId: string,
  getToken: () => Promise<string | null>,
): Promise<MuxPlaybackTokenResponse> {
  return apiFetch<MuxPlaybackTokenResponse>(
    `/playback/mux-token?resource_id=${encodeURIComponent(resourceId)}`,
    getToken,
  );
}

export function getMuxThumbnailToken(
  resourceId: string,
  getToken: () => Promise<string | null>,
): Promise<MuxPlaybackTokenResponse> {
  return apiFetch<MuxPlaybackTokenResponse>(
    `/playback/mux-thumbnail-token?resource_id=${encodeURIComponent(resourceId)}`,
    getToken,
  );
}
