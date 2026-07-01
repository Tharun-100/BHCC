export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export const getApiBaseUrl = () => baseUrl.replace(/\/+$/, '');

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { authToken?: string } = {}
): Promise<T> {
  const url = `${getApiBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;
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
      `Cannot connect to backend at ${getApiBaseUrl()}. Please start Django and PostgreSQL, then try again.`,
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
