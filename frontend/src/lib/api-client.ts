const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, '');

type ApiEnvelope<T> = {
  data?: T;
  error?: { message?: string };
  detail?: string;
  message?: string;
};

function buildApiUrl(path: string): string {
  if (!API_BASE) {
    throw new Error('VITE_API_BASE_URL is not configured');
  }
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

async function responseError(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) return `HTTP ${response.status}`;
  try {
    const json = JSON.parse(text) as ApiEnvelope<unknown>;
    return json.error?.message || json.detail || json.message || text;
  } catch {
    return text;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  const json = (await response.json()) as ApiEnvelope<T>;
  if (json.error?.message) {
    throw new Error(json.error.message);
  }
  return json.data as T;
}

export function hasApiBaseUrl(): boolean {
  return Boolean(API_BASE?.trim());
}

export async function apiFetch<T>(
  path: string,
  getToken: () => Promise<string | null>,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return parseResponse<T>(response);
}
