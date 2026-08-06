import { clearTokens, getRefreshToken, setTokens } from '@/lib/storage';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Use the same origin by default. Next.js proxies /api to Django, which means
// cloned deployments work from any hostname without rebuilding the frontend.
const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

export const getApiBaseUrl = () => baseUrl.replace(/\/+$/, '');

let refreshRequest: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshRequest) return refreshRequest;

  const refresh = getRefreshToken();
  if (!refresh) return null;

  refreshRequest = (async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
      if (!res.ok) {
        clearTokens();
        return null;
      }
      const data = (await res.json()) as { access?: string; refresh?: string };
      if (!data.access) {
        clearTokens();
        return null;
      }
      setTokens(data.access, data.refresh || refresh);
      return data.access;
    } catch {
      return null;
    } finally {
      refreshRequest = null;
    }
  })();

  return refreshRequest;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { authToken?: string } = {}
): Promise<T> {
  const apiBaseUrl = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const proxiedPath =
    apiBaseUrl === '/api' && normalizedPath.startsWith('/api/')
      ? normalizedPath.slice('/api'.length)
      : normalizedPath;
  const url = `${apiBaseUrl}${proxiedPath}`;
  const { authToken, headers, ...rest } = init;

  const performRequest = (token?: string) => fetch(url, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {})
    }
  });

  let res: Response;
  try {
    res = await performRequest(authToken);
    if (res.status === 401 && authToken) {
      const renewedAccessToken = await refreshAccessToken();
      if (renewedAccessToken) res = await performRequest(renewedAccessToken);
    }
  } catch (error) {
    const reason = error instanceof Error && error.message ? ` (${error.message})` : '';
    throw new ApiError(
      `The browser could not reach ${url}${reason}. Please retry or sign in again.`,
      0,
      error
    );
  }

  const contentType = res.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const msg =
      typeof body === 'object' && body && 'detail' in body && typeof body.detail === 'string'
        ? body.detail
        : typeof body === 'string' && body
          ? body
          : `Request failed: ${res.status}`;
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}
