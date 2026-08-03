export type AuthMode = 'clerk' | 'mock';

export function getAuthMode(): AuthMode {
  const explicitMode = import.meta.env.VITE_AUTH_MODE?.toLowerCase();
  return explicitMode === 'mock' || import.meta.env.MODE === 'mock' ? 'mock' : 'clerk';
}

export function shouldUseMockApiData(): boolean {
  return getAuthMode() === 'mock' || Boolean(import.meta.env.DEV && !import.meta.env.VITE_API_BASE_URL);
}
