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

  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(headers || {})
      }
    });
  } catch (error) {
    throw new ApiError(
      `Cannot connect to the backend through ${getApiBaseUrl()}. Please make sure Django and PostgreSQL are running.`,
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
